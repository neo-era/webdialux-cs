import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseIES, makeIntensity, integrateFlux } from "../src/ies.mjs";
import { buildGrid, angleLumToPoint } from "../src/geometry.mjs";
import { stats } from "../src/metrics.mjs";
import { calcRoad } from "../src/engine.mjs";
import { makeProvisionalRTable, Q0 } from "../src/rtable.mjs";
import R3DATA from "../src/r3data.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const MAG = parseIES(readFileSync(join(here, "fixtures/MAGNOLIA-60W.ies"), "utf8"));
const CAR = parseIES(readFileSync(join(here, "fixtures/CARINA-60W.ies"), "utf8"));

test("parse: kích thước ma trận candela khớp nV x nH", () => {
  assert.equal(MAG.candela.length, MAG.nH);
  assert.equal(MAG.candela[0].length, MAG.nV);
  assert.ok(MAG.totalLumens > 0 && MAG.inputWatts > 0);
});

test("tích phân candela ~ quang thông x ballast (<=5%)", () => {
  for (const ph of [MAG, CAR]) {
    const flux = integrateFlux(ph);
    const expected = ph.totalLumens * (ph.ballastFactor || 1);
    const err = Math.abs(flux - expected) / expected;
    assert.ok(err < 0.05, `lệch ${(err * 100).toFixed(1)}%`);
  }
});

test("hình học: điểm ngay dưới đèn -> gamma≈0", () => {
  const lum = { x: 0, y: 1, H: 8, tilt: 0, c0dir: 1 };
  const { gamma, dist } = angleLumToPoint(lum, { x: 0, y: 1 });
  assert.ok(gamma < 1e-6);
  assert.ok(Math.abs(dist - 8) < 1e-9);
});

test("hình học: gamma tăng theo khoảng cách ngang", () => {
  const lum = { x: 0, y: 0, H: 8, tilt: 0, c0dir: 1 };
  const a = angleLumToPoint(lum, { x: 0, y: 4 }).gamma;
  const b = angleLumToPoint(lum, { x: 0, y: 8 }).gamma;
  assert.ok(b > a && a > 0);
});

test("lưới CIE 140: số điểm & vị trí", () => {
  const g = buildGrid({ spacing: 35, width: 7, lanes: 2 });
  assert.equal(g.nLong, 12);           // 35/3 -> 12
  assert.equal(g.nTrans, 6);           // 3*2 lanes
  assert.equal(g.points.length, 72);
  assert.ok(Math.abs(g.points[0].x - 35 / 12 / 2) < 1e-9);
});

test("metrics.stats đúng", () => {
  const s = stats([2, 4, 6, 8]);
  assert.equal(s.avg, 5); assert.equal(s.min, 2); assert.equal(s.max, 8);
  assert.ok(Math.abs(s.g1 - 2 / 5) < 1e-9);
});

test("R-table tạm: q0 đúng & giảm theo tanEps", () => {
  const r = makeProvisionalRTable("R3");
  assert.equal(r.q0, Q0.R3);
  assert.ok(r(0, 0) > r(0, 3)); // cos^3 giảm
  assert.ok(r.provisional === true);
});

test("ĐỐI CHIẾU DIALux ĐX-073: độ rọi khớp <=10%", () => {
  const r = calcRoad({ ies: MAG, H: 7.5, overhang: 1.0, spacing: 35, width: 7, lanes: 2, arrangement: "1 bên", tilt: 15, MF: 0.8, roadClass: "D1" });
  // IES biến thể 9432lm (bản ĐX-073 ~9762lm) nên cho biên 12%
  assert.ok(Math.abs(r.E.avg - 15.4) / 15.4 < 0.12, `Eav=${r.E.avg.toFixed(2)}`);
  assert.ok(Math.abs(r.E.g1 - 0.30) < 0.05, `g1=${r.E.g1.toFixed(2)}`);
  assert.ok(r.E.max > r.E.avg && r.E.min < r.E.avg);
});

test("đường ống độ chói đúng: với R-table tạm (q0=0.07), Lav = q0 x Eav", () => {
  const r = calcRoad({ ies: MAG, H: 7.5, overhang: 1.0, spacing: 35, width: 7, lanes: 2, arrangement: "1 bên", tilt: 15, MF: 0.8, roadClass: "D1", rfn: makeProvisionalRTable("R3") });
  const expected = Q0.R3 * r.E.avg;
  assert.ok(Math.abs(r.road.Lav - expected) / expected < 0.03, `Lav=${r.road.Lav.toFixed(3)} vs q0*Eav=${expected.toFixed(3)}`);
});

test("ĐỐI CHIẾU DIALux ĐX-073 (bảng R3 thật): Lav <=12% & Uo khớp <=0.08", () => {
  const r = calcRoad({ ies: MAG, H: 7.5, overhang: 1.0, spacing: 35, width: 7, lanes: 2, arrangement: "1 bên", tilt: 15, MF: 0.8, roadClass: "D1" });
  assert.ok(Math.abs(r.road.Lav - 0.92) / 0.92 < 0.12, `Lav=${r.road.Lav.toFixed(2)} vs DIALux 0.92`);
  assert.ok(Math.abs(r.road.Uo - 0.52) < 0.08, `Uo=${r.road.Uo.toFixed(2)} vs DIALux 0.52`);
  assert.equal(r.provisionalLuminance, false);
});

test("bảng R3 thật: q0=0.07, 29 cột tanε x 20 hàng β", () => {
  assert.equal(R3DATA.q0, 0.07);
  assert.equal(R3DATA.tanEps.length, 29);
  assert.equal(R3DATA.beta.length, 20);
  assert.equal(R3DATA.r.length, 20);
  assert.equal(R3DATA.r[0].length, 29);
});

test("ca xấu: IES thiếu TILT -> ném lỗi", () => {
  assert.throws(() => parseIES("IESNA:LM-63-2002\n1 2 3\n"));
});

test("ca xấu: hình học thiếu -> vẫn chạy, không NaN", () => {
  const r = calcRoad({ ies: CAR, H: 9, overhang: 0, spacing: 30, width: 7, lanes: 2, roadClass: "C2" });
  assert.ok(Number.isFinite(r.E.avg) && Number.isFinite(r.road.Lav));
});

test("calcRoad: Lav tỉ lệ tuyến tính với q0 (0.08/0.07 = 1.1429)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const { parseIES } = await import("../src/ies.mjs");
  const here = dirname(fileURLToPath(import.meta.url));
  const ph = parseIES(readFileSync(join(here, "../data/ies/MAGNOLIA-BL-STR16B-PD24-100W.ies"), "utf8"));
  const g = { ies: ph, H: 10.5, overhang: 0, spacing: 35, width: 13, lanes: 3, arrangement: "đối xứng", tilt: 15, MF: 0.8, roadClass: "C2" };
  const a = calcRoad({ ...g, q0: 0.07 }).road.Lav;
  const b = calcRoad({ ...g, q0: 0.08 }).road.Lav;
  assert.ok(Math.abs(b / a - 0.08 / 0.07) < 1e-6, "Lav scale đúng theo q0");
  // mặc định (không truyền q0) = R3 q0 0,07
  const d = calcRoad({ ...g }).road.Lav;
  assert.ok(Math.abs(d - a) < 1e-9, "mặc định = q0 0,07");
});
