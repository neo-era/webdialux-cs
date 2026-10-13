// v3.2 — chế độ Cầu: mặt cầu giao thông có trắc dọc (dốc + đường cong đứng), lề bộ hành, chọn đèn tự động, Excel.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseIES } from "../src/ies.mjs";
import { calcRoad } from "../src/engine.mjs";
import { makeProfile, calcBridge, validateBridge, bridgeGeometry, pickBridgeIes, parseBridgeRows, bridgeToRow, BRIDGE_HEAD,
  BRIDGE_DEFAULTS, BRIDGE_SAMPLES, buildBridgeWorkbook, polePositions } from "../src/bridge.mjs";
import ExcelJS from "exceljs";

const fx = (f) => parseIES(readFileSync(new URL(`./fixtures/${f}.ies`, import.meta.url), "utf8"));
const SL70 = fx("SL-70W"), SL90 = fx("SL-90W"), SL150 = fx("SL-150W");
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-12, Math.abs(b));

const flat = (o = {}) => ({ ...BRIDGE_DEFAULTS, name: "t", length: 400, width: 13, lanes: 3, walk: 3, site: "go", setback: 0.5, arm: 1.5,
  arrangement: "đối xứng", spacing: 35, grade: 0, Rv: null, H: 10.5, tilt: 15, MF: 0.67, q0: 0.08, roadClass: "D1", ies: SL70, ...o });

for (const arrangement of ["1 bên", "đối xứng", "so le", "giữa"]) {
  test(`cầu phẳng = chế độ Đường (bố trí ${arrangement}) — Ltb, Uo, Ul, TI, SR, Eav trùng`, () => {
    const b = flat({ arrangement, site: arrangement === "giữa" ? "giua" : "go", medianW: arrangement === "giữa" ? 2 : 0 });
    const G = bridgeGeometry(b);
    const r = calcBridge(b);
    const road = calcRoad({ ies: SL70, H: 10.5, overhang: G.overhang, spacing: 35, width: 13, lanes: 3, tilt: 15, arrangement, MF: 0.67, q0: 0.08,
      roadClass: "D1", sidewalk: 3 });
    for (const f of r.fields) {
      assert.ok(rel(f.Lav, road.road.Lav) < 1e-9, `Lav ô ${f.f}: ${f.Lav} vs ${road.road.Lav}`);
      assert.ok(rel(f.Uo, road.road.Uo) < 1e-9);
      assert.ok(rel(f.Ul, road.road.Ul) < 1e-9);
      assert.ok(rel(f.TI, road.road.TI) < 1e-9, `TI ${f.TI} vs ${road.road.TI}`);
      assert.ok(rel(f.SR, road.road.SR) < 1e-9, `SR ${f.SR} vs ${road.road.SR}`);
      assert.ok(rel(f.E.avg, road.E.avg) < 1e-9);
    }
    for (const k of ["Ltb", "Uo", "Ul", "TI", "SR"]) assert.equal(r.checks[k], road.checks[k], k);
  });
}

test("cầu Bình Triệu 2 phẳng: khớp số DIALux như chế độ Đường (Ltb 1,38 · Uo 0,75 · Ul 0,90 · TI 9)", () => {
  const r = calcBridge(flat({ setback: 0, arm: 0, walk: 5 }));
  assert.ok(Math.abs(r.road.Lav - 1.38) < 0.03, `Lav ${r.road.Lav}`);
  assert.ok(Math.abs(r.road.Uo - 0.75) < 0.03);
  assert.ok(Math.abs(r.road.Ul - 0.90) < 0.03);
  assert.equal(Math.round(r.road.TI), 9);
});

