// v2.3 — tính theo tư thế đèn lắp đặt thật; đối chiếu DIALux ca Cầu Bình Triệu 2 (cùng file IES + báo cáo DIALux).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseIES, makeIntensity, integrateFlux } from "../src/ies.mjs";
import { calcRoad } from "../src/engine.mjs";
import { COLS, rowToGeometry } from "../src/mapping.mjs";
import { buildLuminaires } from "../src/geometry.mjs";
import { maxIntensityPerKlm, upwardRatio, energyIndicators } from "../src/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SL = parseIES(readFileSync(join(here, "fixtures/SL-70W.ies"), "utf8"));
const MAG = parseIES(readFileSync(join(here, "fixtures/MAGNOLIA-60W.ies"), "utf8"));
// Báo cáo DIALux "Cầu Bình Triệu 2": SL7B 70W, đối xứng, S 35, H 10,5, overhang 0, nghiêng 15°, W 13, 3 làn, MF 0,67, R3 q0 0,08
const BT2 = { ies: SL, H: 10.5, overhang: 0, spacing: 35, width: 13, lanes: 3, tilt: 15, arrangement: "đối xứng", MF: 0.67, q0: 0.08, roadClass: "D1" };
const DLX = { Lav: 1.38, Uo: 0.75, Ul: 0.90, TI: 9, SR: 0.56, I70: 538, I80: 284, I90: 10.1, Wkm: 4263 };
const rel = (a, b) => Math.abs(a - b) / b;

// ---------- IES: ballast factor ----------
test("IES: mặc định KHÔNG nhân ballast factor (như DIALux) — quang thông tích phân ≈ quang thông khai báo", () => {
  assert.equal(SL.ballastFactor, 0.961, "vẫn đọc giữ BF để hiển thị");
  assert.ok(rel(integrateFlux(SL), SL.totalLumens) < 0.01, `tích phân ${integrateFlux(SL)} vs ${SL.totalLumens}`);
  const withBF = parseIES(readFileSync(join(here, "fixtures/SL-70W.ies"), "utf8"), { applyBallast: true });
  assert.ok(rel(integrateFlux(withBF), SL.totalLumens * 0.961) < 0.01, "tuỳ chọn applyBallast vẫn dùng được");
});

// ---------- Đối chiếu DIALux ----------
test("DIALux Cầu Bình Triệu 2: Ltb, Uo, Ul, TI khớp báo cáo", () => {
  const r = calcRoad(BT2);
  assert.ok(rel(r.road.Lav, DLX.Lav) <= 0.03, `Lav ${r.road.Lav.toFixed(3)} vs ${DLX.Lav}`);
  assert.ok(Math.abs(r.road.Uo - DLX.Uo) <= 0.02, `Uo ${r.road.Uo.toFixed(3)}`);
  assert.ok(Math.abs(r.road.Ul - DLX.Ul) <= 0.02, `Ul ${r.road.Ul.toFixed(3)}`);
  assert.ok(Math.abs(Math.round(r.road.TI) - DLX.TI) <= 1, `TI ${r.road.TI.toFixed(1)}`);
  assert.ok(Math.abs(r.road.SR - DLX.SR) <= 0.05, `SR ${r.road.SR.toFixed(3)}`);
});

test("DIALux Cầu Bình Triệu 2: Imax ≥70/80/90° theo tư thế lắp (nghiêng 15°) khớp ±3%", () => {
  const pose = { tilt: 15 };
  const i70 = maxIntensityPerKlm(SL, makeIntensity, 70, pose), i80 = maxIntensityPerKlm(SL, makeIntensity, 80, pose), i90 = maxIntensityPerKlm(SL, makeIntensity, 90, pose);
  assert.ok(rel(i70, DLX.I70) <= 0.03, `I70 ${i70.toFixed(1)}`);
  assert.ok(rel(i80, DLX.I80) <= 0.03, `I80 ${i80.toFixed(1)}`);
  assert.ok(rel(i90, DLX.I90) <= 0.05, `I90 ${i90.toFixed(2)}`);
  // tư thế nằm ngang: cường độ góc cao nhỏ hơn hẳn
  assert.ok(maxIntensityPerKlm(SL, makeIntensity, 80, { tilt: 0 }) < i80 / 2);
});

