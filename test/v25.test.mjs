// v2.5 — khớp DIALux theo đối chiếu 7 tuyến (báo cáo DIALux "test2" ngày 13/10/2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseIES, makeIntensity } from "../src/ies.mjs";
import { calcRoad } from "../src/engine.mjs";
import { buildGrid } from "../src/geometry.mjs";
import { maxIntensityPerKlm, energyIndicators } from "../src/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SL = parseIES(readFileSync(join(here, "fixtures/SL-70W.ies"), "utf8"));
const BT2 = { ies: SL, H: 10.5, overhang: 0, spacing: 35, width: 13, lanes: 3, tilt: 15, arrangement: "đối xứng", MF: 0.8, q0: 0.08, roadClass: "C2" };

test("W/km: số đèn/km mỗi hàng = làm tròn GẦN NHẤT 1000/S (khớp 5 tuyến DIALux)", () => {
  // [S, số hàng, P, W/km DIALux]
  const cases = [[35, 2, 73.5, 4263.0], [42, 2, 92.8, 4454.4], [34, 1, 154.0, 4466.0], [35, 1, 92.8, 2691.2], [37, 1, 92.8, 2505.6], [36, 1, 92.8, 2598.4]];
  for (const [S, n, P, exp] of cases) {
    const e = energyIndicators({ P, spacing: S, width: 10, Eav: 20, arrangement: n === 2 ? "đối xứng" : "1 bên" });
    assert.ok(Math.abs(e.Wkm - exp) < 0.05, `S=${S}: ${e.Wkm} vs ${exp}`);
  }
});

test("Lưới tính: đúng 3 điểm ngang mỗi làn (EN 13201-3), không ép bước ≤ 1,5 m", () => {
  const g = buildGrid({ spacing: 34, width: 14, lanes: 2 });
  assert.equal(g.nTrans, 6, "đường 14 m, 2 làn 7 m → 6 hàng như DIALux");
  assert.equal(g.nLong, 12);
  assert.ok(Math.abs(g.dT - 14 / 6) < 1e-9);
  assert.equal(buildGrid({ spacing: 35, width: 13, lanes: 3 }).nTrans, 9);
});

test("REI (EN 13201-2:2015): dải mép = bề rộng làn (giới hạn bởi vỉa hè) — Cầu Bình Triệu 2 ra 0,56 như DIALux", () => {
  const r = calcRoad(BT2);
  assert.ok(Math.abs(r.reiWidth - 13 / 3) < 1e-9, `dải ${r.reiWidth}`);
  assert.equal(Math.round(r.road.REI * 100) / 100, 0.56, `REI ${r.road.REI.toFixed(3)}`);
  assert.equal(calcRoad({ ...BT2, sidewalk: 2 }).reiWidth, 2, "vỉa hè hẹp vẫn giới hạn dải");
});

test("REI: tính riêng từng mép, lấy mép XẤU hơn; SR (QCVN/CIE 140) vẫn cộng hai mép, dải min(5, W/2)", () => {
  const one = { ...BT2, arrangement: "1 bên", width: 10, lanes: 2, tilt: 5, overhang: 1 };
  const r = calcRoad(one);
  assert.equal(r.road.REI, Math.min(r.reiSides.left, r.reiSides.right));
  assert.notEqual(r.reiSides.left.toFixed(3), r.reiSides.right.toFixed(3), "1 bên thì hai mép khác nhau");
  assert.ok(r.road.REI < r.road.SR, "REI (mép xấu) thấp hơn SR (trung bình hai mép)");
  assert.equal(r.srWidth, 5);
  const sym = calcRoad(BT2);
  assert.ok(Math.abs(sym.reiSides.left - sym.reiSides.right) < 1e-6, "đối xứng thì hai mép bằng nhau");
  assert.equal(sym.srWidth, 5, "SR giữ dải 5 m theo CIE 140");
  assert.ok(!("REI" in sym.checks), "kết luận theo QCVN dùng SR, REI chỉ để đối chiếu");
});

test("Imax ≥70/80° theo tư thế lắp: quét mịn, khớp DIALux ±0,5% (538 / 284 cd/klm)", () => {
  const i70 = maxIntensityPerKlm(SL, makeIntensity, 70, { tilt: 15 }), i80 = maxIntensityPerKlm(SL, makeIntensity, 80, { tilt: 15 });
  assert.ok(Math.abs(i70 - 538) / 538 <= 0.005, `I70 ${i70.toFixed(1)}`);
  assert.ok(Math.abs(i80 - 284) / 284 <= 0.005, `I80 ${i80.toFixed(1)}`);
});

test("Báo cáo: dữ liệu PDF có REI tham khảo (giá trị + bề rộng dải)", async () => {
  const { reportData } = await import("../src/report.mjs");
  const input = { ...BT2 };
  const d = reportData(input, calcRoad(input), SL, {});
  assert.ok(d.rei && Math.abs(d.rei.value - calcRoad(input).road.REI) < 1e-12);
  assert.ok(Math.abs(d.rei.width - 13 / 3) < 1e-9);
  assert.equal(d.checks.length, 5, "bảng kết luận vẫn 5 chỉ tiêu QCVN");
});

test("Số làn lẻ (2,5) được làm tròn: lưới nguyên, Ul không lệch", () => {
  const g = buildGrid({ spacing: 35, width: 13, lanes: 2.5 });
  assert.ok(Number.isInteger(g.nTrans) && g.laneCenters.length * 3 === g.nTrans);
  assert.equal(energyIndicators({ P: 50, spacing: 2500, width: 7, Eav: 5, arrangement: "1 bên" }).Wkm, 50);
});