test("trắc dọc: cao độ 0 tại hai mố, đỉnh giữa cầu, đường cong đứng 2·R·i, độ dốc đúng dấu", () => {
  const p = makeProfile({ length: 300, grade: 4, Rv: 1500 });
  assert.ok(Math.abs(p.z(0)) < 1e-9 && Math.abs(p.z(300)) < 1e-9);
  assert.ok(Math.abs(p.curveLen - 120) < 1e-9);
  // đỉnh = 4% × (150 − 60) + 60²/(2·1500) = 3,6 + 1,2
  assert.ok(Math.abs(p.crest - 4.8) < 1e-9, `crest ${p.crest}`);
  assert.ok(Math.abs(p.z(150) - 4.8) < 1e-9);
  assert.ok(Math.abs(p.slope(10) - 0.04) < 1e-12 && Math.abs(p.slope(290) + 0.04) < 1e-12);
  assert.ok(Math.abs(p.slope(150 - 30) - 30 / 1500) < 1e-12);
  // liên tục tại tiếp điểm
  assert.ok(Math.abs(p.z(90 - 1e-6) - p.z(90 + 1e-6)) < 1e-6);
  const f = makeProfile({ length: 100, grade: 0 });
  assert.equal(f.z(50), 0); assert.equal(f.slope(50), 0);
  // đỉnh gãy (không có R)
  const k = makeProfile({ length: 100, grade: 5 });
  assert.ok(Math.abs(k.crest - 2.5) < 1e-9);
});

test("dốc rất nhỏ → kết quả tiến về cầu phẳng", () => {
  const a = calcBridge(flat({ arrangement: "so le", grade: 0 }));
  const b = calcBridge(flat({ arrangement: "so le", grade: 0.01, Rv: 100000 }));
  assert.ok(rel(b.road.Lav, a.road.Lav) < 1e-3 && rel(b.road.Uo, a.road.Uo) < 2e-3 && rel(b.road.Eav, a.road.Eav) < 1e-3);
});

// cửa sổ đèn mỗi ô = −5…+6 khoảng cột như chế độ Đường (lệch 1 trụ) → sai khác đối xứng < 0,3 %
test("cầu dốc đối xứng: độ rọi các ô đối xứng nhau qua đỉnh cầu bằng nhau", () => {
  const r = calcBridge(flat({ length: 35 * 8, poleStart: 0, arrangement: "đối xứng", grade: 4, Rv: 1500 }));
  const n = r.fields.length;
  assert.equal(n, 8);
  for (let f = 0; f < n; f++) assert.ok(rel(r.fields[f].E.avg, r.fields[n - 1 - f].E.avg) < 3e-3, `ô ${f}`);
  // dốc làm thay đổi kết quả (khác cầu phẳng) nhưng vẫn hợp lý
  const p = calcBridge(flat({ length: 35 * 8, poleStart: 0, arrangement: "đối xứng", grade: 0 }));
  assert.ok(r.road.Lav > 0.3 * p.road.Lav && r.road.Lav < 3 * p.road.Lav);
  assert.notEqual(r.road.Lav, p.road.Lav);
});

test("đèn bám cao độ mặt cầu; người quan sát và mắt người lái bám mặt cầu", () => {
  const r = calcBridge(flat({ grade: 5, Rv: 2000, detail: true }));
  const prof = makeProfile({ length: 400, grade: 5, Rv: 2000 });
  for (const f of r.fields) for (const o of f.observers) assert.ok(Math.abs(o.pos.z - (prof.z(o.pos.x) + 1.5)) < 1e-9);
});

test("lề bộ hành: Eav/Uo hai bên + yêu cầu TCVN 13608 Bảng 4; không có lề → không xét SR", () => {
  const r = calcBridge(flat({ walk: 2.5, walkReq: "TCVN13608-B4-thap" }));
  assert.ok(r.walk && r.walk.left.Eav > 0 && r.walk.right.Eav > 0);
  assert.equal(r.walk.req.Eav, 10);
  const n = calcBridge(flat({ walk: 0 }));
  assert.equal(n.walk, null); assert.equal(n.road.SR, null); assert.equal(n.checks.SR, null);
});

test("kiểm tra dữ liệu: lỗi chặn tính + cảnh báo", () => {
  assert.ok(validateBridge(flat({ grade: 12 })).errors.some((e) => /10%/.test(e)));
  assert.ok(validateBridge(flat({ spacing: 0 })).errors.length);
  assert.ok(validateBridge(flat({ length: "" })).errors.length);
  assert.ok(validateBridge(flat(), { hasIes: false }).errors.some((e) => /IES/.test(e)));
  assert.ok(validateBridge(flat({ grade: 4, Rv: 6000 })).warnings.some((w) => /dài/.test(w)));
  assert.ok(validateBridge(flat({ grade: 4, Rv: null })).warnings.some((w) => /gãy/.test(w)));
  assert.ok(validateBridge(flat({ H: 1.4 })).warnings.some((w) => /lan can/.test(w)));
  assert.throws(() => calcBridge(flat({ spacing: -5 })));
});

