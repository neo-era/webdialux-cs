// v2.2 — Excel mẫu (bảng cấp đường, định dạng), cột vỉa hè & dải phân cách, 3D có vỉa hè/dải phân cách.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { parseIES } from "../src/ies.mjs";
import { calcRoad, QCVN } from "../src/engine.mjs";
import { COLS, rowToGeometry } from "../src/mapping.mjs";
import { buildIesIndex, runBatch } from "../src/batch.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const here = dirname(fileURLToPath(import.meta.url));
const MAG = parseIES(readFileSync(join(here, "fixtures/MAGNOLIA-60W.ies"), "utf8"));
const iesDir = join(here, "../data/ies");
const idx = buildIesIndex(readdirSync(iesDir).filter((f) => f.endsWith(".ies")).map((f) => ({ name: f, text: readFileSync(join(iesDir, f), "utf8") })));
const base = { ies: MAG, H: 8, overhang: 1, spacing: 30, width: 7, lanes: 2, tilt: 10, arrangement: "1 bên", roadClass: "D1" };

// ---------- mapping ----------
test("mapping: đọc Độ rộng vỉa hè + Độ rộng dải phân cách; trống = null", () => {
  const g = rowToGeometry({ [COLS.H]: 8, [COLS.width]: 7, [COLS.spacing]: 30, [COLS.sidewalk]: "2,5", [COLS.dpc]: "có", [COLS.medianW]: 3 });
  assert.equal(g.input.sidewalk, 2.5);
  assert.equal(g.input.median, true);
  assert.equal(g.input.medianW, 3);
  const g0 = rowToGeometry({ [COLS.H]: 8, [COLS.width]: 7, [COLS.spacing]: 30 });
  assert.equal(g0.input.sidewalk, null);
  assert.equal(g0.input.median, false);
  assert.equal(g0.input.medianW, null);
});

test("mapping: cảnh báo khi trụ cách mép lớn hơn độ rộng vỉa hè", () => {
  const g = rowToGeometry({ [COLS.H]: 8, [COLS.width]: 7, [COLS.spacing]: 30, [COLS.setback]: 2, [COLS.sidewalk]: 1.5 });
  assert.ok(g.warnings.some((w) => /vỉa hè/.test(w)), g.warnings.join("; "));
});

test("mapping: median vẫn xác định khi có ghi Cấp đường (không chỉ lúc tự phân cấp)", () => {
  const g = rowToGeometry({ [COLS.H]: 8, [COLS.width]: 14, [COLS.spacing]: 30, [COLS.roadClass]: "B1", [COLS.dpc]: "có" });
  assert.equal(g.input.median, true);
});

// ---------- engine ----------
test("engine: không có vỉa hè → SR như cũ (dải min(5, W/2)); srWidth trả về", () => {
  const r = calcRoad(base);
  assert.equal(r.srWidth, 3.5);
  const r2 = calcRoad({ ...base, sidewalk: null });
  assert.equal(r2.road.SR, r.road.SR);
});

test("engine: vỉa hè hẹp giới hạn dải SR = min(5, W/2, vỉa hè) và đổi SR", () => {
  const r = calcRoad(base);
  const rs = calcRoad({ ...base, sidewalk: 2 });
  assert.equal(rs.srWidth, 2);
  assert.notEqual(rs.road.SR, r.road.SR);
  assert.equal(calcRoad({ ...base, sidewalk: 8 }).srWidth, 3.5, "vỉa hè rộng hơn → không vượt min(5, W/2)");
  // Ltb/Uo không đổi theo vỉa hè
  assert.equal(rs.road.Lav, r.road.Lav);
});

