// Chế độ "Khu vực tự do": trụ đèn đặt tự do trên mặt bằng (sân thể thao, công viên, quảng trường, bãi đỗ xe…),
// tính lưới độ rọi ngang trên từng vùng, đánh giá theo bảng yêu cầu (src/areaReq.mjs).
// Toạ độ mặt bằng: x sang phải, y lên trên. Hướng chiếu đo từ trục +x, ngược chiều kim đồng hồ (0° = +x, 90° = +y).
// Góc nghiêng: 0° = chiếu thẳng xuống; nghiêng về phía hướng chiếu. Dùng chung hàm độ rọi với chế độ đường.

import { makeIntensity } from "./ies.mjs";
import { illuminanceAtPoint } from "./photometry.mjs";
import { AREA_REQS, findReq } from "./areaReq.mjs";
import { VERSION } from "./version.mjs";

export const AREA_COLS = {
  id: "Trụ", x: "x (m)", y: "y (m)", H: "Cao H (m)", aim: "Hướng chiếu (độ)", tilt: "Góc nghiêng (độ)",
  n: "Số đèn", ies: "Bộ đèn (IES)",
  area: "Vùng", req: "Mã yêu cầu", reqEav: "Eav yêu cầu (lx)", reqUo: "Uo yêu cầu",
  x0: "x0 (m)", y0: "y0 (m)", L: "Dài theo x (m)", W: "Rộng theo y (m)", poly: "Đa giác (x y; x y; …)",
  step: "Bước lưới (m)", mf: "MF",
};
export const POLE_HEAD = ["id", "x", "y", "H", "aim", "tilt", "n", "ies"].map((k) => AREA_COLS[k]);
export const AREA_HEAD = ["area", "req", "reqEav", "reqUo", "x0", "y0", "L", "W", "poly", "step", "mf"].map((k) => AREA_COLS[k]);

const num = (v) => { if (v == null || v === "") return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\.IES$/, "").replace(/_IESNA2002$/, "").replace(/[^A-Z0-9]/g, "");

