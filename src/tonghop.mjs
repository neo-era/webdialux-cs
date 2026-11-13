// File mẫu dạng "TỔNG HỢP ĐỀ XUẤT ĐÈN LED" (cấu trúc cột của bảng tổng hợp phòng Kỹ thuật, bản 05-11-2026):
//  - dòng 1 tiêu đề, dòng 2 nhóm cột, dòng 3 tên cột (55 cột gốc + 8 cột app cần bổ sung phía sau), dòng 4 số thứ tự cột,
//    dòng 5 tổng, dữ liệu từ dòng 6; mỗi tuyến 1 hoặc nhiều dòng (mỗi dòng 1 bộ đèn, góc nghiêng riêng).
//  - Dùng cho: Excel mẫu nhập liệu, file chuyển từ Excel thô, và sheet kết quả (app điền QCVN, kết quả, điểm, xếp hạng, đèn được chọn).
import { COLS, luminaireLabel } from "./mapping.mjs";
import { mapHeaders } from "./rawImport.mjs";
import { QCVN } from "./engine.mjs";
import { VERSION } from "./version.mjs";
import { scoreOptions } from "./scoring.mjs";

export const TH_SHEET = "TONG HOP DE XUAT";
/** 55 cột gốc — giữ đúng chữ (kể cả xuống dòng, khoảng trắng cuối) như file tổng hợp. */
export const TH_HEAD = ["Stt", "Tuyến Đường", "Phường/ Xã (mới)", "Quận/ Huyện (cũ)", "Tủ điều khiển", "Số lượng đèn Sở duyệt (bộ)", "Số lượng đèn trình Sở (bộ)",
  "Thời điểm thực hiện", "Gói thầu ", "Hạng mục công Tác", "Chiều dài tuyến (m)", "Đầu tuyến", "Cuối tuyến", "Bộ đèn HPS/E-LED hiện hữu",
  "Độ cao bộ đèn\n(m)", "Độ vươn cần đèn\n(m)", "Đường kính đầu cần (D49/ D60…", "Góc nghiêng bộ đèn\n(độ)", "Độ rộng lòng đường\n(m)",
  "Khoảng cách trụ trung bình\n(làm tròn)* (m) ", "Khoảng cách từ trụ đến mép đường\n(m)", "Cách bố trí trụ ", "Dải phân cách giữa (có hoặc không)",
  "Số làn xe", "Lưu lượng xe (nhiều hay ít)", "Fitting", "Loại đèn", "Tên nhà cung cấp", "Công suất đèn LED được chọn (W)", "Cấp đường",
  "Ltb (cd/m2)", "Uo", "Ul", "Ti", "SR", "Ltb (cd/m2)", "Uo", "Ul", "Ti", "SR", "En", "Kết Quả", "Điểm Ltb (cd/m2)", "Điểm Uo", "Điểm Ul", "Điểm Ti", "Điểm SR",
  "Tổng Điểm lần 1", "Tổng Điểm lần 2", "Xếp hạng", "Loại đèn được chọn", "Fitting", "Công suất", "Loại đèn", "Nhà Cung cấp"];
/** cột app cần mà file gốc chưa có — bổ sung phía sau. */
export const TH_EXTRA = [COLS.loaituyen, COLS.sidewalk, COLS.medianW, COLS.rot, COLS.perPole, COLS.mf, "CCT (K)", "CRI"];
export const TH_ALL = [...TH_HEAD, ...TH_EXTRA];
const GROUPS = [[1, 1, "STT"], [2, 5, "THÔNG TIN TUYẾN ĐƯỜNG VÀ TỦ ĐIỀU KHIỂN"], [6, 7, "Số lượng kế hoạch/duyệt"], [8, 8, "Thời điểm thực hiện"],
  [9, 9, "Gói thầu "], [10, 10, "Hạng mục trong gói thầu"], [11, 26, "ĐẶC ĐIỂM TUYẾN ĐƯỜNG VÀ HỆ THỐNG CHIẾU SÁNG HIỆN HỮU"], [27, 30, "THÔNG SỐ BỘ ĐÈN LED"],
  [31, 35, "QCVN 07-7:2023"], [36, 55, "KẾT QUẢ VÀ ĐỀ XUẤT ĐÈN LED"], [56, 63, "THÔNG SỐ BỔ SUNG ĐỂ TÍNH (WebDialux)"]];
