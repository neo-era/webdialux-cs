// Chuyển Excel "thô" (bảng tổng hợp khảo sát / kết quả chạy DIALux: tiêu đề ở dòng bất kỳ, nhiều dòng phương án đèn cho một tuyến)
// → các dòng dữ liệu đúng mẫu sheet DU LIEU TUYEN để app chạy.
// Nguyên tắc: CHỈ chép thông số đầu vào (thông tin tuyến, phân cấp, hình học, tư thế lắp đặt) — cột cùng tên với file mẫu;
// mọi cột kết quả / yêu cầu QCVN / điểm / xếp hạng / đèn được chọn bị bỏ qua. Mỗi tuyến 1 dòng, để trống bộ đèn
// (app tự quét toàn bộ thư mục IES); góc nghiêng lấy theo dòng có "Loại đèn được chọn" (không có → dòng đầu của tuyến).
import { TEMPLATE_HEAD } from "./template.mjs";
import { COLS } from "./mapping.mjs";
import { arrangementKind } from "./geometry.mjs";

/** Chuẩn hoá tiêu đề để so khớp: chữ thường, gộp khoảng trắng/xuống dòng, bỏ "*", bỏ chú thích "(làm tròn)", bỏ cách quanh "/". */
export function normHead(s) {
  return String(s ?? "").normalize("NFC").toLowerCase()
    .replace(/\(làm tròn\)/g, "").replace(/\*/g, "")
    .replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
}

// tên khác nhau giữa file thô và file mẫu (đã chuẩn hoá) → tên cột mẫu
const ALIAS = {
  "số lượng đèn sở duyệt (bộ)": "SL đèn Sở duyệt (bộ)",
  "số lượng đèn trình sở (bộ)": "SL đèn trình Sở (bộ)",
  "khoảng cách trụ trung bình (m)": COLS.spacing,
  "khoảng cách trụ tb (m)": COLS.spacing,
  "khoảng cách từ trụ đến mép đường (m)": COLS.setback,
  "dải phân cách giữa (có hoặc không)": COLS.dpc,
  "lưu lượng xe (nhiều hay ít)": COLS.luuluong,
  "tên nhà cung cấp": COLS.ncc,
  "công suất đèn led được chọn (w)": COLS.power,
  "độ rộng vỉa hè mỗi bên (m)": COLS.sidewalk,
};
// cột bộ đèn: không chép (tuyến để trống bộ đèn → app tự chọn từ thư mục IES)
const LAMP_COLS = new Set([COLS.fitting, COLS.model, COLS.ncc, COLS.power, "CCT (K)", "CRI"]);
// cột góc nghiêng thuộc từng dòng đèn
const PER_LAMP = new Set([COLS.tilt]);
// thông số bắt buộc để app tính được (thiếu → cảnh báo + tô vàng ô trong file xuất)
const REQUIRED = [COLS.H, COLS.width, COLS.spacing];

const TEMPLATE_KEY = new Map(TEMPLATE_HEAD.map((h) => [normHead(h), h]));
function headToTemplate(h) {
  const n = normHead(h);
  if (!n) return null;
  if (TEMPLATE_KEY.has(n)) return TEMPLATE_KEY.get(n);
  if (ALIAS[n]) return ALIAS[n];
  // tiêu đề có phần chú thích dài trong ngoặc chưa đóng, vd "Đường kính đầu cần (D49/ D60…"
  const base = n.replace(/\s*\(.*$/, "");
  if (base === "đường kính đầu cần") return "Đường kính đầu cần";
  if (base === "stt") return "STT";
  return null;
}

/** Ánh xạ hàng tiêu đề → {map: {chỉ số cột: tên cột mẫu}, ignored: [{col, head}], chosenCol}. Cột trùng tên: lấy lần xuất hiện đầu. */
export function mapHeaders(heads) {
  const map = {}, used = new Set(), ignored = [];
  let chosenCol = -1, rankCol = -1;
  const fittings = [];
  heads.forEach((h, i) => {
    if (h == null || String(h).trim() === "") return;
    const n = normHead(h);
    if (n === "loại đèn được chọn") { chosenCol = i; ignored.push({ col: i, head: String(h).trim() }); return; }
    if (n === "xếp hạng" && rankCol < 0) rankCol = i;
    if (n === "fitting") fittings.push(i);
    const t = headToTemplate(h);
    if (t && !used.has(t)) { map[i] = t; used.add(t); }
    else ignored.push({ col: i, head: String(h).trim() });
  });
  // cột "Fitting" thứ hai (sau "Loại đèn được chọn") = fitting của đèn được chọn
  const chosenFitCol = fittings.find((i) => i > chosenCol && chosenCol >= 0) ?? -1;
  return { map, ignored, chosenCol, rankCol, fitCol: fittings[0] ?? -1, chosenFitCol };
}

const XL_ERR = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!)$/;
const blank = (v) => v == null || (typeof v === "string" && (v.trim() === "" || XL_ERR.test(v.trim())));
const clean = (v) => {
  if (typeof v !== "string") return v;
  const t = v.replace(/\s+/g, " ").trim();
  return /^-?\d+([.,]\d+)?$/.test(t) ? parseFloat(t.replace(",", ".")) : t;     // số ghi dạng chữ ("9,5") → số
};
const key = (v) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const GEO_COLS = [COLS.H, COLS.width, COLS.spacing, COLS.vuon, COLS.setback, COLS.lanes];
const ARR_KNOWN = /giữa|giua|center|median|so le|stagger|đối xứng|doi xung|hai bên|2 bên|1 bên|một bên|mot ben|một phía|1 phía/i;
const ARR_CANON = { single: "1 bên", opposite: "đối xứng", staggered: "so le", center: "giữa" };

