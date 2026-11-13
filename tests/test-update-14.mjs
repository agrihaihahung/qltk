// Chạy: cd tests && npm i @electric-sql/pglite@0.2.17 && node test-update-14.mjs ../supabase
// Dựng bảng giả lập trạng thái sau update-12 (có dữ liệu cũ), chạy update-13 rồi update-14 (2 lần), kiểm luồng hoàn kho.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = process.argv[2] || '../supabase';
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const fails = async (s, re) => { try { await db.exec(s); } catch (e) { await db.exec('rollback').catch(() => {}); await db.exec('reset role'); assert.match(e.message, re); return; } throw new Error('expected failure: ' + s); };
const P = JSON.stringify({ quote: { code: 'Q1' }, accessoriesIncluded: true,
  aluminum: [{ code: 'N-K55-01', qty: 5, weight: 4, price: 50000 }],
  accessories: [{ code: 'ACC', qty: 10, price: 10000, discountPercent: 0 }, { code: 'CONG', qty: 1, price: 0 }] });

await db.exec(`
create role authenticated; create role anon;
create schema auth; create function auth.jwt() returns jsonb language sql as $$ select '{"email":"kho@x"}'::jsonb $$;
create function public.my_role() returns text language sql as $$ select 'staff' $$;
create function public.is_boss() returns boolean language sql as $$ select false $$;
create table public.customers (id bigint generated always as identity primary key, code text not null default '', name text not null default '', phone text not null default '', address text not null default '', note text not null default '', opening_debt numeric not null default 0, created_at timestamptz default now(), contact text default '', email text default '', tax_code text default '');
create table public.quotes (code text primary key, customer_name text not null default '', customer_phone text not null default '', total numeric not null default 0, payload jsonb not null default '{}', created_by text, created_at timestamptz default now(), updated_at timestamptz default now(), status text not null default 'draft', exported_at timestamptz, exported_by text, customer_id bigint references public.customers(id));
create table public.customer_payments (id bigint generated always as identity primary key, customer_id bigint not null references public.customers(id), quote_code text, amount numeric not null, paid_at date default current_date, method text default '', note text default '', created_by text, created_at timestamptz default now());
create table public.requests (id uuid primary key default gen_random_uuid(), kind text, sig text unique, status text not null default 'pending', note text, party text, created_by text default 'staff@x', reviewed_by text, created_at timestamptz default now(), inv_total numeric, inv_discount numeric);
create table public.request_lines (id bigint generated always as identity primary key, request_id uuid references public.requests(id), item_id bigint, code text, name text, qty numeric, inv_amount numeric, inv_price numeric, inv_weight numeric);
create table public.movements (id bigint generated always as identity primary key, item_id bigint, code text, name text, kind text, qty numeric, note text, user_email text, created_at timestamptz default now(), voided_at timestamptz, voided_by text, void_reason text);
grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;
insert into public.customers (name, phone) values ('Anh Thái', '0905436757'), ('Chị Lan', '0911111111');
-- dữ liệu cũ: Q0 đã xuất, dòng xuất đã bị hủy trước khi có update-14 (lỗi người dùng báo)
insert into public.quotes (code, customer_name, total, status, customer_id, payload) values ('Q0','Chị Lan',330000,'exported',2,'{"aluminum":[{"code":"X1","qty":3,"weight":1,"price":100000}],"accessories":[]}');
insert into public.requests (id, kind, sig, status, party) values ('00000000-0000-0000-0000-000000000000','out','BG:Q0|a','approved','Chị Lan');
insert into public.request_lines (request_id, item_id, code, qty) values ('00000000-0000-0000-0000-000000000000', 1, 'X1', 3);
insert into public.movements (item_id, code, name, kind, qty, note, voided_at, voided_by, void_reason) values (1,'X1','Nhôm X1','out',3,'[Chị Lan] Từ báo giá Q0', now(), 'boss@x', 'Khách hủy đơn');
`);
const run = f => db.exec(fs.readFileSync(`${dir}/${f}`, 'utf8'));
await run('supabase-update-13.sql'); await run('supabase-update-14.sql'); await run('supabase-update-14.sql');

const debt = async id => Number((await q('select debt from customer_balances where id=$1', [id]))[0].debt);
const st = async c => (await q('select status, total, returned_amount, returns from quotes where code=$1', [c]))[0];
const asUser = s => db.exec('set role authenticated; ' + s + '; reset role;');

// 1. Bù dữ liệu cũ: Q0 hủy xuất toàn bộ -> Đã hoàn kho, nợ 0, chạy lại không cộng trùng
let s0 = await st('Q0');
assert.equal(s0.status, 'returned'); assert.equal(Number(s0.returned_amount), 330000); assert.equal(s0.returns.length, 1);
assert.equal(await debt(2), 0);
await asUser(`delete from quotes where code='Q0'`); // hoàn hết thì xóa được
assert.equal((await q(`select count(*)::int n from quotes where code='Q0'`))[0].n, 0);

// 2. Định giá: cộng tiền hàng 1.100.000, tổng 1.210.000 (VAT 10%) -> hệ số 1,1
await db.exec(`insert into quotes (code, customer_name, total, status, customer_id, payload) values ('Q1','Anh Thái',1210000,'confirmed',1,'${P}')`);
assert.equal(Math.round(Number((await q(`select quote_unit_value('Q1','K55-01') v`))[0].v)), 220000, 'N- được bỏ khi so mã');
assert.equal(Math.round(Number((await q(`select quote_unit_value('Q1','acc') v`))[0].v)), 11000);
assert.equal(Number((await q(`select quote_unit_value('Q1','KHONGCO') v`))[0].v), 0);