const WIDTH = [8.9, 35.3, 15.7, 14.7, 21.3, 12.7, 8.9, 11.1, 13, 12.3, 13.9, 14.3, 13.3, 10.3, 8.9, 13, 11.3, 8.9, 8.9, 12.7, 8.9, 13, 13, 13, 13, 33.9, 22, 14.1, 13.3, 10.4,
  9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 11, 9, 9, 9, 9, 9, 10, 10, 26, 26, 33, 10, 24, 16, 12, 12, 13, 11, 10, 11, 9, 8];
export const TH_FIRST = 6;                       // dòng dữ liệu đầu tiên
const COL = { req: 31, kq: 36, En: 41, pass: 42, d: 43, tong1: 48, tong2: 49, rank: 50, chosen: 51, chFit: 52, chPow: 53, chModel: 54, chNcc: 55 };
const LAMP = { fit: 26, model: 27, ncc: 28, power: 29, cls: 30, tilt: 18 };

// tên cột mẫu (khoá dữ liệu app) → số cột trong file tổng hợp
const KEYCOL = (() => {
  const m = mapHeaders(TH_HEAD).map, out = {};
  for (const [i, t] of Object.entries(m)) out[t] = +i + 1;
  TH_EXTRA.forEach((t, k) => { out[t] = TH_HEAD.length + 1 + k; });
  return out;
})();
export const thCol = (key) => KEYCOL[key];

const C = { title: "FF1F4E79", grp: "FF1F4E79", head: "FFFFF2CC", headIn: "FFDDEBF7", res: "FFE2EFDA", extra: "FFFCE4D6", border: "FFBFC7D5", ok: "FF006100", okBg: "FFC6EFCE", bad: "FF9C0006", badBg: "FFFFC7CE", chosen: "FFE2F0D9", sample: "FFFFF8E7", miss: "FFFFE08A" };
const thin = { style: "thin", color: { argb: C.border } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
const r1 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 10) / 10);
const r0 = (x) => (x == null || !isFinite(x) ? null : Math.round(x));

/** Khung sheet: tiêu đề, nhóm cột, tên cột, số cột, dòng tổng. Trả ws. */
function frame(wb, { title, lastRow }) {
  const ws = wb.addWorksheet(TH_SHEET, { views: [{ state: "frozen", xSplit: 2, ySplit: 5, zoomScale: 85 }], properties: { defaultRowHeight: 18 },
    pageSetup: { paperSize: 8, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "2:3" } });
  const n = TH_ALL.length;
  ws.mergeCells(1, 1, 1, 30);
  const t = ws.getCell(1, 1); t.value = title; t.font = { bold: true, size: 16, color: { argb: C.title } }; t.alignment = { vertical: "middle" };
  ws.getRow(1).height = 32;
  for (const [a, b, label] of GROUPS) {
    if (b > a) ws.mergeCells(2, a, 2, b);
    const c = ws.getCell(2, a); c.value = label;
    for (let k = a; k <= b; k++) { const x = ws.getCell(2, k); x.fill = fill(a >= 56 ? "FFC65911" : a >= 31 ? "FF375623" : C.grp); x.border = BORDER; }
    c.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  }
  ws.getRow(2).height = 40;
  TH_ALL.forEach((h, i) => {
    const c = ws.getCell(3, i + 1); c.value = h;
    c.font = { bold: true, size: 11 }; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = BORDER;
    c.fill = fill(i >= 55 ? C.extra : i >= 30 ? C.res : C.headIn);
    const d = ws.getCell(4, i + 1); d.value = i + 1; d.font = { italic: true, size: 9, color: { argb: "FF5B6676" } }; d.alignment = { horizontal: "center" }; d.border = BORDER;
    ws.getColumn(i + 1).width = WIDTH[i] ?? 12;
  });
  ws.getRow(3).height = 96;
  const L = (k) => ws.getColumn(k).letter;
  for (const k of [6, 7]) { const c = ws.getCell(5, k); c.value = { formula: `SUBTOTAL(9,${L(k)}${TH_FIRST}:${L(k)}${Math.max(TH_FIRST, lastRow)})` }; c.font = { bold: true }; c.alignment = { horizontal: "center" }; }
  ws.getCell(5, 2).value = "TỔNG CỘNG"; ws.getCell(5, 2).font = { bold: true };
  for (let k = 1; k <= n; k++) ws.getCell(5, k).border = BORDER;
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: n } };
  return ws;
}

