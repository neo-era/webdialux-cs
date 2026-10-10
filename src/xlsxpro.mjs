// Xuất Excel kết quả định dạng chuyên nghiệp bằng ExcelJS (chạy local trong trình duyệt hoặc Node).
// Nhận constructor ExcelJS từ ngoài (trình duyệt: window.ExcelJS; Node: require("exceljs")).
//
// Sheet 1 "Chấm điểm chi tiết": mỗi tuyến nhiều dòng (một dòng/bộ đèn Đạt), điểm, hạng, ✓ chọn.
// Sheet 2 "Tổng hợp đèn"      : gộp theo Hãng · Loại đèn · Công suất của bộ ĐƯỢC CHỌN → số tuyến, số bộ, kW.
// Sheet 3 "Theo tuyến"        : 1 dòng/tuyến với bộ đèn chọn + chỉ tiêu + kết luận.

import { VERSION } from "./version.mjs";
import { rowToGeometry, luminaireLabel } from "./mapping.mjs";

/**
 * Chuẩn hoá kết quả chế độ TỪNG PHƯƠNG ÁN (runBatch: 1 đèn/tuyến) về cùng hình dạng
 * với chế độ ĐA PHƯƠNG ÁN (runBatchRanked: options[] + chosen) để dùng chung một workbook.
 * Kết quả đã ở dạng ranked (có options) được trả nguyên.
 */
export function toRankedShape(results, rows = [], iesIndex = []) {
  const byName = new Map(iesIndex.map((e) => [e.name, e]));
  return results.map((r, i) => {
    if (!r || Array.isArray(r.options)) return r;
    const row = rows[i];
    let g = null; try { g = row ? rowToGeometry(row) : null; } catch (_) { g = null; }
    const base = { ...r, input: r.input || (g && g.input) || {}, meta: r.meta || (g && g.meta) || {} };
    if (r.status !== "ok") return { ...base, options: [], chosen: null };
    const e = byName.get(r.iesName || r.chon) || {};
    const o = {
      iesName: r.iesName || r.chon, model: r.model || e.model || null, manufac: e.manufac || null,
      power: r.power ?? e.power ?? null, Ltb: r.Ltb, Uo: r.Uo, Ul: r.Ul, TI: r.TI, SR: r.SR, En: r.En,
      pass: !!r.pass, d_Ltb: null, d_Uo: null, d_Ul: null, d_TI: null, d_SR: null, tong1: null, tong2: null,
      rank: r.pass ? 1 : null, chosen: !!r.pass,
    };
    return { ...base, options: [o], chosen: r.pass ? o : null };
  });
}

const C = {
  head: "FF1F4E79", headTxt: "FFFFFFFF", border: "FFD0D7E2", zebra: "FFF7F9FC",
  ok: "FFC6EFCE", okTxt: "FF006100", fail: "FFFFC7CE", failTxt: "FF9C0006",
  chosen: "FFE2F0D9", title: "FF1F4E79", sub: "FF5B6676", total: "FFEAF1F8",
};
const thin = { style: "thin", color: { argb: C.border } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const r2 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100;
const r1 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10;
const r0 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x);
const srcLbl = (cs) => cs === "loại tuyến" ? "quy đổi từ loại tuyến" : cs === "hình học" ? "tự xác định (hình học)" : "nhập trực tiếp";
const arrLbl = (a) => /đối xứng|doi xung/i.test(a || "") ? "hai bên đối diện" : /so le|staggered/i.test(a || "") ? "hai bên so le" : /giữa/i.test(a || "") ? "trên dải phân cách" : "một bên";
const nSideOf = (a) => /đối xứng|doi xung|so le|staggered/i.test(a || "") ? 2 : 1;
const raw = (x) => (x == null || !isFinite(x)) ? null : x;
const F = (formula, result) => ({ formula, result: result ?? "" });
const cleanIes = luminaireLabel; // cùng tên bộ đèn với PDF