test("DIALux Cầu Bình Triệu 2: W/km = ⌈1000/S⌉ × số hàng × P", () => {
  const e = energyIndicators({ P: 73.5, spacing: 35, width: 13, Eav: 18, arrangement: "đối xứng" });
  assert.ok(Math.abs(e.Wkm - DLX.Wkm) < 1, `Wkm ${e.Wkm}`);
  assert.equal(energyIndicators({ P: 60, spacing: 25, width: 7, Eav: 10, arrangement: "1 bên" }).Wkm, 40 * 60, "chia hết thì không làm tròn thêm");
  assert.equal(energyIndicators({ P: 100, spacing: 35, width: 14, Eav: 20, arrangement: "giữa" }).nSide, 2, "giữa = 2 đèn/trụ");
  assert.equal(energyIndicators({ P: 100, spacing: 35, width: 14, Eav: 20, arrangement: "1 bên", perPole: 2 }).nSide, 2, "2 bộ/trụ");
});

test("ULOR theo tư thế lắp: nằm ngang ≈ 0, nghiêng nhiều thì tăng, trong [0,1]", () => {
  const u0 = upwardRatio(SL, makeIntensity, { tilt: 0 }), u15 = upwardRatio(SL, makeIntensity, { tilt: 15 }), u40 = upwardRatio(SL, makeIntensity, { tilt: 40 });
  assert.ok(u0 >= 0 && u0 < 0.005, `ULOR 0° ${u0}`);
  assert.ok(u15 >= u0 && u40 > u15 && u40 < 1, `${u0} ${u15} ${u40}`);
});

// ---------- Ul theo làn của từng observer ----------
test("Ul: mỗi observer chỉ xét tim làn của mình; mặt đường = observer xấu nhất", () => {
  const r = calcRoad({ ...BT2, detail: true });
  const g = r.grid;
  r.observers.forEach((o, k) => {
    const j = Math.round(g.laneCenters[k] / g.dT - 0.5);
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < g.nLong; i++) { const v = o.Lvals[i * g.nTrans + j]; mn = Math.min(mn, v); mx = Math.max(mx, v); }
    assert.ok(Math.abs(o.Ul - mn / mx) < 1e-12, `observer ${k}`);
  });
  assert.equal(r.road.Ul, Math.min(...r.observers.map((o) => o.Ul)));
});

// ---------- Tư thế đèn: xoay, số đèn/trụ, bố trí giữa ----------
test("Góc xoay bộ đèn: 0 = như cũ; quay 180° (chiếu ra ngoài) làm Eav lòng đường giảm mạnh", () => {
  const base = { ies: MAG, H: 8, overhang: 1, spacing: 30, width: 7, lanes: 2, tilt: 10, arrangement: "1 bên", roadClass: "D1" };
  const r0 = calcRoad(base), rr0 = calcRoad({ ...base, rot: 0 }), r180 = calcRoad({ ...base, rot: 180 });
  assert.equal(rr0.E.avg, r0.E.avg);
  assert.ok(r180.E.avg < 0.6 * r0.E.avg, `${r180.E.avg} vs ${r0.E.avg}`);
  const r10 = calcRoad({ ...base, rot: 10 });
  assert.notEqual(r10.E.avg, r0.E.avg);
});

test("Số bộ đèn/trụ = 2 → độ rọi gấp đôi", () => {
  const base = { ies: MAG, H: 8, overhang: 1, spacing: 30, width: 7, lanes: 2, tilt: 10, arrangement: "1 bên", roadClass: "D1" };
  const r1 = calcRoad(base), r2 = calcRoad({ ...base, perPole: 2 });
  assert.ok(rel(r2.E.avg, 2 * r1.E.avg) < 1e-9);
});

