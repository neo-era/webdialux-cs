// v2.4 — chế độ "Khu vực tự do": trụ khai báo tự do, tính lưới độ rọi trên vùng, đánh giá theo bảng yêu cầu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { parseIES, makeIntensity } from "../src/ies.mjs";
import { buildIesIndex } from "../src/batch.mjs";
import { AREA_COLS, poleToLums, calcArea, parseAreaRows, buildAreaWorkbook, areaGrid } from "../src/area.mjs";
import { AREA_REQS, findReq } from "../src/areaReq.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const here = dirname(fileURLToPath(import.meta.url));
const SLtxt = readFileSync(join(here, "fixtures/SL-70W.ies"), "utf8");
const SL = parseIES(SLtxt);
const idx = buildIesIndex([{ name: "SL-70W.ies", text: SLtxt }]);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// ---------- bảng yêu cầu ----------
test("bảng yêu cầu: TCVN 13608:2023 và EN 12193 có đủ mục chính, số đúng văn bản", () => {
  const f = (id) => { const r = findReq(id); assert.ok(r, id); return r; };
  assert.deepEqual([f("TCVN13608-B12-luyentap").Eav, f("TCVN13608-B12-luyentap").Uo], [300, 0.4]);
  assert.deepEqual([f("TCVN13608-B12-thidau").Eav, f("TCVN13608-B12-thidau").Uo], [500, 0.5]);
  assert.deepEqual([f("TCVN13608-B13-luyentap").Eav, f("TCVN13608-B13-luyentap").Uo], [300, 0.4]);
  assert.deepEqual([f("TCVN13608-B14-thidau").Eav, f("TCVN13608-B14-thidau").Uo], [500, 0.5]);
  assert.equal(f("TCVN13608-B7-I-cv-santhoatdong").Eav, 20);
  assert.equal(f("TCVN13608-B7-I-cv-santhoatdong").Uo, null, "Bảng 7 không quy định Uo");
  assert.deepEqual([f("TCVN13608-B6-trungtam").Eav, f("TCVN13608-B6-trungtam").Uo], [30, 0.2]);
  assert.deepEqual([f("EN12193-bongda-II").Eav, f("EN12193-bongda-II").Uo], [200, 0.6]);
  assert.deepEqual([f("EN12193-tennis-III").Eav, f("EN12193-tennis-III").Uo], [200, 0.6]);
  for (const r of AREA_REQS) assert.ok(r.id && r.label && r.source && r.Eav > 0, r.id);
  assert.equal(new Set(AREA_REQS.map((r) => r.id)).size, AREA_REQS.length, "mã không trùng");
});

// ---------- tư thế trụ ----------
test("poleToLums: hướng chiếu 0° = +x, 90° = +y; nghiêng đẩy chùm sáng về phía hướng chiếu", () => {
  const I = makeIntensity(SL);
  return import("../src/photometry.mjs").then(({ illuminanceAtPoint }) => {
    const E = (pole, P) => illuminanceAtPoint(P, poleToLums(pole), I, 1);
    const down = { x: 0, y: 0, H: 10, aim: 0, tilt: 0, n: 1 };
    // chiếu thẳng xuống: điểm ngay dưới đèn = I(γ=0)/H²
    assert.ok(rel(E(down, { x: 0, y: 0 }), I(0, 0) / 100) < 1e-9);
    for (const aim of [0, 90, 180, -90]) {
      const p = { ...down, aim, tilt: 30 };
      const a = aim * Math.PI / 180, fwd = { x: 8 * Math.cos(a), y: 8 * Math.sin(a) }, back = { x: -fwd.x, y: -fwd.y };
      assert.ok(E(p, fwd) > 2 * E(p, back), `aim ${aim}: phía trước sáng hơn phía sau`);
    }
    // n đèn/trụ
    assert.ok(rel(E({ ...down, n: 3 }, { x: 2, y: 1 }), 3 * E(down, { x: 2, y: 1 })) < 1e-9);
  });
});

