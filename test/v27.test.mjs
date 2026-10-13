// v2.7 — khu vực tự do: mỗi trụ nhiều đèn, mỗi đèn hướng / nghiêng / vươn / cao độ / IES riêng (vd trụ quảng trường).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { buildIesIndex } from "../src/batch.mjs";
import { LAMP_COLS, LAMP_HEAD, poleLamps, poleToLums, calcArea, parseAreaRows, buildAreaWorkbook, buildAreaTemplate, spreadLamps, AREA_COLS } from "../src/area.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const here = dirname(fileURLToPath(import.meta.url));
const txt70 = readFileSync(join(here, "fixtures/SL-70W.ies"), "utf8");
const txt150 = readFileSync(join(here, "fixtures/SL-150W.ies"), "utf8");
const idx = buildIesIndex([{ name: "SL-70W.ies", text: txt70 }, { name: "SL-150W.ies", text: txt150 }]);
const I70 = idx.find((e) => e.name === "SL-70W.ies"), I150 = idx.find((e) => e.name === "SL-150W.ies");
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const SQ = { name: "Quảng trường", x0: -20, y0: -20, L: 40, W: 40, step: 1, req: null, MF: null, poly: null };
const lamp = (aim, o = {}) => ({ aim, tilt: 20, arm: 0.6, H: null, ies: I70, iesWant: "SL-70W", ...o });

test("poleLamps: trụ cũ (không khai từng đèn) = N đèn giống nhau — tương thích ngược", () => {
  const p = { id: "T1", x: 1, y: 2, H: 10, aim: 30, tilt: 15, n: 3, ies: I70 };
  const L = poleLamps(p);
  assert.equal(L.length, 3);
  for (const l of L) assert.deepEqual([l.aim, l.tilt, l.arm, l.ies], [30, 15, 0, I70]);
  assert.equal(poleToLums(p).length, 3);
});

test("poleToLums: mỗi đèn đặt lệch khỏi tâm trụ một đoạn = vươn theo hướng chiếu, cao độ riêng nếu có", () => {
  const p = { id: "T1", x: 10, y: 5, H: 12, lamps: [lamp(0, { arm: 1 }), lamp(90, { arm: 2, H: 9 })] };
  const [a, b] = poleToLums(p);
  assert.ok(Math.abs(a.x - 11) < 1e-9 && Math.abs(a.y - 5) < 1e-9 && a.H === 12);
  assert.ok(Math.abs(b.x - 10) < 1e-9 && Math.abs(b.y - 7) < 1e-9 && b.H === 9);
});

test("spreadLamps: chia đều 360° giữ thông số khác của đèn", () => {
  const L = spreadLamps([lamp(10), lamp(10, { tilt: 30 }), lamp(10), lamp(10)], 45);
  assert.deepEqual(L.map((l) => l.aim), [45, 135, 225, 315]);
  assert.equal(L[1].tilt, 30);
});

test("calcArea: trụ 4 đèn chia đều 4 hướng ở tâm quảng trường → độ rọi đối xứng 4 phía", () => {
  const p = { id: "T1", x: 0, y: 0, H: 12, lamps: spreadLamps([lamp(0), lamp(0), lamp(0), lamp(0)], 0) };
  const r = calcArea({ poles: [p], areas: [SQ] }).areas[0];
  const g = r.grid, at = (x, y) => r.E[g.cell[Math.floor((y - g.y0) / g.dy) * g.nx + Math.floor((x - g.x0) / g.dx)]];
  for (const [x, y] of [[8.5, 0.5], [-8.5, 0.5], [0.5, 8.5], [0.5, -8.5]]) assert.ok(rel(at(x, y), at(8.5, 0.5)) < 0.03, `${x},${y}: ${at(x, y)} vs ${at(8.5, 0.5)}`);
});

test("calcArea: 1 trụ 2 đèn = 2 trụ 1 đèn cùng vị trí; mỗi đèn dùng đúng IES của nó; công suất = tổng từng đèn", () => {
  const two = { id: "T1", x: 0, y: 0, H: 12, lamps: [lamp(0), lamp(180, { ies: I150, iesWant: "SL-150W" })] };
  const a = { id: "A", x: 0, y: 0, H: 12, lamps: [lamp(0)] }, b = { id: "B", x: 0, y: 0, H: 12, lamps: [lamp(180, { ies: I150 })] };
  const r1 = calcArea({ poles: [two], areas: [SQ] }), r2 = calcArea({ poles: [a, b], areas: [SQ] });
  r1.areas[0].E.forEach((v, i) => assert.ok(Math.abs(v - r2.areas[0].E[i]) < 1e-9));
  const P = (e) => e.ph.inputWatts || e.power;
  assert.ok(Math.abs(r1.power - (P(I70) + P(I150))) < 1e-9, `${r1.power}`);
  assert.equal(r1.nPoles, 1); assert.equal(r1.nLamps, 2);
  // đèn 150 W phía −x sáng hơn đèn 70 W phía +x
  const g = r1.areas[0].grid, at = (x) => r1.areas[0].E[g.cell[20 * g.nx + Math.floor(x - g.x0)]];
  assert.ok(at(-8.5) > at(8.5) * 1.5, `${at(-8.5)} vs ${at(8.5)}`);
});