/** Một trụ → các bộ đèn cho engine: C0 của IES = hướng chiếu, nghiêng về phía C0. */
export function poleToLums(p) {
  const n = Math.max(1, Math.round(p.n || 1));
  const l = { x: p.x, y: p.y, H: p.H, tilt: p.tilt || 0, rot: (p.aim || 0) - 90, c0dir: 1 };
  return Array.from({ length: n }, () => l);
}

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const polyArea = (poly) => Math.abs(poly.reduce((s, [x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; return s + x * y2 - x2 * y; }, 0)) / 2;

/**
 * Lưới điểm tâm ô. Hình chữ nhật {x0,y0,L,W} hoặc đa giác {poly:[[x,y],…]}.
 * Bước trống → tự chọn: 1 m, tăng dần (bội 0,5 m) để không quá 40.000 điểm.
 * Trả {points, nx, ny, step, x0, y0, cell[] (chỉ số điểm theo ô bbox, -1 = ngoài vùng), area}
 */
export function areaGrid(a) {
  const poly = a.poly && a.poly.length >= 3 ? a.poly : null;
  const x0 = poly ? Math.min(...poly.map((p) => p[0])) : (a.x0 || 0);
  const y0 = poly ? Math.min(...poly.map((p) => p[1])) : (a.y0 || 0);
  const L = poly ? Math.max(...poly.map((p) => p[0])) - x0 : a.L;
  const W = poly ? Math.max(...poly.map((p) => p[1])) - y0 : a.W;
  if (!(L > 0 && W > 0)) return { points: [], nx: 0, ny: 0, dx: 0, dy: 0, step: 0, x0, y0, L: L || 0, W: W || 0, cell: [], poly, area: 0 };
  let step = a.step > 0 ? a.step : Math.max(1, Math.ceil(2 * Math.sqrt((L * W) / 40000)) / 2);
  const nx = Math.max(1, Math.round(L / step)), ny = Math.max(1, Math.round(W / step));
  const dx = L / nx, dy = W / ny;
  const points = [], cell = new Array(nx * ny).fill(-1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + dx * (i + 0.5), y = y0 + dy * (j + 0.5);
    if (poly && !inPoly(x, y, poly)) continue;
    cell[j * nx + i] = points.length; points.push({ x, y });
  }
  return { points, nx, ny, dx, dy, step, x0, y0, L, W, cell, poly, area: poly ? polyArea(poly) : L * W };
}

/**
 * Tính độ rọi các vùng. poles: [{id,x,y,H,aim,tilt,n,ies:{name,ph,power}}]; trụ không có IES bị bỏ qua.
 * areas: [{name, x0,y0,L,W | poly, step, req:{Eav,Uo}, MF}]. MF mặc định = opts.MF (0,8).
 */
export function calcArea({ poles, areas }, { MF: MF0 = 0.8 } = {}) {
  const live = poles.filter((p) => p.ies && p.ies.ph);
  const groups = new Map();                                    // gom theo bộ đèn để dựng I(C,γ) một lần
  for (const p of live) {
    const k = p.ies.name;
    if (!groups.has(k)) groups.set(k, { I: makeIntensity(p.ies.ph), lums: [] });
    groups.get(k).lums.push(...poleToLums(p));
  }
  const power = live.reduce((s, p) => s + Math.max(1, Math.round(p.n || 1)) * (p.ies.ph.inputWatts || p.ies.power || 0), 0);
  const out = areas.map((a) => {
    const MF = a.MF ?? MF0;
    const grid = areaGrid(a);
    const E = grid.points.map((P) => { let s = 0; for (const g of groups.values()) s += illuminanceAtPoint(P, g.lums, g.I, MF); return s; });
    const n = E.length;
    if (!n) return { name: a.name, grid, E, Eav: null, Emin: null, Emax: null, Uo: null, Ud: null, MF, req: a.req || null, okE: false, okU: false, pass: false, empty: true, power, lpd: null };
    let Emin = Infinity, Emax = -Infinity, sum = 0;
    for (const v of E) { if (v < Emin) Emin = v; if (v > Emax) Emax = v; sum += v; }
    const Eav = sum / n;
    const Uo = Eav > 0 ? Emin / Eav : 0, Ud = Emax > 0 ? Emin / Emax : 0;
    const req = a.req || null;
    const r2 = (x) => Math.round(x * 100) / 100;
    const okE = !req || req.Eav == null || Math.round(Eav * 10) / 10 >= req.Eav;
    const okU = !req || req.Uo == null || r2(Uo) >= req.Uo;
    return { name: a.name, grid, E, Eav, Emin, Emax, Uo, Ud, MF, req, okE, okU, pass: okE && okU,
      power, lpd: grid.area > 0 ? power / grid.area : null };
  });
  return { areas: out, power, nPoles: live.length };
}

function parsePoly(s) {
  if (!s) return null;
  const pts = String(s).split(";").map((t) => t.trim()).filter(Boolean).map((t) =>
    (/\s/.test(t) ? t.split(/\s+/).map((v) => v.replace(",", ".")) : t.split(",")).filter(Boolean).map(Number));
  if (pts.length < 3 || pts.some((p) => p.length !== 2 || !p.every(Number.isFinite))) return null;
  return pts;
}

/** Khớp tên bộ đèn trong Excel với thư viện IES: trùng tên (bỏ đuôi) trước, rồi chứa nhau. */
export function matchAreaIes(name, iesIndex) {
  const k = norm(name);
  if (!k) return null;
  return iesIndex.find((e) => norm(e.name) === k) || iesIndex.find((e) => norm(e.name).includes(k) || k.includes(norm(e.name))) || null;
}

/** Đọc 2 sheet VI TRI TRU + VUNG TINH (mảng object theo tiêu đề dòng 1). */
export function parseAreaRows({ poleRows = [], areaRows = [] }, iesIndex = []) {
  const warnings = [], poles = [], areas = [];
  poleRows.forEach((row, i) => {
    const id = String(row[AREA_COLS.id] ?? `T${i + 1}`).trim() || `T${i + 1}`;
    const x = num(row[AREA_COLS.x]), y = num(row[AREA_COLS.y]), H = num(row[AREA_COLS.H]);
    if (x == null && y == null && H == null && !row[AREA_COLS.ies]) return;    // dòng trống
    if (x == null || y == null || H == null) { warnings.push(`Trụ ${id}: thiếu x, y hoặc cao H — bỏ qua`); return; }
    const want = row[AREA_COLS.ies];
    let ies = matchAreaIes(want, iesIndex);
    if (want && !ies) warnings.push(`Trụ ${id}: không tìm thấy file IES "${want}" trong thư mục`);
    if (ies && ies.ph && ies.ph.photometricType !== 1) {
      warnings.push(`Trụ ${id}: file IES ${ies.name} là trắc quang loại ${ies.ph.photometricType === 2 ? "B" : "A"} — chưa hỗ trợ (chỉ loại C)`);
      ies = null;
    }
    poles.push({ id, x, y, H, aim: num(row[AREA_COLS.aim]) ?? 0, tilt: num(row[AREA_COLS.tilt]) ?? 0,
      n: Math.max(1, Math.round(num(row[AREA_COLS.n]) ?? 1)), ies: ies || null, iesWant: want ? String(want) : "" });
  });
  areaRows.forEach((row, i) => {
    const name = String(row[AREA_COLS.area] ?? `Vùng ${i + 1}`).trim() || `Vùng ${i + 1}`;
    const poly = parsePoly(row[AREA_COLS.poly]);
    const L = num(row[AREA_COLS.L]), W = num(row[AREA_COLS.W]);
    if (row[AREA_COLS.poly] && !poly) { warnings.push(`Vùng ${name}: đa giác "${row[AREA_COLS.poly]}" không hợp lệ — ghi dạng "x y; x y; x y" (ít nhất 3 đỉnh)`); if (!(L > 0 && W > 0)) return; }
    if (!poly && !(L > 0 && W > 0)) { if (row[AREA_COLS.area]) warnings.push(`Vùng ${name}: thiếu kích thước (Dài, Rộng) hoặc đa giác — bỏ qua`); return; }
    const base = findReq(row[AREA_COLS.req]);
    if (row[AREA_COLS.req] && !base) warnings.push(`Vùng ${name}: không có mã yêu cầu "${row[AREA_COLS.req]}" — xem sheet YEU CAU`);
    const eav = num(row[AREA_COLS.reqEav]), uo = num(row[AREA_COLS.reqUo]);
    let req = null;
    if (base) req = { id: base.id, Eav: eav ?? base.Eav, Uo: uo ?? base.Uo, label: base.label };
    else if (eav != null || uo != null) req = { id: null, Eav: eav, Uo: uo, label: "Yêu cầu tự nhập" };
    let MF = num(row[AREA_COLS.mf]);
    if (MF != null && MF > 1 && MF <= 100) MF /= 100;
    if (MF != null && !(MF >= 0.3 && MF <= 1)) { warnings.push(`Vùng ${name}: MF không hợp lệ — dùng MF chung`); MF = null; }
    areas.push({ name, poly, x0: num(row[AREA_COLS.x0]) ?? 0, y0: num(row[AREA_COLS.y0]) ?? 0, L, W,
      step: num(row[AREA_COLS.step]), req, MF });
  });
  return { poles, areas, warnings };
}

// ------------------------------------------------------------------ Excel
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin", color: { argb: "FFD0D7E2" } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };
function headRow(ws, head, argb = "FF1F4E79", widths = []) {
  const row = ws.getRow(1);
  head.forEach((h, i) => { const c = row.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; c.fill = fill(argb); c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = BORDER; ws.getColumn(i + 1).width = widths[i] || 12; });
  row.height = 34;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
const bodyRow = (ws, vals) => { const row = ws.addRow(vals); row.eachCell({ includeEmpty: true }, (c) => { c.border = BORDER; c.font = { size: 10 }; }); return row; };
const polyText = (poly) => poly ? poly.map(([x, y]) => `${x} ${y}`).join("; ") : null;
const ies0 = (p) => (p.ies ? p.ies.name.replace(/\.ies$/i, "") : p.iesWant || null);

function polesSheet(wb, poles) {
  const ws = wb.addWorksheet("VI TRI TRU");
  headRow(ws, POLE_HEAD, "FF1F4E79", [8, 10, 10, 10, 12, 12, 8, 34]);
  for (const p of poles) bodyRow(ws, [p.id, p.x, p.y, p.H, p.aim, p.tilt, p.n, ies0(p)]);
  return ws;
}
function areasSheet(wb, areas) {
  const ws = wb.addWorksheet("VUNG TINH");
  headRow(ws, AREA_HEAD, "FF0E7C7B", [18, 24, 11, 9, 8, 8, 11, 11, 26, 10, 7]);
  for (const a of areas) bodyRow(ws, [a.name, a.req && a.req.id || null, a.req ? a.req.Eav ?? null : null, a.req ? a.req.Uo ?? null : null,
    a.poly ? null : a.x0, a.poly ? null : a.y0, a.poly ? null : a.L, a.poly ? null : a.W, polyText(a.poly), a.step ?? null, a.MF ?? null]);
  return ws;
}
function reqSheet(wb) {
  const ws = wb.addWorksheet("YEU CAU");
  headRow(ws, ["Mã yêu cầu", "Nhóm", "Đối tượng", "Eav ≥ (lx)", "Uo ≥", "Nguồn"], "FF5B3F99", [30, 26, 60, 10, 8, 24]);
  for (const r of AREA_REQS) bodyRow(ws, [r.id, r.group, r.label, r.Eav, r.Uo ?? "—", r.source]);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
  return ws;
}

/** Workbook kết quả: trụ (sau khi sửa trên app), vùng, kết quả, lưới E từng vùng. */
export async function buildAreaWorkbook(ExcelJS, { poles, areas, result, projectName = "", version = VERSION, date = new Date() }) {
  const wb = new ExcelJS.Workbook(); wb.creator = `WebDialux-CS ${version}`; wb.created = date;
  polesSheet(wb, poles); areasSheet(wb, areas);
  const ws = wb.addWorksheet("KET QUA");
  ws.mergeCells("A1:J1"); ws.getCell("A1").value = "KẾT QUẢ TÍNH CHIẾU SÁNG KHU VỰC" + (projectName ? " — " + projectName : "");
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1F4E79" } };
  ws.mergeCells("A2:J2"); ws.getCell("A2").value = `Ngày tính ${date.toLocaleDateString("vi-VN")} · WebDialux-CS ${version} · ${result.nPoles} trụ · công suất ${(result.power / 1000).toFixed(2).replace(".", ",")} kW · độ rọi ngang duy trì`;
  ws.getCell("A2").font = { italic: true, size: 10, color: { argb: "FF5B6676" } };
  const H = ["Vùng", "Diện tích (m²)", "Số điểm", "MF", "Eav (lx)", "Emin (lx)", "Emax (lx)", "Uo = Emin/Eav", "Ud = Emin/Emax", "W/m² (tổng đèn / diện tích vùng)", "Yêu cầu", "Eav YC", "Uo YC", "Kết quả"];
  const hr = ws.getRow(4);
  H.forEach((h, i) => { const c = hr.getCell(i + 1); c.value = h; c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }; c.fill = fill("FF1F4E79"); c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; c.border = BORDER; });
  hr.height = 32;
  [18, 11, 8, 6, 9, 9, 9, 10, 10, 8, 40, 8, 8, 12].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  result.areas.forEach((a) => {
    const row = bodyRow(ws, [a.name, Math.round(a.grid.area * 10) / 10, a.E.length, a.MF, a.Eav, a.Emin, a.Emax, a.Uo, a.Ud, a.lpd,
      a.req ? (a.req.label || "") : "—", a.req ? a.req.Eav : null, a.req ? a.req.Uo : null, a.empty ? "vùng không có điểm tính" : a.req ? (a.pass ? "ĐẠT" : "KHÔNG ĐẠT") : "—"]);
    [5, 6, 7].forEach((k) => { row.getCell(k).numFmt = "0.0"; }); [8, 9, 10].forEach((k) => { row.getCell(k).numFmt = "0.00"; });
    const k = row.getCell(14); if (a.req) { k.fill = fill(a.pass ? "FFC6EFCE" : "FFFFC7CE"); k.font = { bold: true, color: { argb: a.pass ? "FF006100" : "FF9C0006" } }; }
  });
  result.areas.forEach((a, n) => {
    const name = ("LUOI E " + (n + 1) + " " + String(a.name).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[\\/?*[\]:]/g, " ")).slice(0, 31);
    const wg = wb.addWorksheet(name);
    const g = a.grid;
    wg.getCell(1, 1).value = "y \\ x (m)"; wg.getCell(1, 1).font = { bold: true };
    for (let i = 0; i < g.nx; i++) { const c = wg.getCell(1, i + 2); c.value = Math.round((g.x0 + g.dx * (i + 0.5)) * 100) / 100; c.font = { bold: true }; c.fill = fill("FFEEF1F6"); }
    for (let j = g.ny - 1, r = 2; j >= 0; j--, r++) {                 // y lớn ở trên như mặt bằng
      const c0 = wg.getCell(r, 1); c0.value = Math.round((g.y0 + g.dy * (j + 0.5)) * 100) / 100; c0.font = { bold: true }; c0.fill = fill("FFEEF1F6");
      for (let i = 0; i < g.nx; i++) { const k = g.cell[j * g.nx + i]; if (k >= 0) { const c = wg.getCell(r, i + 2); c.value = Math.round(a.E[k] * 10) / 10; } }
    }
    wg.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  });
  reqSheet(wb);
  return wb;
}

