// Chạy: cd tests && npm i @electric-sql/pglite@0.2.17 && node test-update-15.mjs ../supabase
// Dựng bảng giả lập (lấy lại phần dựng bảng của test-update-14, thêm items / source / doc_date),
// chạy update-13, 14, 15 (15 chạy 2 lần), kiểm: công nợ phiếu xuất ảnh, hủy dòng xuất trừ nợ, bảng quy đổi đơn vị.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = process.argv[2] || '../supabase';
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const fails = async (s, re) => { try { await db.exec(s); } catch (e) { await db.exec('rollback').catch(() => {}); await db.exec('reset role'); assert.match(e.message, re); return; } throw new Error('expected failure: ' + s); };

// Lấy khối dựng bảng giả lập từ test 14 để hai test luôn cùng một schema nền
const t14 = fs.readFileSync(new URL('./test-update-14.mjs', import.meta.url), 'utf8');
const base = t14.match(/await db\.exec\(`\n([\s\S]*?)`\);\nconst run/)[1];
await db.exec(base);
await db.exec(`
alter table public.requests add column if not exists source text;
alter table public.requests add column if not exists doc_date text;
create table public.items (id bigint generated always as identity primary key, code text, name text, unit text, qty numeric default 0);
insert into public.items (code, name, unit) values ('A1','Phụ kiện A1','chiếc'), ('B2','Nhôm B2','thanh'), ('ACC','Phụ kiện ACC','chiếc');
update public.requests set created_by = 'kho@x';
alter table public.requests alter column created_by set default 'kho@x';
`);
const run = f => db.exec(fs.readFileSync(`${dir}/${f}`, 'utf8'));
await run('supabase-update-13.sql'); await run('supabase-update-14.sql');
await run('supabase-update-15.sql'); await run('supabase-update-15.sql'); // chạy lại không lỗi

const debt = async id => Number((await q('select debt from customer_balances where id=$1', [id]))[0].debt);
const REQ = '55555555-5555-5555-5555-555555555555';

// 1. Phiếu xuất ảnh đã duyệt nhưng CHƯA gán khách -> không tính nợ (đúng lỗi người dùng báo)
await db.exec(`begin;
  insert into requests (id, kind, source, sig, status, party, inv_total, inv_discount) values ('${REQ}','out','image','IMG|1','approved','Anh Thái',1100000,0);
  insert into request_lines (request_id, item_id, code, qty, inv_amount) values ('${REQ}',1,'A1',10,600000),('${REQ}',2,'B2',5,400000);
  commit;`);
assert.equal(await debt(1), 0);

// 2. Gán khách + đơn vị bán: nợ = tổng phiếu 1.100.000 (gồm vận chuyển), ghi sale_unit
const r = (await q(`select save_order_sale(null,'IMG|1',1,true,'[{"code":"A1","sale_qty":1,"sale_unit":"hộp","sale_factor":10},{"code":"B2","sale_qty":5,"sale_unit":"thanh","sale_factor":1}]'::jsonb) r`))[0].r;
assert.equal(r.mode, 'count'); assert.equal(r.lines, 2);
assert.equal(await debt(1), 1100000);
const ln = await q(`select code, sale_qty, sale_unit, sale_factor from request_lines where request_id='${REQ}' order by id`);
assert.equal(ln[0].sale_unit, 'hộp'); assert.equal(Number(ln[0].sale_factor), 10);
assert.equal((await q(`select order_count::int n, order_sales::numeric s from customer_balances where id=1`))[0].n, 1);
assert.equal(Number((await q(`select quote_old_debt('QX','Anh Thái','') v`))[0].v), 1100000, 'nợ cũ trên báo giá gồm cả phiếu xuất ảnh');

// 3. Phiếu chờ duyệt không tính nợ; duyệt xong mới tính
await db.exec(`begin;
  insert into requests (id, kind, source, sig, status, party, inv_total) values ('66666666-6666-6666-6666-666666666666','out','image','IMG|2','pending','Anh Thái',200000);
  insert into request_lines (request_id, item_id, code, qty, inv_amount) values ('66666666-6666-6666-6666-666666666666',1,'A1',2,200000); commit;`);
await db.exec(`select save_order_sale(null,'IMG|2',1,true,'[]'::jsonb)`);
assert.equal(await debt(1), 1100000);
await db.exec(`update requests set status='approved' where sig='IMG|2'`);
assert.equal(await debt(1), 1300000);
await db.exec(`update requests set status='cancelled' where sig='IMG|2'`);
assert.equal(await debt(1), 1100000, 'hủy phiếu -> không tính nữa');

// 4. Không gán nợ cho phiếu BG / không phải ảnh
await fails(`select save_order_sale('${REQ}',null,null,true,'[]'::jsonb)`, /Chọn khách hàng/);
await db.exec(`insert into requests (kind, source, sig, status) values ('out','manual','MAN|1','approved')`);
await fails(`select save_order_sale(null,'MAN|1',1,true,'[]'::jsonb)`, /Chỉ phiếu xuất kho từ ảnh/);