function lists(ws, last) {
  const L = (key) => ws.getColumn(thCol(key)).letter, rng = (key) => `${L(key)}${TH_FIRST}:${L(key)}${last}`;
  const list = (key, items) => ws.dataValidations.add(rng(key), { type: "list", allowBlank: true, formulae: [`"${items.join(",")}"`], showErrorMessage: true, errorStyle: "warning", error: "Chọn giá trị trong danh sách." });
  list(COLS.roadClass, Object.keys(QCVN));
  list(COLS.arrangement, ["1 bên", "đối xứng", "so le", "giữa"]);
  list(COLS.dpc, ["có", "không"]);
  list(COLS.luuluong, ["nhiều", "ít"]);
}

/** Ghi 1 dòng dữ liệu: cells = {số cột: giá trị}. */
function putRow(ws, r, cells, { first = false, style = null } = {}) {
  const row = ws.getRow(r);
  for (const [k, v] of Object.entries(cells)) if (v !== undefined) row.getCell(+k).value = v;
  for (let k = 1; k <= TH_ALL.length; k++) {
    const c = row.getCell(k); c.border = first ? { ...BORDER, top: { style: "medium", color: { argb: C.title } } } : BORDER;
    c.font = { size: 11, ...(style === "sample" ? { italic: true, color: { argb: "FF5B6676" } } : {}) };
    c.alignment = { vertical: "middle", wrapText: k === 2 || k === 26 || k === 27 || k === 50 || k === 51 || k === 52 };
    if (style === "sample") c.fill = fill(C.sample);
  }
  return row;
}

/** Ô thông tin tuyến (cột theo khoá mẫu) từ object dòng app; first = dòng đầu tuyến (ghi STT, số lượng). */
function routeCells(o, first) {
  const cells = {};
  for (const [key, col] of Object.entries(KEYCOL)) {
    if ([COLS.fitting, COLS.model, COLS.ncc, COLS.power].includes(key)) continue;
    if (!first && (key === "STT" || /^SL đèn/.test(key))) continue;
    const v = o[key];
    if (v != null && v !== "") cells[col] = v;
  }
  return cells;
}

const withLamps = (o, lamps) => Object.defineProperty({ ...o }, "__lamps", { value: lamps, enumerable: false });
/** dòng mẫu tô vàng của Excel mẫu: A chỉ hình học (app tự quét IES), B chỉ định 2 bộ đèn với góc nghiêng riêng. */
export const TH_SAMPLES = [
  withLamps({ STT: 1, [COLS.tuyen]: "Đường mẫu A — chỉ hình học, app tự chọn đèn (xoá dòng này)", "Chiều dài tuyến (m)": 700, "SL đèn trình Sở (bộ)": 20,
    [COLS.H]: 7.5, [COLS.vuon]: 1.5, [COLS.tilt]: 15, [COLS.width]: 7, [COLS.spacing]: 35, [COLS.setback]: 0.5, [COLS.arrangement]: "1 bên",
    [COLS.dpc]: "không", [COLS.lanes]: 2, [COLS.luuluong]: "ít", [COLS.loaituyen]: "Đường khu vực", [COLS.sidewalk]: 3 }, []),
  withLamps({ STT: 2, [COLS.tuyen]: "Đường mẫu B — chỉ định 2 bộ đèn (xoá 2 dòng này)", "Chiều dài tuyến (m)": 1200, "SL đèn trình Sở (bộ)": 70,
    [COLS.H]: 10.5, [COLS.vuon]: 1.5, [COLS.tilt]: 5, [COLS.width]: 14, [COLS.spacing]: 35, [COLS.setback]: 1, [COLS.arrangement]: "đối xứng",
    [COLS.dpc]: "có", [COLS.lanes]: 4, [COLS.luuluong]: "nhiều", [COLS.roadClass]: "B1", [COLS.medianW]: 3 },
  [{ fitting: "1 x LED MAGNOLIA 80W (ví dụ)", model: "MAGNOLIA", ncc: "BELED", power: 80, tilt: 5 },
    { fitting: "1 x LED CARINA 80W (ví dụ)", model: "CARINA", ncc: "Thiên Minh", power: 80, tilt: 10 }]),
];