test("engine detail: Ewalk lưới E trên vỉa hè hai bên, kích thước khớp lưới dọc", () => {
  const r = calcRoad({ ...base, sidewalk: 3, detail: true });
  assert.ok(r.Ewalk, "có Ewalk");
  assert.equal(r.Ewalk.w, 3);
  assert.equal(r.Ewalk.left.length, r.Ewalk.ys.length);
  assert.equal(r.Ewalk.left[0].length, r.grid.nLong);
  assert.equal(r.Ewalk.right[0].length, r.grid.nLong);
  for (const row of [...r.Ewalk.left, ...r.Ewalk.right]) for (const v of row) assert.ok(v >= 0 && isFinite(v));
  // đối xứng → hai vỉa hè sáng như nhau; 1 bên → khác nhau và đều > 0
  const avg = (m) => m.flat().reduce((a, b) => a + b, 0) / m.flat().length;
  const rs = calcRoad({ ...base, arrangement: "đối xứng", sidewalk: 3, detail: true });
  assert.ok(Math.abs(avg(rs.Ewalk.left) - avg(rs.Ewalk.right)) < 1e-6 * avg(rs.Ewalk.left) + 1e-9);
  assert.ok(avg(r.Ewalk.left) > 0 && avg(r.Ewalk.right) > 0 && avg(r.Ewalk.left) !== avg(r.Ewalk.right));
  // không ghi vỉa hè → bề rộng vẽ mặc định max(3, setback+1)
  assert.equal(calcRoad({ ...base, setback: 2.5, detail: true }).Ewalk.w, 3.5);
  assert.equal(calcRoad(base).Ewalk, undefined, "không detail → không tốn tính");
});

// ---------- bố trí ngang cho hình vẽ ----------
test("lateralLayout: chèn dải phân cách giữa, ánh xạ toạ độ tính ↔ toạ độ vẽ", async () => {
  const { lateralLayout } = await import("../src/report.mjs");
  const L0 = lateralLayout({ width: 7, median: false, sidewalk: 3 });
  assert.equal(L0.mW, 0); assert.equal(L0.Wt, 7); assert.equal(L0.walk, 3);
  assert.deepEqual(L0.classify(-3.5 + 0.1).kind, "road");
  assert.deepEqual(L0.classify(-3.5 - 1).kind, "walk");
  const L = lateralLayout({ width: 14, median: true, medianW: 2, sidewalk: 4 });
  assert.equal(L.Wt, 16);
  assert.equal(L.classify(0).kind, "median");
  assert.equal(L.classify(-8 - 2).kind, "walk");
  assert.ok(Math.abs(L.toDraw(0) - -8) < 1e-9, "mép gần (y=0) ở -Wt/2");
  assert.ok(Math.abs(L.toDraw(14) - 8) < 1e-9, "mép xa (y=W) ở +Wt/2");
  assert.ok(Math.abs(L.toDraw(7 - 1e-9) - -1) < 1e-6, "giữa lòng đường gần → sát dải phân cách");
  const c = L.classify(L.toDraw(3));
  assert.equal(c.kind, "road"); assert.ok(Math.abs(c.y - 3) < 1e-9, "khứ hồi road");
  assert.equal(lateralLayout({ width: 14, median: true }).mW, 2, "thiếu bề rộng → 2 m");
});