// 5. Hủy dòng xuất ảnh -> trừ nợ theo tỷ lệ: A1 10/10, 600.000 × (1.100.000 / 1.000.000) = 660.000
await db.exec(`insert into movements (item_id, code, name, kind, qty, note) values (1,'A1','A1','out',10,'Xuất ảnh'),(2,'B2','B2','out',5,'Xuất ảnh')`);
await db.exec(`update movements set voided_at=now(), voided_by='kho@x', void_reason='Khách trả' where code='A1'`);
assert.equal(await debt(1), 440000);
await db.exec(`update movements set voided_at=now() where code='A1'`);  // cập nhật lại không trừ lần 2
assert.equal(await debt(1), 440000);
// hủy nốt dòng còn lại -> trừ hết phần còn lại (kể cả phần vận chuyển làm tròn)
await db.exec(`update movements set voided_at=now(), voided_by='kho@x' where code='B2'`);
assert.equal(await debt(1), 0);
assert.equal((await q(`select count(*)::int n from order_debt_adjust where request_id='${REQ}'`))[0].n, 2);

// 6. Chọn "không tính công nợ" -> debt_mode = skip, không phát sinh nợ
await db.exec(`begin;
  insert into requests (id, kind, source, sig, status, party, inv_total) values ('77777777-7777-7777-7777-777777777777','out','image','IMG|3','approved','Khách lẻ',500000);
  insert into request_lines (request_id, item_id, code, qty, inv_amount) values ('77777777-7777-7777-7777-777777777777',1,'A1',5,500000); commit;`);
await db.exec(`select save_order_sale(null,'IMG|3',null,false,'[]'::jsonb)`);
assert.equal((await q(`select debt_mode from requests where sig='IMG|3'`))[0].debt_mode, 'skip');
assert.equal(await debt(1), 0); assert.equal(await debt(2), 0);

// 7. Gán sau cho phiếu cũ: chỉ quản lý
await fails(`set role authenticated; select set_order_debt('77777777-7777-7777-7777-777777777777', 2, true)`, /Chỉ quản lý/);
await db.exec(`create or replace function public.is_boss() returns boolean language sql as $$ select true $$`);
await db.exec(`select set_order_debt('77777777-7777-7777-7777-777777777777', 2, true)`);
assert.equal(await debt(2), 500000);
assert.equal((await q(`select count(*)::int n from customer_image_orders(2)`))[0].n, 1);
await db.exec(`select set_order_debt('77777777-7777-7777-7777-777777777777', null, false)`);
assert.equal(await debt(2), 0);
await db.exec(`create or replace function public.is_boss() returns boolean language sql as $$ select false $$`);

// 8. Bảng quy đổi đơn vị
await db.exec(`insert into item_units (item_id, unit, factor) values (1, '  hộp ', 100), (1, 'Bộ', 2)`);
assert.equal((await q(`select unit from item_units where item_id=1 order by unit`)).map(x => x.unit).join(','), 'Bộ,hộp');
await fails(`insert into item_units (item_id, unit, factor) values (1, 'HỘP', 50)`, /duplicate key|item_units_uq/);
await fails(`insert into item_units (item_id, unit, factor) values (1, 'Chiếc', 1)`, /trùng với đơn vị kho/);
await fails(`insert into item_units (item_id, unit, factor) values (1, 'cặp', 0)`, /check|factor/);
await fails(`set role authenticated; insert into order_debt_adjust (request_id, ref, amount) values ('${REQ}','x',1)`, /policy|permission/);

// 9. Giá trị trừ nợ khi hoàn kho chia theo số lượng KHO: báo giá 10 hộp ACC (100.000 / hộp... tổng 100.000), 1 hộp = 100 chiếc
await db.exec(`insert into quotes (code, customer_name, total, status, customer_id, payload) values ('Q1','Anh Thái',100000,'confirmed',1,'{"aluminum":[],"accessories":[{"code":"ACC","qty":10,"price":10000,"discountPercent":0}]}')`);
assert.equal(Math.round(Number((await q(`select quote_unit_value('Q1','ACC') v`))[0].v)), 10000, 'chưa quy đổi: như cũ');
await db.exec(`begin; insert into requests (id,kind,source,sig,status,party) values ('88888888-8888-8888-8888-888888888888','out','quote','BG:Q1|a','approved','Anh Thái');
  insert into request_lines (request_id,item_id,code,qty,sale_qty,sale_unit,sale_factor) values ('88888888-8888-8888-8888-888888888888',3,'ACC',1000,10,'hộp',100); commit;`);
assert.equal(Math.round(Number((await q(`select quote_unit_value('Q1','ACC') v`))[0].v)), 100, 'sau quy đổi: 100 đ / chiếc');
assert.equal(await debt(1), 100000, 'phiếu BG không bị tính trùng bởi cơ chế phiếu ảnh');
await db.exec(`insert into movements (item_id,code,name,kind,qty,note) values (3,'ACC','ACC','out',1000,'Từ báo giá Q1')`);
await db.exec(`update movements set voided_at=now(), voided_by='kho@x' where code='ACC'`);
assert.equal(await debt(1), 0, 'trả đủ 1000 chiếc = 10 hộp -> nợ đơn về 0');

console.log('ALL SCENARIOS PASS');