/**
 * Workbook MẪU nhập liệu dạng tổng hợp. rows: [{khoá cột mẫu: giá trị}] (có thể kèm __lamps / __missing không liệt kê);
 * không có rows → 3 dòng mẫu tô vàng. Mỗi tuyến: 1 dòng (bộ đèn trống → app tự quét IES) hoặc nhiều dòng (mỗi bộ đèn chỉ định 1 dòng).
 */
export async function buildTongHopWorkbook(ExcelJS, { rows = null, version = VERSION, samples = TH_SAMPLES } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = `WebDialux-CS ${version}`; wb.created = new Date();
  const data = rows && rows.length ? rows : samples, isSample = !(rows && rows.length);
  const lines = [];
  data.forEach((o) => {
    const lamps = (o.__lamps && o.__lamps.length) ? o.__lamps : [null];
    lamps.forEach((l, k) => {
      const cells = routeCells(o, k === 0);
      if (l) { cells[LAMP.fit] = l.fitting ?? null; cells[LAMP.model] = l.model ?? null; cells[LAMP.ncc] = l.ncc ?? null; cells[LAMP.power] = l.power ?? null; if (l.tilt != null) cells[LAMP.tilt] = l.tilt; }
      else for (const key of [COLS.fitting, COLS.model, COLS.ncc, COLS.power]) if (o[key] != null) cells[thCol(key)] = o[key];
      lines.push({ cells, first: k === 0, miss: k === 0 ? o.__missing : null });
    });
  });
  const last = TH_FIRST + Math.max(lines.length, 1) - 1;
  const ws = frame(wb, { title: "TỔNG HỢP SỐ LIỆU TUYẾN ĐƯỜNG ĐỂ TÍNH TOÁN VÀ ĐỀ XUẤT ĐÈN LED", lastRow: last });
  lines.forEach((ln, i) => {
    const row = putRow(ws, TH_FIRST + i, ln.cells, { first: ln.first, style: isSample ? "sample" : null });
    if (ln.miss) for (const key of ln.miss) row.getCell(thCol(key)).fill = fill(C.miss);
  });
  lists(ws, Math.max(last + 300, 1000));
  guide(wb);
  return wb;
}

function guide(wb) {
  const g = wb.addWorksheet("HUONG DAN");
  [["CÁCH ĐIỀN SHEET TONG HOP DE XUAT"],
    ["• Dữ liệu từ dòng 6. Mỗi tuyến: dòng đầu ghi STT + số lượng đèn; các dòng tiếp theo (không ghi STT) là các bộ đèn khác của cùng tuyến."],
    ["• Bỏ trống Fitting / Loại đèn → app tự quét toàn bộ thư mục IES, chấm điểm và chọn bộ đèn tối ưu. Ghi Loại đèn + Công suất → app tính đúng các bộ đèn đó, mỗi dòng dùng góc nghiêng của dòng."],
    ["• Cột 31–55 (QCVN, kết quả, điểm, xếp hạng, đèn được chọn) do app điền vào file kết quả — không cần nhập."],
    ["• Góc nghiêng bộ đèn (cột 18): để trống → app thử 0/5/10/15/20° cho từng bộ đèn, chọn góc nhỏ nhất Đạt (ghi chú \"App tự chọn\" ở file kết quả). Ghi số → dùng đúng số đó. Muốn app quét lại thì xoá ô góc."],
    ["• Cột 56–63 (Loại tuyến, vỉa hè, dải phân cách, góc xoay, số đèn/trụ, MF, CCT, CRI) là thông số bổ sung, tuỳ chọn."],
    ["• Ghi chú \"bỏ ra\" ở cột ghi chú (sau cột 63) → tuyến không được đưa vào tính."],
    ["• Bắt buộc: Tuyến đường, Độ cao bộ đèn, Độ rộng lòng đường, Khoảng cách trụ trung bình. Cấp đường trống → app tự xác định theo hình học / loại tuyến."]]
    .forEach((r) => g.addRow(r));
  g.getColumn(1).width = 150; g.getRow(1).font = { bold: true, size: 13 };
}