test("3D: có dải phân cách → giữa ảnh gần là màu dải (xanh cỏ), không có → mặt đường", async () => {
  const { createCanvas } = require("@napi-rs/canvas");
  const doc = { createElement: () => createCanvas(10, 10) };
  const { perspective3DDataURL, lateralLayout } = await import("../src/report.mjs");
  const { loadImage } = require("@napi-rs/canvas");
  const pix = async (url, x, y) => {
    const img = await loadImage(Buffer.from(url.split(",")[1], "base64"));
    const cv = createCanvas(img.width, img.height); const cx = cv.getContext("2d"); cx.drawImage(img, 0, 0);
    const K = img.width / 840;                                          // ảnh 3D vẽ ở độ phân giải K× (toạ độ thử theo khung logic 840 × 400)
    return cx.getImageData(Math.round(x * K), Math.round(y * K), 1, 1).data;
  };
  const input = { ...base, width: 14, lanes: 4, arrangement: "đối xứng", detail: true, setback: 1, sidewalk: 3 };
  const res = calcRoad(input);
  const d = { install: { ...input }, luminaire: { cct: 4000 } };
  const withM = perspective3DDataURL({ ...d, install: { ...d.install, median: true, medianW: 3 } }, res, doc);
  const noM = perspective3DDataURL(d, res, doc);
  const a = await pix(withM, 420, 250), b = await pix(noM, 420, 250);
  assert.ok(a[1] > a[0] && a[1] > a[2], `dải phân cách xanh: ${a}`);
  assert.ok(!(b[1] > b[0] + 10 && b[1] > b[2] + 10), `không dải → không xanh: ${b}`);
  // vỉa hè: pixel ở vùng hè bên trái gần đáy ảnh có màu (không còn nền đất tối)
  const L = lateralLayout(d.install);
  const sy = 250, horizonY = 400 * 0.40, f = 620, hCam = 1.7, d0 = 10;
  const xw = f * hCam / (sy - horizonY) - d0, kx = (xw + d0) / f;
  const yWalk = -L.Wt / 2 - L.walk / 2; const sx = Math.round(420 + yWalk / kx);
  if (sx > 0) { const w = await pix(noM, sx, sy); assert.ok(w[0] + w[1] + w[2] > 3 * 40, `vỉa hè có sáng: ${w}`); }
});

// ---------- Excel mẫu ----------
test("template: 3 sheet, DU LIEU TUYEN header dòng 1 có cột mới, định dạng, danh sách chọn", async () => {
  const { buildTemplateWorkbook, TEMPLATE_HEAD } = await import("../src/template.mjs");
  const wb = await buildTemplateWorkbook(ExcelJS, { version: "vX" });
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["DU LIEU TUYEN", "CAP DUONG QCVN07-7-23", "HUONG DAN"]);
  const ws = wb.getWorksheet("DU LIEU TUYEN");
  const hdr = ws.getRow(1).values.slice(1);
  for (const c of [COLS.sidewalk, COLS.medianW, COLS.H, COLS.width, COLS.spacing, COLS.setback, COLS.arrangement, COLS.dpc, COLS.lanes, COLS.loaituyen, COLS.roadClass])
    assert.ok(hdr.includes(c), `thiếu cột ${c}`);
  assert.deepEqual(hdr, TEMPLATE_HEAD);
  assert.ok(!hdr.some((h) => /KQ|Điểm|Xếp hạng|\(chọn\)/.test(h)), "không còn cột kết quả cũ");
  assert.ok(hdr.indexOf(COLS.sidewalk) === hdr.indexOf(COLS.setback) + 1, "vỉa hè đứng ngay sau khoảng cách trụ-mép");
  assert.ok(hdr.indexOf(COLS.medianW) === hdr.indexOf(COLS.dpc) + 1, "bề rộng dải ngay sau Dải phân cách giữa");
  const h1 = ws.getRow(1).getCell(hdr.indexOf(COLS.H) + 1);
  assert.ok(h1.fill && h1.fill.fgColor && h1.fill.fgColor.argb, "header có màu");
  assert.ok(h1.note, "header có ghi chú");
  ws.getRow(1).eachCell((cl) => assert.equal(cl.alignment && cl.alignment.wrapText, true, `tiêu đề ${cl.value} phải xuống dòng`));
  assert.equal(ws.views[0].state, "frozen");
  assert.ok(ws.autoFilter, "có bộ lọc");
  // danh sách chọn kiểm trên FILE thật (ghi ra rồi đọc lại)
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(await wb.xlsx.writeBuffer());
  const ws2 = wb2.getWorksheet("DU LIEU TUYEN");
  const dv = ws2.getCell(2, hdr.indexOf(COLS.roadClass) + 1).dataValidation;
  assert.equal(dv && dv.type, "list");
  assert.match(String(dv.formulae[0]), /A.*B1.*E/);
  const dvA = ws2.getCell(500, hdr.indexOf(COLS.arrangement) + 1).dataValidation;
  const dvL = ws2.getCell(2, hdr.indexOf(COLS.loaituyen) + 1).dataValidation;
  assert.match(String(dvL && dvL.formulae[0]), /CAP DUONG QCVN07-7-23/, "Loại tuyến chọn từ bảng ở sheet 2");
  assert.equal(dvA && dvA.type, "list");
});