test("calcArea: đèn thiếu IES bị bỏ qua (không tính, không cộng công suất)", () => {
  const p = { id: "T1", x: 0, y: 0, H: 12, lamps: [lamp(0), lamp(90, { ies: null, iesWant: "KHONG-CO" })] };
  const r = calcArea({ poles: [p], areas: [SQ] });
  assert.equal(r.nLamps, 1);
  assert.ok(Math.abs(r.power - (I70.ph.inputWatts || I70.power)) < 1e-9);
});

const poleRows = [
  { [AREA_COLS.id]: "T1", [AREA_COLS.x]: 0, [AREA_COLS.y]: 0, [AREA_COLS.H]: 12, [AREA_COLS.aim]: 0, [AREA_COLS.tilt]: 10, [AREA_COLS.n]: 1, [AREA_COLS.ies]: "SL-70W" },
  { [AREA_COLS.id]: "T2", [AREA_COLS.x]: 10, [AREA_COLS.y]: 0, [AREA_COLS.H]: 10, [AREA_COLS.aim]: 45, [AREA_COLS.tilt]: 5, [AREA_COLS.n]: 2, [AREA_COLS.ies]: "SL-70W" },
];
const L = (pole, k, aim, tilt, arm, H, ies) => ({ [LAMP_COLS.pole]: pole, [LAMP_COLS.k]: k, [LAMP_COLS.aim]: aim, [LAMP_COLS.tilt]: tilt, [LAMP_COLS.arm]: arm, [LAMP_COLS.H]: H, [LAMP_COLS.ies]: ies });

test("Excel sheet DEN TREN TRU: trụ có dòng đèn dùng đèn riêng (thứ tự theo Đèn số, IES trống = theo trụ); trụ không có giữ cách cũ", () => {
  const lampRows = [L("T1", 2, 180, 25, 0.5, null, "SL-150W"), L("T1", 1, 0, 20, 0.5, 11, null), L("T9", 1, 0, 0, 0, null, null), L("T1", 3, 90, 999, 0, null, "KHONG-CO")];
  const { poles, warnings } = parseAreaRows({ poleRows, areaRows: [], lampRows }, idx);
  const t1 = poles.find((p) => p.id === "T1"), t2 = poles.find((p) => p.id === "T2");
  assert.equal(t1.lamps.length, 3);
  assert.deepEqual(t1.lamps.map((l) => l.aim), [0, 180, 90]);
  assert.equal(t1.lamps[0].ies, I70, "IES trống → theo trụ");
  assert.equal(t1.lamps[0].H, 11);
  assert.equal(t1.lamps[1].ies, I150);
  assert.equal(t1.lamps[2].ies, null);
  assert.equal(poleLamps(t2).length, 2, "T2 giữ 2 đèn giống nhau");
  assert.ok(warnings.some((w) => /T9/.test(w)), "mã trụ không tồn tại → cảnh báo");
  assert.ok(warnings.some((w) => /KHONG-CO/.test(w)), "IES không có → cảnh báo");
  assert.ok(warnings.some((w) => /nghiêng/i.test(w)), "góc nghiêng ngoài 0–90° → cảnh báo");
});

test("Excel kết quả có sheet DEN TREN TRU; đọc lại cho đúng đèn từng trụ (vòng tròn ghi → đọc)", async () => {
  const p = { id: "T1", x: 0, y: 0, H: 12, aim: 0, tilt: 20, n: 1, ies: I70, iesWant: "SL-70W",
    lamps: [lamp(0, { arm: 0.5 }), lamp(120, { tilt: 30, ies: I150 }), lamp(240, { H: 10 })] };
  const areas = [SQ], result = calcArea({ poles: [p], areas });
  const wb = await buildAreaWorkbook(ExcelJS, { poles: [p], areas, result });
  const ws = wb.getWorksheet("DEN TREN TRU");
  assert.ok(ws, "có sheet");
  assert.deepEqual(ws.getRow(1).values.slice(1), LAMP_HEAD);
  const buf = await wb.xlsx.writeBuffer();
  const x = XLSX.read(buf);
  const rd = (n) => XLSX.utils.sheet_to_json(x.Sheets[n], { defval: null });
  const back = parseAreaRows({ poleRows: rd("VI TRI TRU"), areaRows: rd("VUNG TINH"), lampRows: rd("DEN TREN TRU") }, idx);
  const q = back.poles[0];
  assert.deepEqual(q.lamps.map((l) => [l.aim, l.tilt, l.arm, l.H, l.ies && l.ies.name]), [[0, 20, 0.5, null, "SL-70W.ies"], [120, 30, 0.6, null, "SL-150W.ies"], [240, 20, 0.6, 10, "SL-70W.ies"]]);
  const r2 = calcArea({ poles: back.poles, areas });
  assert.ok(rel(r2.areas[0].Eav, result.areas[0].Eav) < 1e-9);
});

test("Excel mẫu khu vực có sheet DEN TREN TRU với ví dụ trụ nhiều đèn", async () => {
  const wb = await buildAreaTemplate(ExcelJS);
  const ws = wb.getWorksheet("DEN TREN TRU");
  assert.ok(ws && ws.rowCount >= 3);
  assert.deepEqual(ws.getRow(1).values.slice(1), LAMP_HEAD);
});