/** Ước tính số bộ đèn 1 tuyến: ưu tiên cột SL trong Excel, không có thì ceil(L/S)·nSide. */
export function estimateLampCount(row, input) {
  const sl = Number(row?.["SL đèn trình Sở (bộ)"] ?? row?.["SL đèn Sở duyệt (bộ)"] ?? row?.["Số bộ đèn"]);
  if (isFinite(sl) && sl > 0) return { n: Math.round(sl), src: "theo Excel" };
  const L = Number(row?.["Chiều dài tuyến (m)"]);
  if (isFinite(L) && L > 0 && input?.spacing > 0) return { n: Math.ceil(L / input.spacing) * nSideOf(input.arrangement), src: "ước tính L/S" };
  return { n: null, src: "" };
}

/** Gộp bộ đèn ĐƯỢC CHỌN theo Hãng · tên bộ đèn (tên file IES, như PDF) · CS. Trả mảng đã sắp theo công suất tăng dần. */
export function summarizeLuminaires(results, rows = []) {
  const map = new Map();
  results.forEach((r, i) => {
    if (r.status !== "ok" || !r.chosen) return;
    // khoá không phân biệt hoa/thường — Excel so "=" trong công thức sheet 2 cũng vậy
    const o = r.chosen, name = cleanIes(o.iesName) || o.model || "", key = `${o.manufac || "—"}|${name}|${o.power ?? ""}`.toLowerCase();
    const { n } = estimateLampCount(rows[i], r.input);
    if (!map.has(key)) map.set(key, { manufac: o.manufac || "—", model: name, power: o.power ?? null, routes: 0, lamps: 0, lampsKnown: true, kW: 0, tuyen: [] });
    const g = map.get(key); g.routes++; g.tuyen.push(r.tuyen || `STT ${r.stt ?? i + 1}`);
    if (n != null) { g.lamps += n; g.kW += n * (o.power || 0) / 1000; } else g.lampsKnown = false;
  });
  return [...map.values()].sort((a, b) => (a.power ?? 1e9) - (b.power ?? 1e9) || a.model.localeCompare(b.model));
}

function styleHeader(row) {
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.head } };
    c.font = { bold: true, color: { argb: C.headTxt }, size: 10 };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = BORDER;
  });
  row.height = 30;
}
function styleBody(row, zebra) {
  row.eachCell({ includeEmpty: true }, (c) => {
    c.border = BORDER; c.font = { size: 10 }; c.alignment = { vertical: "middle" };
    if (zebra) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.zebra } };
  });
}
function mark(cell, pass) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: pass ? C.ok : C.fail } };
  cell.font = { bold: true, size: 10, color: { argb: pass ? C.okTxt : C.failTxt } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
}
function title(ws, text, sub, ncols) {
  ws.mergeCells(1, 1, 1, ncols); ws.mergeCells(2, 1, 2, ncols);
  const t = ws.getCell(1, 1); t.value = text; t.font = { bold: true, size: 14, color: { argb: C.title } }; t.alignment = { vertical: "middle" };
  const s = ws.getCell(2, 1); s.value = sub; s.font = { italic: true, size: 9.5, color: { argb: C.sub } };
  ws.getRow(1).height = 24; ws.getRow(2).height = 16;
}

/**
 * Dựng workbook kết quả.
 * @param ExcelJS constructor
 * @param {object} p { results, rows, q0, MF, version, date, projectName }
 */