test("vị trí trụ: lan can → khoảng cách = lề + gờ; gờ chắn → ½ gờ; nhập tay thì giữ", () => {
  assert.equal(bridgeGeometry(flat({ site: "lancan", setback: null, walk: 2.5, guard: 0.3 })).setback, 2.8);
  assert.equal(bridgeGeometry(flat({ site: "go", setback: null, guard: 0.3 })).setback, 0.15);
  assert.equal(bridgeGeometry(flat({ site: "go", setback: 1 })).setback, 1);
  const G = bridgeGeometry(flat({ length: 100, spacing: 30, poleStart: null }));
  assert.equal(G.poleStart, 5);
  const P = polePositions(flat({ length: 100, spacing: 30, arrangement: "so le", poleStart: null }));
  assert.ok(P.every((p) => p.x >= 0 && p.x <= 100) && P.some((p) => p.side === "far"));
});

test("tự chọn bộ đèn: bộ công suất nhỏ nhất vẫn Đạt", () => {
  const idx = [{ name: "SL-150W.ies", power: 150, ph: SL150 }, { name: "SL-70W.ies", power: 70, ph: SL70 }, { name: "SL-90W.ies", power: 90, ph: SL90 }];
  const b = flat({ roadClass: "C2", walk: 3, walkReq: "TCVN13608-B4-thap" });
  const pick = pickBridgeIes(b, idx);
  assert.ok(pick);
  const passes = idx.map((e) => ({ e, ok: calcBridge({ ...b, ies: e.ph }).pass })).filter((x) => x.ok).sort((a, c) => a.e.power - c.e.power);
  if (passes.length) assert.equal(pick.ies.name, passes[0].e.name);
  else assert.ok(pick.none);
});

test("Excel: mẫu có sheet DU LIEU CAU, đọc lại đúng (vòng khép kín) + sheet kết quả", async () => {
  const r = calcBridge({ ...BRIDGE_SAMPLES[1], ies: SL70 });
  const wb = await buildBridgeWorkbook(ExcelJS, { results: [{ b: BRIDGE_SAMPLES[1], r, iesName: "SL-70W.ies", power: 70 }] });
  assert.ok(wb.getWorksheet("DU LIEU CAU") && wb.getWorksheet("KET QUA CAU") && wb.getWorksheet("O TINH DOC CAU"));
  const ws = wb.getWorksheet("DU LIEU CAU");
  const head = ws.getRow(1).values.slice(1);
  assert.deepEqual(head, BRIDGE_HEAD);
  const rows = [];
  for (let i = 2; i <= ws.rowCount; i++) { const v = ws.getRow(i).values; const o = {}; BRIDGE_HEAD.forEach((h, k) => { o[h] = v[k + 1] ?? null; }); rows.push(o); }
  const back = parseBridgeRows(rows);
  assert.equal(back.length, BRIDGE_SAMPLES.length);
  for (const k of ["name", "length", "width", "lanes", "walk", "site", "arrangement", "spacing", "grade", "H", "arm", "tilt", "approachLit", "roadClass"])
    assert.deepEqual(back[2][k], BRIDGE_SAMPLES[2][k], k);
  assert.equal(back[1].Rv, null);
  assert.equal(bridgeToRow(BRIDGE_SAMPLES[0]).length, BRIDGE_HEAD.length);
});

test("mẫu cầu đều tính được", () => {
  for (const s of BRIDGE_SAMPLES) { const r = calcBridge({ ...s, ies: SL90, detail: true }); assert.ok(r.road.Lav > 0 && r.plan && r.plan.E.length === r.plan.nx * r.plan.ny); }
});

test("đỉnh cầu che tia: điểm sát chân dốc không nhận đèn phía bên kia đỉnh; cầu phẳng không che", async () => {
  const { crestBlocked } = await import("../src/bridge.mjs");
  const p = makeProfile({ length: 200, grade: 6, Rv: 500 });
  assert.equal(crestBlocked(p, { x: 10, z: p.z(10) }, { x: 190, H: p.z(190) + 8 }), true);
  assert.equal(crestBlocked(p, { x: 90, z: p.z(90) }, { x: 110, H: p.z(110) + 8 }), false);
  assert.equal(crestBlocked(makeProfile({ length: 200, grade: 0 }), { x: 0, z: 0 }, { x: 200, H: 0.1 }), false);
});