// 3. Phiếu xuất + dòng trong cùng giao dịch (trigger chạy lúc commit) -> chờ duyệt -> duyệt -> tính nợ
await db.exec(`begin; insert into requests (id,kind,sig,status,party) values ('11111111-1111-1111-1111-111111111111','out','BG:Q1|a','pending','Anh Thái');
  insert into request_lines (request_id,item_id,code,qty) values ('11111111-1111-1111-1111-111111111111',7,'K55-01',5),('11111111-1111-1111-1111-111111111111',8,'ACC',10); commit;`);
assert.equal((await st('Q1')).status, 'export_pending');
await db.exec(`update requests set status='approved' where sig='BG:Q1|a'`);
assert.equal((await st('Q1')).status, 'exported');
assert.equal(await debt(1), 1210000);
await db.exec(`insert into movements (item_id,code,name,kind,qty,note) values (7,'K55-01','Khung','out',5,'[Anh Thái] Từ báo giá Q1'),(8,'ACC','Phụ kiện','out',10,'[Anh Thái] Từ báo giá Q1')`);

// 4. Khóa nội dung báo giá đã xuất; không xóa được
await fails(`set role authenticated; update quotes set payload='{}' where code='Q1'`, /khóa nội dung/);
await fails(`set role authenticated; delete from quotes where code='Q1'`, /không xóa được/);

// 5. LỖI ĐÃ BÁO: Hủy dòng xuất trong Lịch sử kho -> trừ nợ ngay (5 × 220.000)
await db.exec(`update movements set voided_at=now(), voided_by='kho@x', void_reason='Khách trả hàng' where code='K55-01'`);
let s1 = await st('Q1');
assert.equal(Number(s1.returned_amount), 1100000); assert.equal(s1.status, 'exported');
assert.equal(s1.returns[0].source, 'void'); assert.equal(s1.returns[0].lines[0].qty, 5);
assert.equal(await debt(1), 110000);
await db.exec(`update movements set voided_at=now() where code='K55-01'`); // cập nhật lại không trừ lần 2
assert.equal(Number((await st('Q1')).returned_amount), 1100000);

// 6. Không hoàn quá số đã xuất: phiếu hoàn thêm 1 thanh K55-01 bị chặn khi duyệt, phiếu vẫn chờ duyệt
await db.exec(`begin; insert into requests (id,kind,sig,status) values ('22222222-2222-2222-2222-222222222222','in','HK:Q1|1','pending');
  insert into request_lines (request_id,item_id,code,qty) values ('22222222-2222-2222-2222-222222222222',7,'K55-01',1); commit;`);
await fails(`update requests set status='approved' where sig='HK:Q1|1'`, /đã xuất 5, đã hoàn 5/);
assert.equal((await q(`select status from requests where sig='HK:Q1|1'`))[0].status, 'pending');
await db.exec(`update requests set status='rejected' where sig='HK:Q1|1'`);

// 7. Phiếu hoàn từ báo giá (tạo + duyệt luôn trong 1 giao dịch) trả nốt phụ kiện -> hoàn toàn bộ, trừ cả dòng không quản lý kho
await db.exec(`begin; insert into requests (id,kind,sig,status,reviewed_by) values ('33333333-3333-3333-3333-333333333333','in','HK:Q1|2','approved','boss@x');
  insert into request_lines (request_id,item_id,code,qty) values ('33333333-3333-3333-3333-333333333333',8,'ACC',10); commit;`);
s1 = await st('Q1');
assert.equal(s1.status, 'returned'); assert.equal(Number(s1.returned_amount), 1210000);
assert.equal(Number(s1.returns[1].amount), 110000); assert.equal(s1.returns[1].by, 'boss@x');
assert.equal(await debt(1), 0);
assert.equal(Number((await q(`select quote_old_debt('Q9','Anh Thái','') v`))[0].v), 0);

// 8. Đã hoàn toàn bộ: không xuất tiếp, không hoàn thêm; xóa được
await fails(`insert into requests (kind,sig,status) values ('out','BG:Q1|b','pending')`, /hoàn kho toàn bộ/);
await fails(`insert into requests (kind,sig,status) values ('in','HK:Q1|3','approved')`, /hoàn kho toàn bộ|không hoàn thêm/);
await fails(`set role authenticated; update quotes set status='draft' where code='Q1'`, /không đổi tay/);
await asUser(`delete from quotes where code='Q1'`);

// 9. Nối theo phiếu BG khi ghi chú không có mã báo giá (cùng mã hàng + số lượng + tên khách)
await db.exec(`insert into quotes (code,customer_name,total,status,customer_id,payload) values ('Q3','Chị Lan',200000,'confirmed',2,'{"aluminum":[{"code":"Z9","qty":2,"weight":1,"price":100000}]}');
  begin; insert into requests (id,kind,sig,status,party) values ('44444444-4444-4444-4444-444444444444','out','BG:Q3|a','approved','Chị Lan');
  insert into request_lines (request_id,item_id,code,qty) values ('44444444-4444-4444-4444-444444444444',9,'Z9',2); commit;
  insert into movements (item_id,code,name,kind,qty,note) values (9,'Z9','Z9','out',2,'Xuất cho Chị Lan');`);
assert.equal(await debt(2), 200000);
await db.exec(`update movements set voided_at=now() where code='Z9'`);
assert.equal((await st('Q3')).status, 'returned');
assert.equal(await debt(2), 0);

// 10. Hủy dòng xuất không thuộc báo giá nào: không ảnh hưởng
await db.exec(`insert into movements (item_id,code,kind,qty,note) values (5,'K','out',1,'Xuất lẻ'); update movements set voided_at=now() where note='Xuất lẻ'`);
console.log('ALL 10 SCENARIOS PASS');