// ---------- lưới & tính ----------
test("areaGrid: hình chữ nhật chia ô đều; đa giác chỉ lấy điểm bên trong", () => {
  const g = areaGrid({ x0: 0, y0: 0, L: 40, W: 20, step: 2 });
  assert.equal(g.points.length, 20 * 10);
  assert.deepEqual([g.nx, g.ny], [20, 10]);
  assert.deepEqual(g.points[0], { x: 1, y: 1 });
  const tri = areaGrid({ poly: [[0, 0], [10, 0], [0, 10]], step: 1 });
  assert.ok(tri.points.length > 40 && tri.points.length < 55, `${tri.points.length}`);
  for (const p of tri.points) assert.ok(p.x + p.y < 10);
  // bước lưới mặc định tự chọn khi trống: ≤ 1 m với sân nhỏ, số điểm có giới hạn với vùng lớn
  const big = areaGrid({ x0: 0, y0: 0, L: 400, W: 300 });
  assert.ok(big.points.length <= 40000 && big.points.length >= 5000);
});

test("calcArea: 4 trụ đối xứng → lưới đối xứng; Eav/Emin/Emax/Uo/Ud; Đạt theo yêu cầu", () => {
  const poles = [[-2, -2, 45], [42, -2, 135], [42, 22, -135], [-2, 22, -45]].map(([x, y, aim], i) =>
    ({ id: "T" + (i + 1), x, y, H: 12, aim, tilt: 40, n: 2, ies: idx[0] }));
  const area = { name: "Sân", x0: 0, y0: 0, L: 40, W: 20, step: 1, req: { Eav: 20, Uo: 0.1 }, MF: 0.8 };
  const r = calcArea({ poles, areas: [area] });
  const a = r.areas[0];
  assert.equal(a.E.length, 800);
  const at = (i, j) => a.E[j * a.grid.nx + i];
  for (let i = 0; i < 40; i++) for (let j = 0; j < 20; j++) assert.ok(rel(at(i, j), at(39 - i, 19 - j)) < 1e-6);
  assert.ok(a.Emin <= a.Eav && a.Eav <= a.Emax);
  assert.ok(Math.abs(a.Uo - a.Emin / a.Eav) < 1e-12 && Math.abs(a.Ud - a.Emin / a.Emax) < 1e-12);
  assert.equal(a.pass, a.Eav >= 20 && Math.round(a.Uo * 100) / 100 >= 0.1);
  assert.ok(rel(a.power, 8 * 73.5) < 1e-9, "công suất = số đèn × P");
  assert.ok(rel(a.lpd, a.power / 800) < 1e-9, "W/m²");
  // MF tuyến tính
  const r2 = calcArea({ poles, areas: [{ ...area, MF: 0.4 }] });
  assert.ok(rel(r2.areas[0].Eav, a.Eav / 2) < 1e-9);
  // chỉ tiêu không có yêu cầu thì bỏ qua khi xét Đạt
  assert.equal(calcArea({ poles, areas: [{ ...area, req: { Eav: 1, Uo: null } }] }).areas[0].pass, true);
  assert.equal(calcArea({ poles, areas: [{ ...area, req: { Eav: 1e6 } }] }).areas[0].pass, false);
});