test("Bố trí 'giữa': trụ trên dải phân cách, 2 đèn/trụ quay về hai chiều, đối xứng qua tim đường", () => {
  const lums = buildLuminaires({ H: 10, overhang: 1.5, spacing: 35, width: 14, arrangement: "giữa", tilt: 10, spanWindow: 1 });
  const at0 = lums.filter((l) => l.x === 0);
  assert.equal(at0.length, 2);
  const ys = at0.map((l) => l.y).sort((a, b) => a - b);
  assert.deepEqual(ys, [7 - 1.5, 7 + 1.5]);
  const near = at0.find((l) => l.y < 7), far = at0.find((l) => l.y > 7);
  assert.equal(near.c0dir, -1, "đèn phía gần chiếu về mép gần (y=0)");
  assert.equal(far.c0dir, +1);
  const r = calcRoad({ ies: MAG, H: 10, overhang: 1.5, spacing: 35, width: 14, lanes: 4, tilt: 10, arrangement: "giữa", roadClass: "C1" });
  const r1 = calcRoad({ ies: MAG, H: 10, overhang: 1.5, spacing: 35, width: 14, lanes: 4, tilt: 10, arrangement: "1 bên", roadClass: "C1" });
  assert.ok(r.E.avg > 1.2 * r1.E.avg, "giữa (2 đèn/trụ) sáng hơn 1 bên");
  // lưới E đối xứng qua tim đường (hàng j ↔ hàng nTrans-1-j)
  const g = r.grid;
  for (let i = 0; i < g.nLong; i++) for (let j = 0; j < g.nTrans; j++)
    assert.ok(Math.abs(r.Evals[i * g.nTrans + j] - r.Evals[i * g.nTrans + (g.nTrans - 1 - j)]) < 1e-6 * r.E.max);
});

// ---------- Excel: cột mới ----------
test("mapping: Góc xoay, Số bộ đèn/trụ, MF theo tuyến; 'giữa' → overhang = vươn − ½ dải phân cách", () => {
  const g = rowToGeometry({ [COLS.H]: 10, [COLS.width]: 14, [COLS.spacing]: 35, [COLS.vuon]: 2.5, [COLS.arrangement]: "giữa", [COLS.dpc]: "có", [COLS.medianW]: 2, [COLS.rot]: 5, [COLS.perPole]: 2, [COLS.mf]: "0,67" });
  assert.equal(g.input.rot, 5);
  assert.equal(g.input.perPole, 2);
  assert.equal(g.input.MF, 0.67);
  assert.equal(g.input.overhang, 1.5);
  const g2 = rowToGeometry({ [COLS.H]: 10, [COLS.width]: 14, [COLS.spacing]: 35, [COLS.vuon]: 2.5, [COLS.arrangement]: "giữa" });
  assert.equal(g2.input.overhang, 1.5, "không ghi bề rộng dải → giả định 2 m");
  assert.ok(g2.warnings.some((w) => /dải phân cách/.test(w)));
  const g3 = rowToGeometry({ [COLS.H]: 10, [COLS.width]: 7, [COLS.spacing]: 30 });
  assert.equal(g3.input.rot, 0); assert.equal(g3.input.perPole, 1); assert.equal(g3.input.MF, null);
  assert.ok(rowToGeometry({ [COLS.H]: 10, [COLS.width]: 7, [COLS.spacing]: 30, [COLS.mf]: 1.5 }).warnings.some((w) => /MF/.test(w)), "MF ngoài (0,1] → cảnh báo, bỏ qua");
});

test("batch: MF theo tuyến ghi đè MF chung", async () => {
  const { runBatch, buildIesIndex } = await import("../src/batch.mjs");
  const idx = buildIesIndex([{ name: "SL-70W.ies", text: readFileSync(join(here, "fixtures/SL-70W.ies"), "utf8") }]);
  const row = { [COLS.tuyen]: "x", [COLS.H]: 10.5, [COLS.vuon]: 1.5, [COLS.setback]: 1.5, [COLS.width]: 13, [COLS.spacing]: 35, [COLS.tilt]: 15, [COLS.arrangement]: "đối xứng", [COLS.lanes]: 3, [COLS.roadClass]: "D1" };
  const a = runBatch([row], idx, { MF: 0.8, q0: 0.08 })[0], b = runBatch([{ ...row, [COLS.mf]: 0.67 }], idx, { MF: 0.8, q0: 0.08 })[0];
  assert.ok(rel(b.Ltb / a.Ltb, 0.67 / 0.8) < 1e-9);
  assert.ok(rel(b.Ltb, DLX.Lav) <= 0.03, `Ltb ${b.Ltb}`);
});

