import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rowToGeometry, matchIES, modelKeyword, powerFromName, normKey, COLS } from "../src/mapping.mjs";
import { buildIesIndex, runBatch } from "../src/batch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const iesDir = join(here, "../data/ies");
const iesFiles = readdirSync(iesDir).filter((f) => f.endsWith(".ies"))
  .map((f) => ({ name: f, text: readFileSync(join(iesDir, f), "utf8") }));
const idx = buildIesIndex(iesFiles);

test("rowToGeometry: overhang = vươn - setback; lanes/class đọc đúng", () => {
  const row = { [COLS.H]: 7.5, [COLS.vuon]: 1.5, [COLS.setback]: 0.5, [COLS.width]: 7, [COLS.spacing]: 35, [COLS.lanes]: 2, [COLS.tilt]: 15, [COLS.arrangement]: "1 bên", [COLS.roadClass]: "D1", [COLS.model]: "MAGNOLIA BL-STR16A-PD36", [COLS.power]: 60 };
  const g = rowToGeometry(row);
  assert.equal(g.input.overhang, 1.0);
  assert.equal(g.input.lanes, 2);
  assert.equal(g.input.roadClass, "D1");
  assert.equal(g.warnings.length, 0);
});

test("rowToGeometry: thiếu cột -> cảnh báo", () => {
  const g = rowToGeometry({ [COLS.width]: 7, [COLS.spacing]: 30 });
  assert.ok(g.warnings.some((w) => w.includes("Độ cao")));
});

test("mapping helpers: normKey, modelKeyword, powerFromName", () => {
  assert.equal(modelKeyword("MAGNOLIA BL-STR16A-PD36"), "MAGNOLIA");
  assert.equal(modelKeyword("TEMBIN-C"), "TEMBINC");
  assert.equal(powerFromName("646AEE4-...-60W_IESNA2002"), 60);
  assert.equal(normKey("Tembin-C "), "TEMBINC");
});

test("buildIesIndex: parse & gán model+power", () => {
  assert.ok(idx.length >= 3);
  const mag = idx.find((e) => e.model === "MAGNOLIA" && e.power === 60);
  assert.ok(mag, "có MAGNOLIA 60W");
});

test("matchIES: khớp model+công suất", () => {
  const { ies } = matchIES({ model: "MAGNOLIA BL-STR16A-PD36", power: 60 }, idx);
  assert.ok(ies && ies.power === 60 && ies.model === "MAGNOLIA");
});

test("matchIES: không có model -> báo thiếu", () => {
  const r = matchIES({ model: "SIGMA", power: 100 }, idx);
  assert.equal(r.ies, null);
});

test("runBatch: tính được & cờ trạng thái đúng", () => {
  const rows = [
    { [COLS.stt]: 1, [COLS.tuyen]: "Test", [COLS.H]: 7.5, [COLS.vuon]: 1.5, [COLS.setback]: 0.5, [COLS.width]: 7, [COLS.spacing]: 35, [COLS.lanes]: 2, [COLS.tilt]: 15, [COLS.arrangement]: "1 bên", [COLS.roadClass]: "D1", [COLS.model]: "MAGNOLIA", [COLS.power]: 60 },
    { [COLS.stt]: 2, [COLS.tuyen]: "NoIES", [COLS.H]: 8, [COLS.width]: 7, [COLS.spacing]: 30, [COLS.lanes]: 2, [COLS.roadClass]: "C2", [COLS.model]: "SIGMA", [COLS.power]: 100 },
  ];
  const res = runBatch(rows, idx);
  assert.equal(res[0].status, "ok");
  assert.ok(res[0].Ltb > 0 && typeof res[0].pass === "boolean");
  assert.equal(res[1].status, "thiếu IES");
});