/**
 * Thêm sheet kết quả dạng tổng hợp vào workbook kết quả: mỗi tuyến 1 dòng/bộ đèn đã tính (đạt theo hạng, rồi không đạt),
 * điền yêu cầu QCVN (31–35), kết quả (36–41), Kết Quả (42), điểm (43–49), xếp hạng (50), đèn được chọn (51–55, dòng đầu tuyến).
 * results: dạng ranked ({status, roadClass, req, options[], chosen, input}); rows: dòng dữ liệu app (cùng chỉ số).
 */
export function addTongHopResultSheet(wb, { results, rows = [] }) {
  const lines = [];
  results.forEach((r, i) => {
    const o = rows[i] || {}, g = r.input || {};
    const opts = (r.options || []).slice();
    const label = (x) => x.lampModel || luminaireLabel(x.iesName) || x.model || "";
    const head = (first) => {
      const cells = routeCells(o, first);
      // Cấp đường: giữ ô người dùng ghi; app tự xác định thì không ghi vào cột đầu vào (mở lại file vẫn tự xác định), chỉ thể hiện qua yêu cầu QCVN 31–35
      cells[LAMP.cls] = o[COLS.roadClass] ?? null;
      const q = r.req || {};
      [q.Ltb, q.Uo, q.Ul, q.TI, q.SR].forEach((v, k) => { cells[COL.req + k] = v ?? null; });
      return cells;
    };
    if (opts.length === 0) {
      const cells = head(true); cells[COL.pass] = r.status !== "ok" ? `${r.status}${r.reason ? ": " + r.reason : ""}` : "không bộ đèn nào tính được";
      lines.push({ cells, first: true, bad: true });
      return;
    }
    const ch = r.chosen;
    opts.forEach((x, k) => {
      const cells = head(k === 0);
      cells[LAMP.fit] = x.fitting || label(x); cells[LAMP.model] = label(x); cells[LAMP.ncc] = x.ncc || x.manufac || null; cells[LAMP.power] = x.power ?? null;
      cells[LAMP.tilt] = x.missing ? (x.tilt ?? null) : (x.tilt ?? g.tilt ?? null);   // dòng thiếu IES: giữ đúng ô góc đã nhập (trống thì trống)
      if (x.missing) { cells[COL.pass] = x.missing; lines.push({ cells, first: k === 0, bad: true }); return; }
      [r2(x.Ltb), r2(x.Uo), r2(x.Ul), r0(x.TI), r2(x.SR)].forEach((v, j) => { cells[COL.kq + j] = v; });
      cells[COL.En] = r1(x.En); cells[COL.pass] = !!x.pass;
      [x.d_Ltb, x.d_Uo, x.d_Ul, x.d_TI, x.d_SR].forEach((v, j) => { cells[COL.d + j] = v ?? null; });
      cells[COL.tong1] = x.tong1 ?? null; cells[COL.tong2] = x.tong2 ?? null;
      cells[COL.rank] = x.rank ? `${x.rank}- ${label(x)}` : null;
      if (k === 0 && ch) {
        cells[COL.chosen] = `1- ${label(ch)}`; cells[COL.chFit] = ch.fitting || label(ch); cells[COL.chPow] = ch.power ?? null;
        cells[COL.chModel] = label(ch); cells[COL.chNcc] = ch.ncc || ch.manufac || null;
      }
      const note = x.specPower != null && x.power != null && x.specPower !== x.power ? `Dòng ghi ${x.specPower} W — thư mục IES không có, tính bằng ${luminaireLabel(x.iesName)} (${x.power} W).` : null;
      lines.push({ cells, first: k === 0, pass: !!x.pass, chosen: ch === x, note, fb: k === 0 ? r.fallback : null, tiltNote: x.tiltAuto ? `App tự chọn góc ${x.tilt}° (thử 0/5/10/15/20°)${x.tiltWarn ? " — ⚠ " + x.tiltWarn : ""}` : null });
    });
  });
  const last = TH_FIRST + Math.max(lines.length, 1) - 1;
  const ws = frame(wb, { title: "TỔNG HỢP KẾT QUẢ TÍNH TOÁN VÀ ĐỀ XUẤT ĐÈN LED CÁC TUYẾN ĐƯỜNG", lastRow: last });
  lines.forEach((ln, i) => {
    const row = putRow(ws, TH_FIRST + i, ln.cells, { first: ln.first });
    const kq = row.getCell(COL.pass);
    if (typeof kq.value === "boolean") { kq.fill = fill(kq.value ? C.okBg : C.badBg); kq.font = { bold: true, color: { argb: kq.value ? C.ok : C.bad } }; kq.alignment = { horizontal: "center", vertical: "middle" }; }
    else if (ln.bad) kq.font = { italic: true, color: { argb: C.bad } };
    if (ln.chosen) for (let k = 26; k <= 50; k++) row.getCell(k).fill = fill(C.chosen);
    if (ln.tiltNote) { const c = row.getCell(LAMP.tilt); c.note = ln.tiltNote; c.font = { italic: true, size: 11, color: { argb: "FF1F6FB2" } }; }
    if (ln.fb) { const c = row.getCell(LAMP.model); c.note = ln.fb; }
    if (ln.note) { const c = row.getCell(LAMP.power); c.note = ln.note; c.font = { bold: true, color: { argb: "FFC65911" } }; }
    for (let k = COL.req; k <= COL.tong2; k++) row.getCell(k).alignment = { horizontal: "center", vertical: "middle" };
    for (const k of [COL.req, COL.req + 1, COL.req + 2, COL.req + 4, COL.kq, COL.kq + 1, COL.kq + 2, COL.kq + 4]) row.getCell(k).numFmt = "0.00";
  });
  // đưa sheet tổng hợp lên đầu
  const idx = wb.worksheets.indexOf(ws);
  if (idx > 0) { wb.worksheets.forEach((w) => { w.orderNo = w === ws ? 0 : (w.orderNo ?? 0) + 1; }); }
  return ws;
}