// ---------- đọc Excel ----------
test("parseAreaRows: đọc trụ + vùng (số dấu phẩy, đa giác, mã yêu cầu); khớp IES; cảnh báo thiếu", () => {
  const poleRows = [
    { [AREA_COLS.id]: "T1", [AREA_COLS.x]: "-2,5", [AREA_COLS.y]: 0, [AREA_COLS.H]: 12, [AREA_COLS.aim]: 45, [AREA_COLS.tilt]: 30, [AREA_COLS.n]: 2, [AREA_COLS.ies]: "SL-70W" },
    { [AREA_COLS.id]: "T2", [AREA_COLS.x]: 10, [AREA_COLS.y]: 0, [AREA_COLS.H]: 12, [AREA_COLS.ies]: "KHONG-CO" },
    { [AREA_COLS.id]: "T3", [AREA_COLS.y]: 5, [AREA_COLS.H]: 12, [AREA_COLS.ies]: "SL-70W" },
  ];
  const areaRows = [
    { [AREA_COLS.area]: "Sân bóng", [AREA_COLS.req]: "EN12193-bongda-III", [AREA_COLS.x0]: 0, [AREA_COLS.y0]: 0, [AREA_COLS.L]: 40, [AREA_COLS.W]: 20, [AREA_COLS.step]: 2 },
    { [AREA_COLS.area]: "Bồn hoa", [AREA_COLS.poly]: "0,0; 10,0; 5,8", [AREA_COLS.reqEav]: 15, [AREA_COLS.mf]: "0,7" },
  ];
  const s = parseAreaRows({ poleRows, areaRows }, idx);
  assert.equal(s.poles.length, 2, "dòng thiếu x bị loại");
  assert.equal(s.poles[0].x, -2.5);
  assert.equal(s.poles[0].ies.name, "SL-70W.ies");
  assert.equal(s.poles[1].ies, null);
  assert.ok(s.warnings.some((w) => /T2.*IES/.test(w)));
  assert.ok(s.warnings.some((w) => /T3/.test(w)));
  assert.equal(s.poles[1].aim, 0); assert.equal(s.poles[1].tilt, 0); assert.equal(s.poles[1].n, 1);
  assert.deepEqual(s.areas[0].req, { id: "EN12193-bongda-III", Eav: 75, Uo: 0.5, label: findReq("EN12193-bongda-III").label });
  assert.deepEqual(s.areas[1].poly, [[0, 0], [10, 0], [5, 8]]);
  assert.equal(s.areas[1].req.Eav, 15); assert.equal(s.areas[1].MF, 0.7);
  // ghi đè ngưỡng của mã chuẩn bằng cột Eav/Uo yêu cầu
  const s2 = parseAreaRows({ poleRows, areaRows: [{ ...areaRows[0], [AREA_COLS.reqUo]: 0.65 }] }, idx);
  assert.equal(s2.areas[0].req.Eav, 75); assert.equal(s2.areas[0].req.Uo, 0.65);
});

// ---------- xuất Excel + khứ hồi ----------
test("buildAreaWorkbook: sheet VI TRI TRU/VUNG TINH/KET QUA/lưới; đọc lại ra đúng trụ & vùng", async () => {
  const poles = [{ id: "T1", x: -2, y: -2, H: 12, aim: 45, tilt: 40, n: 2, ies: idx[0] }, { id: "T2", x: 42, y: 22, H: 12, aim: -135, tilt: 40, n: 2, ies: idx[0] }];
  const areas = [{ name: "Sân", x0: 0, y0: 0, L: 40, W: 20, step: 2, req: { id: "EN12193-bongda-III", Eav: 75, Uo: 0.5 }, MF: 0.8 }];
  const res = calcArea({ poles, areas });
  const wb = await buildAreaWorkbook(ExcelJS, { poles, areas, result: res, projectName: "Test" });
  const names = wb.worksheets.map((w) => w.name);
  for (const n of ["VI TRI TRU", "VUNG TINH", "KET QUA"]) assert.ok(names.includes(n), n);
  assert.ok(names.some((n) => /^LUOI E/.test(n)));
  const wbr = XLSX.read(Buffer.from(await wb.xlsx.writeBuffer()), { type: "buffer" });
  const back = parseAreaRows({
    poleRows: XLSX.utils.sheet_to_json(wbr.Sheets["VI TRI TRU"], { defval: null }),
    areaRows: XLSX.utils.sheet_to_json(wbr.Sheets["VUNG TINH"], { defval: null }),
  }, idx);
  assert.deepEqual(back.poles.map((p) => [p.id, p.x, p.y, p.H, p.aim, p.tilt, p.n, p.ies && p.ies.name]),
    poles.map((p) => [p.id, p.x, p.y, p.H, p.aim, p.tilt, p.n, p.ies.name]));
  assert.equal(back.areas[0].L, 40); assert.equal(back.areas[0].req.id, "EN12193-bongda-III");
  const r2 = calcArea(back);
  assert.ok(rel(r2.areas[0].Eav, res.areas[0].Eav) < 1e-9, "khứ hồi cho cùng kết quả");
});

test("IES không phải loại C → cảnh báo, không tính bộ đèn đó", () => {
  const bTxt = SLtxt.replace(/\n1 10366 1 91 37 1 2 /, "\n1 10366 1 91 37 2 2 ");
  const idxB = buildIesIndex([{ name: "B.ies", text: bTxt }]);
  const s = parseAreaRows({ poleRows: [{ [AREA_COLS.id]: "T1", [AREA_COLS.x]: 0, [AREA_COLS.y]: 0, [AREA_COLS.H]: 10, [AREA_COLS.ies]: "B" }], areaRows: [] }, idxB);
  assert.equal(s.poles[0].ies, null);
  assert.ok(s.warnings.some((w) => /loại B/.test(w)), s.warnings.join("; "));
});

