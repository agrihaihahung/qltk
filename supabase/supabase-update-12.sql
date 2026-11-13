-- =====================================================================
-- CẬP NHẬT SUPABASE 12: lưu đơn giá, thành tiền, chiết khấu, tổng tiền của phiếu xuất kho từ ảnh
-- Chạy SAU supabase-update-11.sql. Chạy lại nhiều lần được.
-- Chỉ THÊM cột + 1 hàm mới; không sửa submit_request / approve_request.
-- Giá lưu đúng như in trên phiếu: nhôm thanh tính đ/kg, phụ kiện tính đ/chiếc;
-- thành tiền lấy từ phiếu, không tự tính lại.
-- =====================================================================
do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'request_lines' and column_name = 'request_id') then
    raise exception 'request_lines không có cột request_id. Hãy gửi tên cột khóa ngoại tới bảng requests để chỉnh file này.';
  end if;
end $$;

alter table public.request_lines
  add column if not exists inv_price  numeric,   -- đơn giá trên phiếu (nhôm: đ/kg, phụ kiện: đ/chiếc)
  add column if not exists inv_amount numeric,   -- thành tiền của dòng trên phiếu
  add column if not exists inv_weight numeric;   -- tổng khối lượng (kg) của dòng, nếu phiếu có
alter table public.requests
  add column if not exists inv_discount numeric, -- tổng chiết khấu của cả phiếu
  add column if not exists inv_total    numeric; -- tổng giá trị đơn hàng ghi trên phiếu

-- Ghi giá cho phiếu vừa tạo. Tìm phiếu theo p_id; nếu không có thì theo chữ ký p_sig.
-- p_lines: [{code, price, amount, weight}] đúng thứ tự dòng đã gửi cho submit_request.
-- Trả về số dòng đã ghi được giá.
create or replace function public.save_order_pricing(p_id uuid, p_sig text, p_discount numeric, p_total numeric, p_lines jsonb)
returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_by text; v_at timestamptz; v_line bigint; r record; n int := 0; k int;
begin
  if public.my_role() not in ('admin','approver','staff') then raise exception 'Bạn không có quyền ghi giá phiếu'; end if;
  if coalesce(p_discount, 0) < 0 or coalesce(p_total, 0) < 0 then raise exception 'Chiết khấu và tổng tiền không được âm'; end if;
  if p_id is not null then
    select id, created_by, created_at into v_id, v_by, v_at from public.requests where id = p_id;
  else
    select id, created_by, created_at into v_id, v_by, v_at from public.requests where sig = p_sig order by created_at desc limit 1;
  end if;
  if v_id is null then raise exception 'Không tìm thấy phiếu để ghi giá'; end if;
  if not public.is_boss() and (v_by is distinct from (auth.jwt() ->> 'email') or v_at < now() - interval '30 minutes') then
    raise exception 'Chỉ ghi giá được cho phiếu do bạn vừa tạo';
  end if;

  update public.requests set inv_discount = p_discount, inv_total = p_total where id = v_id;

  for r in select value as e, ord from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) with ordinality as t(value, ord) loop
    select id into v_line from public.request_lines where request_id = v_id order by id offset (r.ord - 1) limit 1;
    -- chỉ ghi khi đúng mã ở đúng vị trí, tránh gán nhầm giá sang dòng khác
    update public.request_lines
       set inv_price  = nullif(r.e ->> 'price', '')::numeric,
           inv_amount = nullif(r.e ->> 'amount', '')::numeric,
           inv_weight = nullif(r.e ->> 'weight', '')::numeric
     where id = v_line and upper(code) = upper(coalesce(r.e ->> 'code', ''));
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end $$;
revoke all on function public.save_order_pricing(uuid, text, numeric, numeric, jsonb) from public, anon;
grant execute on function public.save_order_pricing(uuid, text, numeric, numeric, jsonb) to authenticated;

notify pgrst, 'reload schema';