/** Excel mẫu khu vực: sân bóng đá mini 40 × 20 m, 6 trụ. */
export async function buildAreaTemplate(ExcelJS, { version = VERSION } = {}) {
  const wb = new ExcelJS.Workbook(); wb.creator = `WebDialux-CS ${version}`;
  const poles = [
    ["T1", -3, -2, 12, 35], ["T2", 20, -2, 12, 90], ["T3", 43, -2, 12, 145],
    ["T4", -3, 22, 12, -35], ["T5", 20, 22, 12, -90], ["T6", 43, 22, 12, -145],
  ].map(([id, x, y, H, aim]) => ({ id, x, y, H, aim, tilt: 35, n: 2, ies: null, iesWant: "(tên file IES)" }));
  const ws = polesSheet(wb, poles);
  ws.getColumn(8).eachCell((c, r) => { if (r > 1) c.value = null; });
  const areas = [{ name: "Sân bóng đá mini", x0: 0, y0: 0, L: 40, W: 20, step: 1, req: { id: "TCVN13608-B12-luyentap" }, MF: null }];
  areasSheet(wb, areas);
  reqSheet(wb);
  const wh = wb.addWorksheet("HUONG DAN");
  wh.getColumn(1).width = 4; wh.getColumn(2).width = 110;
  wh.getCell("B1").value = "HƯỚNG DẪN — CHẾ ĐỘ KHU VỰC TỰ DO (sân thể thao, công viên, quảng trường, bãi đỗ xe)";
  wh.getCell("B1").font = { bold: true, size: 13, color: { argb: "FF1F4E79" } };
  [
    "Toạ độ mặt bằng tính bằng mét: x sang phải, y lên trên (như bản vẽ CAD). Gốc toạ độ tuỳ chọn, nên đặt tại một góc vùng tính.",
    "Sheet VI TRI TRU: mỗi dòng một trụ. Hướng chiếu đo từ trục +x, ngược chiều kim đồng hồ (0° = +x, 90° = +y, 180° = −x, −90° = −y).",
    "Góc nghiêng: 0° = đèn chiếu thẳng xuống; tăng góc để hắt chùm sáng ra xa theo hướng chiếu (đèn pha sân thể thao thường 30°–60°).",
    "Số đèn: số bộ đèn giống nhau trên cùng trụ, cùng hướng. Trụ có đèn khác loại/khác hướng: ghi thành nhiều dòng cùng toạ độ.",
    "Bộ đèn (IES): tên file IES trong thư mục đã chọn (không cần đuôi .ies). App chỉ hỗ trợ file trắc quang loại C (đèn đường, đa số đèn pha LED).",
    "Sheet VUNG TINH: mỗi dòng một vùng. Hình chữ nhật: x0, y0, Dài theo x, Rộng theo y. Hoặc đa giác: \"x y; x y; x y\" (dấu chấm thập phân, dấu ; giữa các đỉnh).",
    "Mã yêu cầu: chọn trong sheet YEU CAU (TCVN 13608:2023, EN 12193). Ghi Eav/Uo yêu cầu để sửa ngưỡng hoặc tự đặt ngưỡng khi không dùng mã.",
    "Bước lưới để trống: app tự chọn (1 m với vùng nhỏ). MF để trống: dùng ô MF chung trên app.",
    "Trên app có thể kéo trụ, sửa bảng rồi bấm Tải Excel để lưu lại vị trí đã chỉnh. Mọi tính toán chạy trên máy, không gửi file lên mạng.",
  ].forEach((t, i) => { const c = wh.getCell(`B${i + 3}`); c.value = `${i + 1}. ${t}`; c.alignment = { wrapText: true, vertical: "top" }; wh.getRow(i + 3).height = 30; });
  return wb;
}