test("template: có cột Góc xoay, Số bộ đèn/trụ, MF; danh sách bố trí có 'giữa'", async () => {
  const { createRequire } = await import("node:module");
  const ExcelJS = createRequire(import.meta.url)("exceljs");
  const { buildTemplateWorkbook, TEMPLATE_HEAD } = await import("../src/template.mjs");
  for (const c of [COLS.rot, COLS.perPole, COLS.mf]) assert.ok(TEMPLATE_HEAD.includes(c), c);
  const wb = await buildTemplateWorkbook(ExcelJS);
  const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.load(await wb.xlsx.writeBuffer());
  const ws = wb2.getWorksheet("DU LIEU TUYEN");
  const dv = ws.getCell(2, TEMPLATE_HEAD.indexOf(COLS.arrangement) + 1).dataValidation;
  assert.match(String(dv.formulae[0]), /giữa/);
});

// ---------- bổ sung sau review độc lập ----------
test("góc xoay theo hướng chiếu của từng đèn: 'đối xứng' + xoay → lưới E đối xứng gương qua tim đường", () => {
  const r = calcRoad({ ies: MAG, H: 9, overhang: 1, spacing: 30, width: 10, lanes: 3, tilt: 10, arrangement: "đối xứng", rot: 12, roadClass: "C2" });
  const g = r.grid;
  for (let i = 0; i < g.nLong; i++) for (let j = 0; j < g.nTrans; j++)
    assert.ok(Math.abs(r.Evals[i * g.nTrans + j] - r.Evals[i * g.nTrans + (g.nTrans - 1 - j)]) < 1e-6 * r.E.max);
});

test("arrangementKind/Label: nhận dạng thống nhất; '1 bên (có dải phân cách)' vẫn là 1 bên", async () => {
  const { arrangementKind, arrangementLabel } = await import("../src/geometry.mjs");
  assert.equal(arrangementKind("1 bên (có dải phân cách)"), "single");
  assert.equal(arrangementKind("Giua"), "center");
  assert.equal(arrangementKind("hai bên"), "opposite");
  assert.equal(arrangementKind("so le"), "staggered");
  assert.equal(arrangementLabel("giữa"), "trên dải phân cách, cần đôi");
});

test("mapping: 'giữa' luôn có dải (phân cấp B1/C1), MF dạng %, cảnh báo cần vươn ngắn hơn ½ dải", () => {
  const g = rowToGeometry({ [COLS.H]: 10, [COLS.width]: 14, [COLS.spacing]: 35, [COLS.vuon]: 1, [COLS.arrangement]: "giữa", [COLS.medianW]: 4, [COLS.lanes]: 4, [COLS.mf]: 80 });
  assert.equal(g.input.roadClass, "B1");
  assert.equal(g.input.MF, 0.8);
  assert.ok(g.warnings.some((w) => /ngắn hơn/.test(w)), g.warnings.join("; "));
});

test("Excel kết quả: ước tính số bộ đèn tính đúng 'giữa' và số bộ đèn/trụ", async () => {
  const { estimateLampCount } = await import("../src/xlsxpro.mjs");
  const row = { "Chiều dài tuyến (m)": 700 };
  assert.equal(estimateLampCount(row, { spacing: 35, arrangement: "giữa" }).n, 40);
  assert.equal(estimateLampCount(row, { spacing: 35, arrangement: "1 bên", perPole: 2 }).n, 40);
  assert.equal(estimateLampCount(row, { spacing: 35, arrangement: "hai bên" }).n, 40);
});