/**
 * Chế độ TỪNG PHƯƠNG ÁN với file tổng hợp: kết quả 1 dòng/bộ đèn (dòng phẳng có __route = chỉ số tuyến)
 * → gom lại theo tuyến thành dạng ranked (options đã chấm điểm) để điền sheet tổng hợp.
 */
export function groupByRoute(results, flatRows, routes) {
  const out = routes.map(() => null);
  results.forEach((r, i) => {
    const fr = flatRows[i] || {}, k = fr.__route ?? i;
    if (out[k] == null) out[k] = { ...r, options: [], chosen: null, raw: [] };
    const g = out[k];
    const lab = { fitting: fr[COLS.fitting] ?? null, lampModel: fr[COLS.model] ?? null, ncc: fr[COLS.ncc] ?? null, tilt: r.tilt ?? fr[COLS.tilt] ?? null, tiltAuto: !!r.tiltAuto, tiltWarn: r.tiltWarn || null };
    if (r.status === "ok") {
      g.status = "ok"; g.req = r.req || g.req; g.roadClass = r.roadClass ?? g.roadClass;
      g.raw.push({ ...lab, iesName: r.iesName, model: r.model, power: r.power, Ltb: r.Ltb, Uo: r.Uo, Ul: r.Ul, TI: r.TI, SR: r.SR, En: r.En, pass: !!r.pass });
    } else g.raw.push({ ...lab, power: fr[COLS.power] ?? null, pass: false, missing: `${r.status}${r.reason ? ": " + r.reason : ""}` });
  });
  return out.map((g, k) => {
    if (!g) return { status: "không có dữ liệu", options: [], chosen: null, input: {}, tuyen: routes[k]?.[COLS.tuyen] };
    const opts = scoreOptions(g.raw).sort((a, b) => (a.pass !== b.pass ? (a.pass ? -1 : 1) : a.pass ? a.rank - b.rank : (!!a.missing - !!b.missing) || (a.power ?? 1e9) - (b.power ?? 1e9)));
    const { raw, ...rest } = g;
    return { ...rest, options: opts, chosen: opts.find((o) => o.chosen) || null, pass: opts.some((o) => o.pass) };
  });
}
