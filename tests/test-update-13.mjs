// Chạy: cd tests && npm i @electric-sql/pglite@0.2.17 && node test-update-13.mjs ../supabase/supabase-update-13.sql
// Chạy supabase-update-13.sql trên Postgres (PGlite) với bảng giả lập trạng thái sau update-12, rồi kiểm luồng.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const sqlFile = process.argv[2];
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const fails = async (s, re) => { try { await db.exec(s); } catch (e) { assert.match(e.message, re); return; } throw new Error('expected failure: ' + s); };

await db.exec(`
create role authenticated; create role anon;
create schema auth; create function auth.jwt() returns jsonb language sql as $$ select '{"email":"staff@x"}'::jsonb $$;
create function public.my_role() returns text language sql as $$ select 'staff' $$;
create function public.is_boss() returns boolean language sql as $$ select false $$;
create table public.customers (id bigint generated always as identity primary key, code text not null default '', name text not null default '', phone text not null default '', address text not null default '', note text not null default '', opening_debt numeric not null default 0, created_at timestamptz default now(), contact text default '', email text default '', tax_code text default '');
create table public.quotes (code text primary key, customer_name text not null default '', customer_phone text not null default '', total numeric not null default 0, payload jsonb not null default '{}', created_by text, created_at timestamptz default now(), updated_at timestamptz default now(), status text not null default 'draft', exported_at timestamptz, exported_by text, customer_id bigint references public.customers(id));
create table public.customer_payments (id bigint generated always as identity primary key, customer_id bigint not null references public.customers(id), quote_code text, amount numeric not null, paid_at date default current_date, method text default '', note text default '', created_by text, created_at timestamptz default now());
create table public.requests (id uuid primary key default gen_random_uuid(), kind text, sig text unique, status text not null default 'pending', note text, party text, created_by text default 'staff@x', reviewed_by text, created_at timestamptz default now(), inv_total numeric, inv_discount numeric);
create table public.request_lines (id bigint generated always as identity primary key, request_id uuid references public.requests(id), item_id bigint, code text, name text, qty numeric, inv_amount numeric, inv_price numeric, inv_weight numeric);
grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;
insert into public.customers (name, phone, opening_debt) values ('Anh Thái', '0905436757', 100), ('Chị Lan', '0911111111', 0);
insert into public.quotes (code, customer_name, total, status, customer_id) values ('Q1','Anh Thái',1000,'confirmed',1), ('Q2','Anh Thái',400,'draft',1), ('QOLD','Chị Lan',50,'exported',2);
insert into public.customer_payments (customer_id, amount) values (1, 50);
`);
const sql = fs.readFileSync(sqlFile, 'utf8');
await db.exec(sql); await db.exec(sql); // chạy lại được

const debt = async id => Number((await q('select debt from customer_balances where id=$1', [id]))[0].debt);
const st = async c => (await q('select status, returned_amount, returns from quotes where code=$1', [c]))[0];
const asUser = s => db.exec('set role authenticated; ' + s + '; reset role;').finally(() => db.exec('reset role'));
const failsUser = (s, re) => fails('set role authenticated; ' + s, re).finally(() => db.exec('reset role'));

