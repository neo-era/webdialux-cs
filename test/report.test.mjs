import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseIES } from "../src/ies.mjs";
import { calcRoad } from "../src/engine.mjs";
import { reportData, grid2D } from "../src/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const MAG = parseIES(readFileSync(join(here, "fixtures/MAGNOLIA-60W.ies"), "utf8"));
const input = { ies: MAG, H: 7.5, overhang: 1.0, spacing: 35, width: 7, lanes: 2, tilt: 15, MF: 0.8, roadClass: "D1", detail: true };
const result = calcRoad(input);

test("reportData: cấu trúc checks + stats + observers", () => {
  const d = reportData(input, result, MAG, { tuyen: "Test", model: "MAGNOLIA", power: 60 });
  assert.equal(d.checks.length, 5);
  assert.equal(d.checks[0].sym, "Lav (Ltb)");
  assert.equal(typeof d.checks[0].ok, "boolean");
  assert.ok(d.illum.Eav > 0 && d.illum.g1 > 0);
  assert.equal(d.observers.length, 2);
  assert.ok(d.luminaire.efficacy > 100);
  assert.equal(d.roadClass, "D1");
});

test("reportData: Target khớp ngưỡng QCVN; Check đúng chiều (TI ≤, còn lại ≥)", () => {
  const d = reportData(input, result, MAG, {});
  const ti = d.checks.find((r) => r.sym === "TI");
  assert.equal(ti.target, 20);             // D1 TI ≤ 20
  assert.equal(ti.ok, result.road.TI <= 20);
  const lav = d.checks.find((r) => r.sym === "Lav (Ltb)");
  assert.equal(lav.ok, result.road.Lav >= 0.7);
});

test("grid2D: kích thước hàng×cột = nTrans×nLong", () => {
  const g = grid2D(result);
  assert.equal(g.g.length, result.grid.nTrans);
  assert.equal(g.g[0].length, result.grid.nLong);
  assert.ok(g.xs.length === result.grid.nLong && g.ys.length === result.grid.nTrans);
});

test("detail: engine trả Lvals cho observer khi detail=true", () => {
  assert.ok(Array.isArray(result.observers[0].Lvals));
  assert.equal(result.observers[0].Lvals.length, result.grid.points.length);
});