export async function buildResultWorkbook(ExcelJS, { results, rows = [], q0 = 0.08, MF = 0.8, version = VERSION, date = new Date(), projectName = "" }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WebDialux-CS"; wb.created = date;
  // Công thức kèm giá trị cache (trình xem không tự tính vẫn thấy kết quả); Excel tính lại khi mở.
  wb.calcProperties.fullCalcOnLoad = true;
  const dstr = date.toLocaleDateString("vi-VN"), tstr = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const sub = `${projectName ? projectName + " · " : ""}Ngày tính ${dstr} ${tstr} · WebDialux-CS ${version} · QCVN 07-7:2023 · CIE 140 · mặt đường CIE R3 q0 ${String(q0).replace(".", ",")} · MF ${String(MF).replace(".", ",")} · ${results.length} tuyến`;

  // ===== Sheet 1: Chấm điểm chi tiết =====
  const ws = wb.addWorksheet("Chấm điểm chi tiết", { views: [{ state: "frozen", ySplit: 4 }] });
  const H1 = ["STT", "Tuyến đường", "Cấp đường", "Nguồn cấp", "Loại tuyến", "Khoảng cột (m)", "Bề rộng (m)", "Số làn", "Độ cao (m)", "Vươn (m)", "Setback (m)", "Nghiêng (°)", "Bố trí",
    "Ltb YC", "Uo YC", "Ul YC", "TI YC (%)", "SR YC",
    "Hãng", "Loại đèn", "Công suất (W)", "File IES",
    "Ltb KQ", "Uo KQ", "Ul KQ", "TI KQ (%)", "SR KQ", "En KQ (lx)", "Kết quả",
    "Điểm Ltb", "Điểm Uo", "Điểm Ul", "Điểm TI", "Điểm SR", "Tổng điểm 1", "Tổng điểm 2", "Hạng", "Chọn"];
  title(ws, "BẢNG CHẤM ĐIỂM & CHỌN ĐÈN CHIẾU SÁNG ĐƯỜNG — QCVN 07-7:2023", sub, H1.length);
  ws.getRow(3).height = 6;
  styleHeader(ws.addRow(H1));
  const widths = [6, 30, 9, 16, 18, 10, 9, 7, 9, 8, 9, 9, 14, 8, 7, 7, 9, 7, 16, 28, 10, 34, 8, 7, 7, 9, 7, 9, 13, 7, 7, 7, 7, 7, 9, 9, 6, 6];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  let zebra = false;
  const groupOf = []; // dải dòng sheet 1 của từng tuyến (để sheet 3 tra dòng ✓)
  results.forEach((r, ti) => {
    const g = r.input || {}, req = r.req || {}, m = r.meta || {};
    const head = [r.stt ?? "", r.tuyen ?? "", r.roadClass ?? "", srcLbl(r.classSource), m.loaituyen || "",
      r1(g.spacing), r1(g.width), g.lanes ?? "", r1(g.H), r2(g.overhang), r2(g.setback), r0(g.tilt), arrLbl(g.arrangement),
      r2(req.Ltb), r2(req.Uo), r2(req.Ul), r0(req.TI), r2(req.SR)];
    const blank = head.map(() => null);
    const opts = (r.options || []).filter((o) => o.pass);
    zebra = !zebra;
    if (r.status !== "ok" || opts.length === 0) {
      const row = ws.addRow([...head, "", "", "", "", null, null, null, null, null, null, r.status !== "ok" ? r.status : "KHÔNG ĐẠT (không bộ đèn nào đạt)", null, null, null, null, null, null, null, null, ""]);
      styleBody(row, zebra); mark(row.getCell(29), false);
      row.getCell(1).border = { ...BORDER, top: { style: "medium", color: { argb: C.head } } };
      return;
    }
    const a = ws.rowCount + 1, b = a + opts.length - 1;
    groupOf[ti] = { a, b };
    const scored = opts[0].d_Ltb != null; // chế độ Từng phương án: app không chấm điểm → để trống
    const rg = (c) => `$${c}$${a}:$${c}$${b}`, P = (n) => `AC${n}<>"ĐẠT"`;
    opts.forEach((o, k) => {
      const n = a + k;
      // So Đạt trên giá trị làm tròn như engine (2 chữ số; TI số nguyên); YC ở dòng đầu nhóm
      const kq = F(`IF(AND(ROUND(W${n},2)>=$N$${a},ROUND(X${n},2)>=$O$${a},ROUND(Y${n},2)>=$P$${a},ROUND(Z${n},0)<=$Q$${a},ROUND(AA${n},2)>=$R$${a}),"ĐẠT","KHÔNG ĐẠT")`, o.pass ? "ĐẠT" : "KHÔNG ĐẠT");
      // Borda: SUMPRODUCT so số trực tiếp (COUNTIFS "<="&ô đổi số thành chuỗi 15 chữ số → lệch điểm)
      const borda = (c, op, v) => F(`IF(${P(n)},"",SUMPRODUCT((${rg("AC")}="ĐẠT")*(${rg(c)}${op}${c}${n})))`, v);
      const beats = `((${rg("W")}<W${n})+(${rg("X")}<X${n})+(${rg("Y")}<Y${n})+(${rg("AA")}<AA${n})+(${rg("Z")}>Z${n}))>=3`;
      const eqU = `(${rg("U")}=U${n})`, eqT1 = `(${rg("AI")}=AI${n})`;
      // hoà tuyệt đối với dòng phía trên → xếp sau (dải con a..n-1; không dùng ROW(dải) vì không phải nơi nào cũng trả mảng)
      const up = (c) => `$${c}$${a}:$${c}$${n - 1}`;
      const tieAbove = (n) => n === a ? "" : `+SUMPRODUCT((${up("AC")}="ĐẠT")*(${up("U")}=U${n})*(${up("AI")}=AI${n})*(${up("AJ")}=AJ${n})*(${up("W")}=W${n}))`;
      const score = scored ? [
        borda("W", "<=", o.d_Ltb), borda("X", "<=", o.d_Uo), borda("Y", "<=", o.d_Ul), borda("Z", ">=", o.d_TI), borda("AA", "<=", o.d_SR),
        F(`IF(${P(n)},"",SUM(AD${n}:AH${n}))`, o.tong1),
        F(`IF(${P(n)},"",IF(AND(AI${n}=MAX(${rg("AI")}),COUNTIF(${rg("AI")},AI${n})>1),SUMPRODUCT(${eqT1}*(${beats})),0))`, o.tong2),
        // Hạng: CS nhỏ hơn → Tổng 1, Tổng 2 cao hơn (= điểm xét) → Ltb cao hơn → dòng trên (như sort ổn định của app)
        F(`IF(${P(n)},"",1+SUMPRODUCT((${rg("AC")}="ĐẠT")*((${rg("U")}<U${n})+${eqU}*(${rg("AI")}>AI${n})+${eqU}*${eqT1}*(${rg("AJ")}>AJ${n})+${eqU}*${eqT1}*(${rg("AJ")}=AJ${n})*(${rg("W")}>W${n})))${tieAbove(n)})`, o.rank),
        F(`IF(AK${n}=1,"✓","")`, o.chosen ? "✓" : ""),
      ] : [null, null, null, null, null, null, null, F(`IF(AC${n}="ĐẠT",1,"")`, o.rank), F(`IF(AC${n}="ĐẠT","✓","")`, o.chosen ? "✓" : "")];
      const row = ws.addRow([...(k === 0 ? head : blank), o.manufac || "", o.model || cleanIes(o.iesName), o.power ?? null, cleanIes(o.iesName) || o.model || "", // cột V = tên bộ đèn (sheet 3 & 2 tra theo cột này)
        raw(o.Ltb), raw(o.Uo), raw(o.Ul), raw(o.TI), raw(o.SR), raw(o.En), kq, ...score]);
      styleBody(row, zebra); mark(row.getCell(29), o.pass);
      if (o.chosen) { row.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.chosen } }; }); row.getCell(20).font = { bold: true, size: 10 }; row.getCell(38).font = { bold: true, size: 11, color: { argb: C.okTxt } }; row.getCell(38).alignment = { horizontal: "center" }; mark(row.getCell(29), true); }
      if (k === 0) row.eachCell({ includeEmpty: true }, (c) => { c.border = { ...c.border, top: { style: "medium", color: { argb: C.head } } }; });
      [14, 15, 16, 18, 23, 24, 25, 27].forEach((ci) => { row.getCell(ci).numFmt = "0.00"; });
      [28].forEach((ci) => { row.getCell(ci).numFmt = "0.0"; });
      [17, 26, 21].forEach((ci) => { row.getCell(ci).numFmt = "0"; });
      [37, 30, 31, 32, 33, 34, 35, 36].forEach((ci) => { row.getCell(ci).alignment = { horizontal: "center", vertical: "middle" }; });
    });
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: H1.length } };

  // ===== Sheet 2: Tổng hợp đèn =====
  const sum = summarizeLuminaires(results, rows);
  const ws2 = wb.addWorksheet("Tổng hợp đèn", { views: [{ state: "frozen", ySplit: 4 }] });
  const H2 = ["STT", "Nhà sản xuất", "Bộ đèn", "Công suất (W)", "Số tuyến", "Số bộ đèn", "Tổng công suất (kW)", "Các tuyến áp dụng"];
  title(ws2, "BẢNG TỔNG HỢP BỘ ĐÈN ĐƯỢC CHỌN — theo nhà sản xuất · loại · công suất", sub, H2.length);
  ws2.getRow(3).height = 6; styleHeader(ws2.addRow(H2));
  [6, 22, 36, 14, 10, 12, 18, 70].forEach((w, i) => { ws2.getColumn(i + 1).width = w; });
  let tR = 0, tL = 0, tK = 0, anyUnknown = false;
  // Đếm/cộng trên sheet 3 theo (Hãng, Loại, CS) bằng SUMPRODUCT so bằng — COUNTIFS coi * ? ~ trong tên đèn
  // là ký tự đại diện. Hãng "—" (không rõ) ứng với ô trống ở sheet 3.
  const s3 = (c) => `'Theo tuyến'!$${c}$5:$${c}$${4 + results.length}`;
  sum.forEach((g, i) => {
    const n = 5 + i;
    const crit = `(${s3("J")}=${g.manufac === "—" ? '""' : `B${n}`})*(${s3("I")}=C${n})*(${s3("K")}=D${n})`;
    const lamps = `SUMPRODUCT(${crit}*${s3("L")})`;
    const row = ws2.addRow([i + 1, g.manufac, g.model, g.power, F(`SUMPRODUCT(${crit})`, g.routes),
      F(`IF(${lamps}=0,"",${lamps})`, g.lamps || ""), F(`IF(${lamps}=0,"",${lamps}*D${n}/1000)`, g.kW || ""), g.tuyen.join("; ")]);
    styleBody(row, i % 2 === 1); row.getCell(7).numFmt = "0.00"; [1, 4, 5, 6].forEach((c) => { row.getCell(c).alignment = { horizontal: "center", vertical: "middle" }; });
    row.getCell(8).alignment = { wrapText: true, vertical: "middle" };
    tR += g.routes; tL += g.lamps; tK += g.kW; if (!g.lampsKnown) anyUnknown = true;
  });
  const e2 = 4 + sum.length, sm = (c) => `SUM(${c}5:${c}${e2})`;
  const tot = ws2.addRow(["", "TỔNG CỘNG", "", "", F(sm("E"), tR), F(`IF(${sm("F")}=0,"",${sm("F")})`, tL || ""), F(`IF(${sm("G")}=0,"",${sm("G")})`, tK || ""), ""]);
  tot.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.total } }; c.font = { bold: true, size: 10.5 }; c.border = BORDER; });
  tot.getCell(7).numFmt = "0.00"; [5, 6].forEach((c) => { tot.getCell(c).alignment = { horizontal: "center" }; });
  const note = ws2.addRow([]); const nc = ws2.getCell(note.number, 1); ws2.mergeCells(note.number, 1, note.number, H2.length);
  nc.value = "Số bộ đèn lấy theo cột 'SL đèn trình Sở (bộ)' nếu có; nếu không, ước tính = ⌈Chiều dài tuyến / Khoảng cột⌉ × số hàng đèn." + (anyUnknown ? " Một số tuyến thiếu chiều dài nên chưa ước tính được số bộ." : "");
  nc.font = { italic: true, size: 9, color: { argb: C.sub } };
  if (sum.length === 0) { const e = ws2.addRow(["Chưa có bộ đèn nào được chọn (không tuyến nào Đạt)."]); e.getCell(1).font = { italic: true }; }

  // ===== Sheet 3: Theo tuyến =====
  const ws3 = wb.addWorksheet("Theo tuyến", { views: [{ state: "frozen", ySplit: 4 }] });
  const H3 = ["STT", "Tuyến đường", "Cấp đường", "Loại tuyến", "Khoảng cột (m)", "Bề rộng (m)", "Độ cao (m)", "Bố trí", "Bộ đèn chọn", "Nhà sản xuất", "Công suất (W)", "Số bộ đèn", "Ltb", "Uo", "Ul", "TI (%)", "SR", "En (lx)", "Kết quả"];
  title(ws3, "BẢNG KẾT QUẢ THEO TUYẾN — bộ đèn tối ưu & chỉ tiêu QCVN 07-7:2023", sub, H3.length);
  ws3.getRow(3).height = 6; styleHeader(ws3.addRow(H3));
  [6, 30, 9, 18, 10, 9, 9, 16, 32, 18, 10, 10, 8, 7, 7, 8, 7, 9, 14].forEach((w, i) => { ws3.getColumn(i + 1).width = w; });
  results.forEach((r, i) => {
    const g = r.input || {}, m = r.meta || {}, o = r.chosen, { n } = estimateLampCount(rows[i], g);
    const gr = groupOf[i];
    // Có dòng ở sheet 1: bộ đèn & chỉ tiêu lấy theo dòng ✓ của nhóm (đổi theo khi sửa số trong Excel)
    const at = (c) => gr && `INDEX('Chấm điểm chi tiết'!$${c}$${gr.a}:$${c}$${gr.b},MATCH("✓",'Chấm điểm chi tiết'!$AL$${gr.a}:$AL$${gr.b},0))`;
    const pick = (c, v) => gr ? F(`IFERROR(IF(${at(c)}="","",${at(c)}),"")`, v ?? "") : (v ?? null); // ô trống không hiện thành 0
    const kq = r.status !== "ok" ? r.status : gr ? F(`IF(COUNTIF('Chấm điểm chi tiết'!$AL$${gr.a}:$AL$${gr.b},"✓")>0,"ĐẠT","KHÔNG ĐẠT")`, o ? "ĐẠT" : "KHÔNG ĐẠT") : (o ? "ĐẠT" : "KHÔNG ĐẠT");
    const row = ws3.addRow([r.stt ?? "", r.tuyen ?? "", r.roadClass ?? "", m.loaituyen || "", r1(g.spacing), r1(g.width), r1(g.H), arrLbl(g.arrangement),
      pick("V", o ? (cleanIes(o.iesName) || o.model || "") : ""), pick("S", o ? (o.manufac || "") : ""), pick("U", o ? o.power : null), n,
      pick("W", o ? raw(o.Ltb) : null), pick("X", o ? raw(o.Uo) : null), pick("Y", o ? raw(o.Ul) : null), pick("Z", o ? raw(o.TI) : null), pick("AA", o ? raw(o.SR) : null), pick("AB", o ? raw(o.En) : null),
      kq]);
    styleBody(row, i % 2 === 1); mark(row.getCell(19), !!o && r.status === "ok");
    [13, 14, 15, 17].forEach((c) => { row.getCell(c).numFmt = "0.00"; }); row.getCell(18).numFmt = "0.0"; row.getCell(16).numFmt = "0";
    [1, 3, 11, 12, 16].forEach((c) => { row.getCell(c).alignment = { horizontal: "center", vertical: "middle" }; });
  });
  ws3.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: H3.length } };
  return wb;
}