// 1. Đã chốt chưa tính công nợ: 100 đầu kỳ − 50 đã trả
assert.equal(await debt(1), 50);
// 2. Web không tự đặt trạng thái xuất kho / tạo sẵn / sửa hoàn
await failsUser(`update quotes set status='exported' where code='Q1'`, /do kho cập nhật/);
await failsUser(`insert into quotes (code,status) values ('QX','exported')`, /không được tạo sẵn/);
await asUser(`update quotes set status='cancelled' where code='Q2'`); // trạng thái thường vẫn đổi được
await asUser(`update quotes set status='draft' where code='Q2'`);
// 3. Gửi phiếu xuất -> chờ duyệt, chưa tính nợ, không xóa được
await db.exec(`insert into requests (kind,sig,status) values ('out','BG:Q1|a',  'pending')`);
assert.equal((await st('Q1')).status, 'export_pending');
assert.equal(await debt(1), 50);
await failsUser(`delete from quotes where code='Q1'`, /không xóa được/);
// 4. Từ chối -> về đã chốt; phiếu mới duyệt -> đã xuất, tính nợ
await db.exec(`update requests set status='rejected' where sig='BG:Q1|a'`);
assert.equal((await st('Q1')).status, 'confirmed');
await db.exec(`insert into requests (kind,sig,status) values ('out','BG:Q1|b','pending'); update requests set status='approved' where sig='BG:Q1|b'`);
assert.equal((await st('Q1')).status, 'exported');
assert.equal(await debt(1), 1050);
// 5. Đã xuất: không sửa tổng, lưu lại cùng tổng thì được (upsert như bridge.saveQuote)
await failsUser(`update quotes set total=900 where code='Q1'`, /không sửa được giá trị/);
await asUser(`insert into quotes (code,customer_name,total,payload) values ('Q1','Anh Thái',1000,'{"x":1}') on conflict (code) do update set total=excluded.total, payload=excluded.payload`);
await failsUser(`update quotes set returned_amount=10 where code='Q1'`, /chỉ cập nhật khi kho duyệt/);
// 6. Hoàn kho chờ duyệt: ghi giá trước, duyệt sau -> trừ nợ 300, có chi tiết dòng
await db.exec(`insert into requests (kind,sig,status,note) values ('in','HK:Q1|1','pending','Hoàn kho báo giá Q1 · Khách trả hàng');
  insert into request_lines (request_id,item_id,code,name,qty) select id,7,'K55-01','Khung',2 from requests where sig='HK:Q1|1';
  update request_lines set inv_amount=300 where code='K55-01'; update requests set inv_total=300 where sig='HK:Q1|1'`);
assert.equal(Number((await st('Q1')).returned_amount), 0, 'pending chưa trừ');
await db.exec(`update requests set status='approved', reviewed_by='boss@x' where sig='HK:Q1|1'`);
let s1 = await st('Q1');
assert.equal(Number(s1.returned_amount), 300);
assert.equal(s1.returns.length, 1);
assert.equal(s1.returns[0].lines[0].code, 'K55-01');
assert.equal(s1.returns[0].by, 'boss@x');
assert.equal(await debt(1), 750);
// 7. Không cộng trùng khi phiếu cập nhật lại
await db.exec(`update requests set inv_total=301 where sig='HK:Q1|1'; update requests set inv_total=300 where sig='HK:Q1|1'`);
assert.equal(Number((await st('Q1')).returned_amount), 300);
// 8. Phiếu tự duyệt khi tạo (quản lý), giá ghi sau -> vẫn trừ
await db.exec(`insert into requests (kind,sig,status) values ('in','HK:Q1|2','approved'); update requests set inv_total=200 where sig='HK:Q1|2'`);
assert.equal(Number((await st('Q1')).returned_amount), 500);
// 9. Hoàn vượt giá trị đơn -> chặn ở tổng đơn; hiển thị đúng số đã trừ
await db.exec(`insert into requests (kind,sig,status,inv_total) values ('in','HK:Q1|3','pending',900); update requests set status='approved' where sig='HK:Q1|3'`);
s1 = await st('Q1');
assert.equal(Number(s1.returned_amount), 1000);
assert.equal(Number(s1.returns[2].amount), 500);
assert.equal(await debt(1), 50);
// 10. Công nợ cũ cho báo giá đang soạn: không tính chính báo giá đó; tìm theo tên hoặc SĐT
await db.exec(`update requests set status='rejected' where false`);
assert.equal(Number((await q(`select quote_old_debt('Q2','  anh   thái ','') v`))[0].v), 50);
assert.equal(Number((await q(`select quote_old_debt('NEW','Tên khác','ĐT 0905436757') v`))[0].v), 50);
assert.equal(Number((await q(`select quote_old_debt('NEW','Không có','') v`))[0].v), 0);
await db.exec(`insert into requests (kind,sig,status) values ('out','BG:Q2|a','approved')`);
assert.equal(await debt(1), 450);
assert.equal(Number((await q(`select quote_old_debt('Q2','Anh Thái','') v`))[0].v), 50, 'trừ chính Q2');
await db.exec('set role authenticated'); assert.equal(Number((await q(`select quote_old_debt('Q1','Anh Thái','') v`))[0].v), 450, 'Q1 đã hoàn hết nên không trừ thêm'); await db.exec('reset role');
// 11. Dữ liệu cũ: exported không có phiếu vẫn giữ (để kiểm tra tay), nợ Chị Lan = 50
assert.equal(await debt(2), 50);
// 12. resolve_customer vẫn tạo khách mới khi chưa có
const nid = (await q(`select resolve_customer('Khách Mới','0999999999','') id`))[0].id;
assert.ok(Number(nid) >= 3);
console.log('ALL 12 SCENARIOS PASS');
