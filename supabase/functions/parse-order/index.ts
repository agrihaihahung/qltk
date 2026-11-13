// Supabase Edge Function: parse-order
// Nhận ảnh phiếu báo đơn hàng, trả về JSON các dòng hàng.
// Cần secret: ANTHROPIC_API_KEY  (Edge Functions > Secrets)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Nhập kho từ ảnh (mode "receipt"): giữ nguyên lời nhắc cũ, chỉ lấy mã, màu, số lượng.
const PROMPT = `Đây là ảnh "Phiếu báo đơn hàng" của cửa hàng nhôm. Hãy trích xuất và CHỈ trả về một đối tượng JSON, không kèm giải thích hay markdown, đúng dạng:
{"customer":"tên khách ở mục Họ và Tên","date":"dd/mm/yyyy lấy từ dòng Ngày ... Tháng ... Năm ...","lines":[{"code":"Mã hàng","color":"Màu nhôm hoặc rỗng","qty":0}]}
Quy tắc:
- Chỉ lấy các dòng hàng có số thứ tự, gồm cả nhóm thanh nhôm lẫn nhóm Phụ kiện. Bỏ qua dòng tiêu đề nhóm màu xanh, dòng TỔNG CỘNG, Công nợ cũ, Đã thanh toán, Tổng giá trị đơn hàng và bảng Đơn giá.
- "code" chép chính xác từng ký tự ở cột Mã hàng (giữ nguyên chữ hoa/thường, dấu gạch ngang, tiền tố như G-).
- "qty" là số ở cột Số lượng (không phải Kg/thanh, Tổng KL, đơn giá hay thành tiền).
- Nếu không đọc rõ một giá trị, để chuỗi rỗng hoặc 0 thay vì đoán.`;

// Xuất kho từ ảnh: lấy thêm tên hàng, đơn giá, thành tiền, chiết khấu, tổng giá trị đơn.
const PROMPT_OUT = `Đây là ảnh "Phiếu báo đơn hàng" của cửa hàng nhôm. Hãy trích xuất và CHỈ trả về một đối tượng JSON, không kèm giải thích hay markdown, đúng dạng:
{"customer":"tên khách ở mục Họ và Tên","date":"dd/mm/yyyy lấy từ dòng Ngày ... Tháng ... Năm ...","lines":[{"code":"Mã hàng","name":"Tên hàng","color":"Màu nhôm hoặc rỗng","qty":0,"unit":"","price":null,"weight":null,"amount":null}],"discount":0,"total":null}
Quy tắc:
- Chỉ lấy các dòng hàng có số thứ tự, gồm cả nhóm thanh nhôm lẫn nhóm Phụ kiện, theo đúng thứ tự trên phiếu. Bỏ qua dòng tiêu đề nhóm màu xanh, dòng TỔNG CỘNG, Công nợ cũ, Đã thanh toán, Tổng giá trị đơn hàng và bảng Đơn giá ở góc phiếu (Kogen, Kenwin, T6, UltraSlim). Không đưa các dòng đó vào "lines". Dòng vận chuyển nếu có số thứ tự thì vẫn đưa vào với code "VC".
- "code" chép chính xác từng ký tự ở cột Mã hàng (giữ nguyên chữ hoa/thường, dấu gạch ngang, tiền tố như G-).
- "name" là cột Tên hàng, quy cách.
- "qty" là số ở cột Số lượng (không phải Kg/thanh, Tổng KL, đơn giá hay thành tiền).
- "unit" là đơn vị tính của dòng (thanh, cây, chiếc, bộ, hộp, cái, kg, m, ...) nếu phiếu có cột ĐVT hoặc ghi đơn vị ngay cạnh số lượng, chép đúng như in trên phiếu. Không thấy thì để chuỗi rỗng, không đoán.
- "price" là số ở cột Đơn giá của chính dòng đó, đúng như in trên phiếu, không quy đổi (nhôm thanh thường tính đ/kg, phụ kiện tính đ/chiếc). Không có thì null.
- "weight" là số ở cột Tổng KL (kg) của dòng. Không có thì null.
- "amount" là số ở cột Thành tiền của dòng, đúng như in trên phiếu, KHÔNG tự tính lại. Nếu dòng có chiết khấu riêng thì lấy số sau chiết khấu như in.
- "discount" là tổng số tiền chiết khấu của cả phiếu (số dương) nếu phiếu có mục Chiết khấu hoặc Giảm giá. Không có thì 0. Không đưa chiết khấu vào "lines".
- "total" là số ở mục "Tổng giá trị đơn hàng" (chưa cộng Công nợ cũ, không phải số còn phải thanh toán). Không thấy thì null.
- Số viết thành số JSON thuần, không dấu phân cách nghìn: "12.667.200" là 12667200, "15,08" là 15.08.
- Nếu không đọc rõ một giá trị, để chuỗi rỗng, 0 hoặc null thay vì đoán.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    // Chỉ người đã đăng nhập mới được gọi
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
    if (!user) return json({ error: "Chưa đăng nhập" }, 401);

    const { image, mediaType, mode } = await req.json();
    if (!image) return json({ error: "Thiếu ảnh" }, 400);

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return json({ error: "Chưa cấu hình ANTHROPIC_API_KEY" }, 500);

    const isOut = mode !== "receipt";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: isOut ? 8000 : 2000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: image } },
            { type: "text", text: isOut ? PROMPT_OUT : PROMPT },
          ],
        }],
      }),
    });
    const out = await r.json();
    if (!r.ok) return json({ error: out?.error?.message ?? "Lỗi dịch vụ đọc ảnh" }, 502);

    const text = (out.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("");
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: "Không đọc được kết quả từ ảnh" }, 502);
    return json(JSON.parse(m[0]));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