test("template khu vực: sheet VI TRI TRU + VUNG TINH (dòng 1 là tiêu đề) + YEU CAU; đọc lại chạy được", async () => {
  const { buildAreaTemplate } = await import("../src/area.mjs");
  const wb = await buildAreaTemplate(ExcelJS);
  const names = wb.worksheets.map((w) => w.name);
  for (const n of ["VI TRI TRU", "VUNG TINH", "YEU CAU", "HUONG DAN"]) assert.ok(names.includes(n), n);
  const wbr = XLSX.read(Buffer.from(await wb.xlsx.writeBuffer()), { type: "buffer" });
  const s = parseAreaRows({
    poleRows: XLSX.utils.sheet_to_json(wbr.Sheets["VI TRI TRU"], { defval: null }),
    areaRows: XLSX.utils.sheet_to_json(wbr.Sheets["VUNG TINH"], { defval: null }),
  }, []);
  assert.ok(s.poles.length >= 4 && s.areas.length >= 1);
  assert.ok(s.areas[0].req && s.areas[0].req.Eav > 0);
});

// ---------- bổ sung sau review độc lập ----------
test("xuất Excel giữ ngưỡng đã sửa đè mã chuẩn (khứ hồi)", async () => {
  const poles = [{ id: "T1", x: 0, y: 0, H: 10, aim: 0, tilt: 20, n: 1, ies: idx[0] }];
  const areas = [{ name: "Sân", x0: 0, y0: 0, L: 10, W: 10, step: 2, req: { id: "TCVN13608-B12-luyentap", Eav: 350, Uo: 0.45, label: "x" }, MF: null }];
  const wb = await buildAreaWorkbook(ExcelJS, { poles, areas, result: calcArea({ poles, areas }) });
  const wbr = XLSX.read(Buffer.from(await wb.xlsx.writeBuffer()), { type: "buffer" });
  const back = parseAreaRows({ poleRows: XLSX.utils.sheet_to_json(wbr.Sheets["VI TRI TRU"], { defval: null }), areaRows: XLSX.utils.sheet_to_json(wbr.Sheets["VUNG TINH"], { defval: null }) }, idx);
  assert.deepEqual([back.areas[0].req.id, back.areas[0].req.Eav, back.areas[0].req.Uo], ["TCVN13608-B12-luyentap", 350, 0.45]);
});

test("vùng kích thước 0/âm hoặc đa giác quá nhỏ → vùng rỗng, không Infinity, không vỡ Excel/PDF", async () => {
  const poles = [{ id: "T1", x: 0, y: 0, H: 10, aim: 0, tilt: 20, n: 1, ies: idx[0] }];
  assert.equal(areaGrid({ x0: 0, y0: 0, L: -5, W: 10 }).points.length, 0);
  const r = calcArea({ poles, areas: [{ name: "Âm", x0: 0, y0: 0, L: -5, W: 10 }, { name: "Thẳng hàng", poly: [[0, 0], [5, 0], [10, 0]], step: 1 }] });
  for (const a of r.areas) { assert.equal(a.empty, true); assert.equal(a.pass, false); assert.equal(a.Eav, null); }
  const wb = await buildAreaWorkbook(ExcelJS, { poles, areas: [{ name: "Âm", x0: 0, y0: 0, L: -5, W: 10 }], result: r });
  assert.ok((await wb.xlsx.writeBuffer()).byteLength > 1000);
});

test("đa giác: chấp nhận 'x y; x y' với dấu phẩy thập phân; đa giác sai → cảnh báo rõ", () => {
  const s = parseAreaRows({ areaRows: [
    { [AREA_COLS.area]: "A", [AREA_COLS.poly]: "0,5 0; 10 0; 5 8,5" },
    { [AREA_COLS.area]: "B", [AREA_COLS.poly]: "0 0; 10" },
  ] }, idx);
  assert.deepEqual(s.areas[0].poly, [[0.5, 0], [10, 0], [5, 8.5]]);
  assert.ok(s.warnings.some((w) => /B.*đa giác.*không hợp lệ/.test(w)), s.warnings.join("; "));
});