// ---------- Đối chiếu 7 tuyến DIALux (báo cáo test2, MF 0,80, R3 q0 0,08) ----------
const SL90 = parseIES(readFileSync(join(here, "fixtures/SL-90W.ies"), "utf8"));
const SL150 = parseIES(readFileSync(join(here, "fixtures/SL-150W.ies"), "utf8"));
const ROUTES = [
  ["Cầu Bình Triệu 2", SL, 73.5, { spacing: 35, H: 10.5, overhang: 0, tilt: 15, width: 13, lanes: 3, arrangement: "đối xứng" }, { Lav: 1.65, Uo: .75, Ul: .90, TI: 9, REI: .56, Eav: 22.4, Wkm: 4263, obsTI: [8, 9, 8] }],
  ["Đường dẫn cầu Bình Triệu", SL90, 92.8, { spacing: 42, H: 11.5, overhang: 0.5, tilt: 0, width: 16, lanes: 3, arrangement: "đối xứng" }, { Lav: 1.58, Uo: .61, Ul: .82, TI: 8, REI: .58, Eav: 21.1, Wkm: 4454.4, obsTI: [8, 8, 8] }],
  ["Vành Đai KCX Linh Trung 2", SL150, 154, { spacing: 34, H: 12.5, overhang: 1, tilt: 5, width: 14, lanes: 2, arrangement: "1 bên" }, { Lav: 1.72, Uo: .43, Ul: .85, TI: 9, REI: .38, Eav: 24.0, Wkm: 4466, obsTI: [9, 5] }],
  ["Phan Huy Chú", SL90, 92.8, { spacing: 35, H: 9, overhang: 1, tilt: 5, width: 7, lanes: 2, arrangement: "1 bên" }, { Lav: 1.67, Uo: .56, Ul: .75, TI: 10, REI: .58, Eav: 21.1, Wkm: 2691.2, obsTI: [10, 9] }],
  ["Đồng Tiến", SL90, 92.8, { spacing: 35, H: 9, overhang: 1, tilt: 5, width: 7, lanes: 2, arrangement: "1 bên" }, { Lav: 1.67, Uo: .56, Ul: .75, TI: 10, REI: .58, Eav: 21.1, Wkm: 2691.2, obsTI: [10, 9] }],
  ["Nguyễn Trường Tộ", SL90, 92.8, { spacing: 37, H: 9, overhang: 1, tilt: 0, width: 7, lanes: 2, arrangement: "1 bên" }, { Lav: 1.62, Uo: .52, Ul: .68, TI: 11, REI: .67, Eav: 20.5, Wkm: 2505.6, obsTI: [11, 9] }],
  ["Độc Lập", SL90, 92.8, { spacing: 36, H: 9, overhang: 1, tilt: 0, width: 7, lanes: 2, arrangement: "1 bên" }, { Lav: 1.67, Uo: .54, Ul: .72, TI: 11, REI: .67, Eav: 21.1, Wkm: 2598.4, obsTI: [11, 9] }],
];
for (const [name, ies, P, g, D] of ROUTES) {
  test(`DIALux 7 tuyến — ${name}: Ltb/Uo ±0,02, Ul ±0,03, TI ±1, REI ±0,01, Eav ±1%, W/km đúng`, () => {
    const r = calcRoad({ ies, ...g, MF: 0.8, q0: 0.08, roadClass: "C2" });
    assert.ok(Math.abs(r.road.Lav - D.Lav) <= 0.02, `Lav ${r.road.Lav.toFixed(3)} vs ${D.Lav}`);
    assert.ok(Math.abs(r.road.Uo - D.Uo) <= 0.02, `Uo ${r.road.Uo.toFixed(3)} vs ${D.Uo}`);
    assert.ok(Math.abs(r.road.Ul - D.Ul) <= 0.03, `Ul ${r.road.Ul.toFixed(3)} vs ${D.Ul}`);   // còn lệch +0,01…0,02 ở tuyến 1 bên 9 m
    assert.ok(Math.abs(Math.round(r.road.TI) - D.TI) <= 1, `TI ${r.road.TI.toFixed(2)} vs ${D.TI}`);
    r.observers.forEach((o, k) => assert.ok(Math.abs(o.TI - D.obsTI[k]) <= 1, `TI obs${k + 1} ${o.TI.toFixed(2)} vs ${D.obsTI[k]}`));
    assert.ok(Math.abs(r.road.REI - D.REI) <= 0.01, `REI ${r.road.REI.toFixed(3)} vs ${D.REI}`);
    assert.ok(Math.abs(r.E.avg - D.Eav) / D.Eav <= 0.01, `Eav ${r.E.avg.toFixed(2)} vs ${D.Eav}`);
    const e = energyIndicators({ P, spacing: g.spacing, width: g.width, Eav: r.E.avg, arrangement: g.arrangement });
    assert.ok(Math.abs(e.Wkm - D.Wkm) < 0.05, `W/km ${e.Wkm}`);
  });
}

test("Khoảng cột 0 / thiếu → báo lỗi ngay, không treo", () => {
  assert.throws(() => calcRoad({ ...BT2, spacing: 0 }), /Khoảng cột/);
  assert.throws(() => calcRoad({ ...BT2, spacing: null }), /Khoảng cột/);
});