/**
 * sheets: [{name, aoa}] (aoa = mảng các hàng, mỗi hàng mảng giá trị ô — XLSX sheet_to_json(header:1)).
 * Trả {rows: [{tên cột mẫu: giá trị}], warnings: [], info: {sheet, headerRow (1-based), rawRows, routes, mapped: [..], ignored: [..]}}.
 */
export function convertRawSheets(sheets) {
  // 1) tìm bảng: hàng (trong 20 hàng đầu mỗi sheet) khớp nhiều cột mẫu nhất, bắt buộc có "Tuyến đường"
  let best = null;
  for (const s of sheets) {
    const aoa = s.aoa || [];
    for (let r = 0; r < Math.min(20, aoa.length); r++) {
      const m = mapHeaders(aoa[r] || []), vals = Object.values(m.map);
      if (!vals.includes(COLS.tuyen)) continue;
      const score = vals.length;
      if (score >= 5 && (!best || score > best.score)) best = { s, r, m, score };
    }
  }
  if (!best) throw new Error("Không tìm thấy bảng dữ liệu tuyến: cần một hàng tiêu đề có cột \"Tuyến đường\" và ít nhất 5 cột trùng tên file mẫu (Độ cao bộ đèn, Độ rộng lòng đường, Khoảng cách trụ…).");
  const { s, r: hr, m } = best;
  const idx = Object.fromEntries(Object.entries(m.map).map(([i, t]) => [t, +i]));
  const ci = idx[COLS.tuyen], si = idx.STT;

  // 2) gom dòng theo tuyến: STT có số → tuyến mới; dòng không STT cùng tên tuyến → phương án đèn khác của tuyến đó
  const routes = []; let cur = null, rawRows = 0;
  for (let r = hr + 1; r < s.aoa.length; r++) {
    const row = s.aoa[r] || [];
    const name = clean(row[ci]);
    const stt = si != null ? clean(row[si]) : null;
    const hasGeo = GEO_COLS.some((t) => idx[t] != null && typeof clean(row[idx[t]]) === "number");
    if (blank(name)) {
      // ô tên/STT gộp (chỉ ô đầu có giá trị): dòng còn số liệu → phương án đèn tiếp theo của tuyến đang đọc
      if (cur && blank(stt) && hasGeo) { rawRows++; cur.rows.push({ row, excelRow: r + 1 }); }
      continue;
    }
    // hàng đánh số cột (1, 2, 3 …) ngay dưới tiêu đề
    if (typeof name === "number" && Object.keys(m.map).every((k) => blank(row[k]) || typeof row[k] === "number")) continue;
    // hàng tiêu đề nhóm / tổng cộng (vd STT "I", "Tổng cộng") — không có số liệu hình học
    if (!hasGeo && (/^t[ổo]ng/i.test(String(name)) || (!blank(stt) && typeof stt !== "number"))) continue;
    rawRows++;
    const startNew = !cur || !blank(stt) || String(name) !== String(cur.name);
    if (startNew) { cur = { name: String(name), rows: [] }; routes.push(cur); }
    cur.rows.push({ row, excelRow: r + 1 });
  }

  // 3) mỗi tuyến 1 dòng mẫu
  const warnings = [], out = [];
  for (const rt of routes) {
    // "Loại đèn được chọn" là ô tóm tắt của tuyến (vd "1- Carina_Midi") = ô "Xếp hạng" của dòng đèn được chọn;
    // không khớp thì so cột Fitting thứ hai (fitting đèn chọn) với cột Fitting của từng dòng; vẫn không thấy → dòng đầu + cảnh báo
    let chosen = rt.rows[0];
    const pick = m.chosenCol >= 0 ? rt.rows.map((x) => x.row[m.chosenCol]).find((v) => !blank(v) && typeof clean(v) !== "number") : null;
    if (pick != null) {
      const byRank = m.rankCol >= 0 ? rt.rows.find((x) => key(x.row[m.rankCol]) === key(pick)) : null;
      const fitPick = m.chosenFitCol >= 0 ? rt.rows.map((x) => x.row[m.chosenFitCol]).find((v) => !blank(v)) : null;
      const byFit = !byRank && fitPick != null && m.fitCol >= 0 ? rt.rows.find((x) => key(x.row[m.fitCol]) === key(fitPick)) : null;
      // hàng xếp hạng lệch (sao chép): khớp tên loại đèn sau "N-" với cột "Loại đèn" của từng dòng
      const model = key(String(pick).replace(/^\s*\d+\s*-\s*/, ""));
      const byModel = !byRank && !byFit && idx[COLS.model] != null ? rt.rows.find((x) => key(x.row[idx[COLS.model]]) === model) : null;
      if (byRank || byFit || byModel) chosen = byRank || byFit || byModel;
      else warnings.push(`Tuyến "${rt.name}" (dòng ${rt.rows[0].excelRow}): không tìm thấy dòng của đèn được chọn "${clean(pick)}" — góc nghiêng lấy theo dòng đầu`);
    }
    const o = {};
    for (const [i, t] of Object.entries(m.map)) {
      if (LAMP_COLS.has(t)) continue;
      const vals = rt.rows.map((x) => clean(x.row[i]));
      const first = vals.find((v) => !blank(v));
      let v = clean(chosen.row[i]);
      if (blank(v)) v = first ?? null;                                   // ô gộp/để trống ở dòng chọn → lấy giá trị có trong tuyến
      if (blank(v)) continue;
      if (!PER_LAMP.has(t) && t !== "STT" && !/^SL đèn/.test(t)) {
        const diff = [...new Set(vals.filter((x) => !blank(x)).map(String))];
        if (diff.length > 1) warnings.push(`Tuyến "${rt.name}" (dòng ${rt.rows[0].excelRow}): cột "${t}" khác nhau giữa các dòng (${diff.join(" / ")}) — lấy ${v}${chosen !== rt.rows[0] ? " theo dòng đèn được chọn" : " theo dòng đầu"}`);
      }
      if (t === COLS.arrangement) {
        if (ARR_KNOWN.test(String(v))) v = ARR_CANON[arrangementKind(v)] || v;
        else warnings.push(`Tuyến "${rt.name}" (dòng ${rt.rows[0].excelRow}): cách bố trí "${v}" không nhận dạng được (1 bên / đối xứng / so le / giữa) — giữ nguyên, app sẽ tính như 1 bên`);
      }
      o[t] = v;
    }
    if (o.STT == null) o.STT = out.length + 1;
    const miss = REQUIRED.filter((t) => o[t] == null);
    if (miss.length) {
      warnings.push(`Tuyến "${rt.name}" (dòng ${rt.rows[0].excelRow}): thiếu ${miss.join(", ")} — điền bổ sung (ô tô vàng) để tính được`);
      Object.defineProperty(o, "__missing", { value: miss, enumerable: false });
    }
    out.push(o);
  }
  const mapped = Object.values(m.map).filter((t) => !LAMP_COLS.has(t));
  return {
    rows: out, warnings,
    info: { sheet: s.name, headerRow: hr + 1, rawRows, routes: routes.length, mapped, incomplete: out.filter((o) => o.__missing).length,
      ignored: m.ignored.map((x) => x.head).concat(Object.values(m.map).filter((t) => LAMP_COLS.has(t)).map((t) => `${t} (bộ đèn — để app tự chọn)`)) },
  };
}