test("mặt dốc: không có độ chói ảo ở tia sát mặt (Ltb, Ul các ô liền nhau thay đổi êm)", () => {
  for (const grade of [4, 8]) {
    const r = calcBridge({ ...BRIDGE_SAMPLES[0], spacing: 30, grade, Rv: 1500, ies: SL70 });
    for (let f = 1; f < r.fields.length; f++) {
      assert.ok(Math.abs(r.fields[f].Lav - r.fields[f - 1].Lav) / r.fields[f - 1].Lav < 0.1, `Lav ô ${f}`);
      assert.ok(Math.abs(r.fields[f].Ul - r.fields[f - 1].Ul) < 0.1, `Ul ô ${f}`);
    }
  }
});

test("Excel: ô bắt buộc để trống → báo lỗi (không tự lấy số mặc định); dòng không tên bị bỏ; tuỳ chọn trống = trung tính", () => {
  const [b] = parseBridgeRows([{ "Tên cầu": "X" }]);
  assert.equal(b.length, null); assert.equal(b.spacing, null); assert.equal(b.H, null); assert.equal(b.grade, 0); assert.equal(b.walk, 0);
  const v = validateBridge(b);
  assert.ok(v.errors.some((e) => /Chiều dài/.test(e)) && v.errors.some((e) => /Khoảng cách trụ/.test(e)) && v.errors.some((e) => /H/.test(e)));
  assert.equal(parseBridgeRows([{ STT: 5 }, { "Chiều dài cầu (m)": 100 }]).length, 0);
  assert.equal(parseBridgeRows([{ "Tên cầu": "A", "Đường dẫn có chiếu sáng": "có (đèn 100W)" }])[0].approachLit, true);
  assert.equal(parseBridgeRows([{ "Tên cầu": "A", "Đường dẫn có chiếu sáng": "không" }])[0].approachLit, false);
  const c = parseBridgeRows([{ "Tên cầu": "A", "Cấp đường": "Z9", "Lòng đường (m)": 7 }])[0];
  assert.equal(c.roadClass, "D1"); assert.ok(validateBridge({ ...c, length: 100, spacing: 30, H: 8 }).warnings.some((w) => /không hợp lệ/.test(w)));
});

test("chặn số liệu làm treo máy: khoảng cách trụ < 8 m, số làn/đèn quá lớn, trụ đầu nằm ngoài cầu", () => {
  assert.ok(validateBridge(flat({ spacing: 3 })).errors.some((e) => /quá nhỏ/.test(e)));
  assert.ok(validateBridge(flat({ lanes: 40 })).errors.length);
  assert.ok(validateBridge(flat({ perPole: 20 })).errors.length);
  assert.ok(validateBridge(flat({ length: 240, spacing: 30, poleStart: 300 })).errors.some((e) => /Trụ đầu/.test(e)));
  assert.ok(validateBridge(flat({ poleStart: -5 })).errors.some((e) => /Trụ đầu/.test(e)));
  assert.equal(validateBridge(flat({ length: 240, spacing: 30, poleStart: 210 })).errors.length, 0);
});

test("lề bộ hành nằm sau gờ chắn: [−gờ−lề, −gờ]; gờ rộng hơn → lề xa đèn hơn", () => {
  const a = calcBridge(flat({ walk: 2, guard: 0, site: "lancan", setback: 3 }));
  const b = calcBridge(flat({ walk: 2, guard: 1, site: "lancan", setback: 3 }));
  assert.notEqual(a.walk.left.Eav, b.walk.left.Eav);
  assert.equal(b.plan === null, true);
});

test("đỉnh cầu che tầm nhìn: cảnh báo + tỉ lệ điểm khuất từng ô; cầu phẳng không khuất", () => {
  const r = calcBridge(flat({ grade: 6, Rv: 500, length: 300 }));
  assert.ok(r.warnings.some((w) => /che tầm nhìn/.test(w)));
  assert.ok(r.fields.some((f) => f.hidden > 0));
  assert.ok(calcBridge(flat()).fields.every((f) => f.hidden === 0));
});