test("template: sheet CAP DUONG đúng bảng QCVN 07-7:2023 (lấy từ engine) + bảng Loại tuyến", async () => {
  const { buildTemplateWorkbook } = await import("../src/template.mjs");
  const wb = await buildTemplateWorkbook(ExcelJS);
  const ws = wb.getWorksheet("CAP DUONG QCVN07-7-23");
  const found = {};
  ws.eachRow((row) => {
    const k = row.getCell(1).value;
    if (typeof k === "string" && QCVN[k]) found[k] = [row.getCell(3).value, row.getCell(4).value, row.getCell(5).value, row.getCell(6).value, row.getCell(7).value, String(row.getCell(2).value)];
  });
  assert.deepEqual(Object.keys(found), ["A", "B1", "B2", "C1", "C2", "D1", "D2", "E"]);
  for (const [k, v] of Object.entries(found)) assert.deepEqual(v.slice(0, 5), [QCVN[k].Ltb, QCVN[k].Uo, QCVN[k].Ul, QCVN[k].TI, QCVN[k].SR], k);
  assert.match(found.A[5], /cao tốc/i);
  assert.match(found.B1[5], /có dải phân cách/);
  assert.match(found.D2[5], /hè tối/);
  let loai = false; ws.eachRow((row) => { if (/Đường trục chính đô thị/.test(String(row.getCell(2).value)) && row.getCell(3).value === "B1 / B2") loai = true; });
  assert.ok(loai, "có bảng Loại tuyến → cấp");
});

test("template: xuất ra file, app đọc lại bằng SheetJS và chạy được các dòng mẫu", async () => {
  const { buildTemplateWorkbook } = await import("../src/template.mjs");
  const wb = await buildTemplateWorkbook(ExcelJS);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const wbr = XLSX.read(buf, { type: "buffer" });
  assert.ok(wbr.SheetNames.includes("DU LIEU TUYEN"));
  const rows = XLSX.utils.sheet_to_json(wbr.Sheets["DU LIEU TUYEN"], { defval: null });
  assert.ok(rows.length >= 3);
  const res = runBatch(rows, idx, { MF: 0.8, q0: 0.08 });
  assert.ok(res.every((r) => r.status === "ok"), res.map((r) => r.status + ":" + (r.reason || "")).join(" | "));
  const gm = rows.map(rowToGeometry);
  assert.ok(gm.some((g) => g.input.median && g.input.medianW > 0), "có dòng mẫu có dải phân cách");
  assert.ok(gm.every((g) => g.input.sidewalk > 0), "mọi dòng mẫu có vỉa hè");
});

test("template: dòng mẫu không chỉ định bộ đèn (để app tự chọn)", async () => {
  const { buildTemplateWorkbook } = await import("../src/template.mjs");
  const wb = await buildTemplateWorkbook(ExcelJS);
  const rows = XLSX.utils.sheet_to_json(XLSX.read(Buffer.from(await wb.xlsx.writeBuffer()), { type: "buffer" }).Sheets["DU LIEU TUYEN"], { defval: null });
  for (const r of rows) for (const c of [COLS.fitting, COLS.model, COLS.ncc, COLS.power, "CCT (K)", "CRI"]) assert.equal(r[c], null, `${r[COLS.tuyen]}: ${c}`);
});
