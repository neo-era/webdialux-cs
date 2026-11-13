// v3.7 — Góc nghiêng bộ đèn: ô trống → app thử 0/5/10/15/20° và chọn góc tốt nhất; ô có số → dùng đúng số đó.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { TILT_STEPS, pickBestTilt, tiltMargin, calcWithTilt } from "../src/tiltSweep.mjs";
import { calcRoad } from "../src/engine.mjs";
import { parseIES } from "../src/ies.mjs";
import { COLS, rowToGeometry } from "../src/mapping.mjs";
import { buildIesIndex, runBatch, runBatchRanked, lampRows } from "../src/batch.mjs";
import { buildResultWorkbook, toRankedShape } from "../src/xlsxpro.mjs";
import { addTongHopResultSheet, groupByRoute, TH_SHEET, TH_FIRST } from "../src/tonghop.mjs";

const fx = (n) => ({ name: n, text: readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "latin1") });
const CAR = fx("CARINA-60W.ies"), MAG = fx("MAGNOLIA-60W.ies");
const idxC = buildIesIndex([CAR]), idx = buildIesIndex([CAR, MAG]);
const phC = parseIES(CAR.text);

// hình học: CARINA chỉ Đạt ở 20° (0–15° rớt) → ô trống phải tự chọn 20° + cảnh báo
const HARD = { [COLS.tuyen]: "Khó", [COLS.H]: 8, [COLS.vuon]: 2, [COLS.width]: 9, [COLS.spacing]: 30, [COLS.setback]: 0.5,
  [COLS.arrangement]: "so le", [COLS.lanes]: 2, [COLS.roadClass]: "C1", [COLS.model]: "CARINA", [COLS.power]: 60 };
// hình học dễ: CARINA Đạt ngay ở 0° → ô trống phải ra 0°
const EASY = { [COLS.tuyen]: "Dễ", [COLS.H]: 8, [COLS.vuon]: 1, [COLS.width]: 7, [COLS.spacing]: 30, [COLS.setback]: 0.5,
  [COLS.arrangement]: "1 bên", [COLS.lanes]: 2, [COLS.roadClass]: "D1", [COLS.model]: "CARINA", [COLS.power]: 60 };
const engine = (row, t) => { const g = rowToGeometry({ ...row, [COLS.tilt]: t }); return calcRoad({ ies: phC, ...g.input, MF: 0.8 }); };

const fake = (tilt, pass, road, checks) => ({ tilt, r: { pass, road, req: { Ltb: 1, Uo: 0.4, Ul: 0.6, TI: 15, SR: 0.5 }, checks } });
const allOk = { Ltb: true, Uo: true, Ul: true, TI: true, SR: true };

test("quy tắc: có góc Đạt → góc NHỎ NHẤT Đạt (dù góc lớn hơn có biên lớn hơn)", () => {
  const b = pickBestTilt([
    fake(0, false, { Lav: 0.9, Uo: 0.5, Ul: 0.7, TI: 10, SR: 0.6 }, { ...allOk, Ltb: false }),
    fake(5, true, { Lav: 1.0, Uo: 0.41, Ul: 0.61, TI: 10, SR: 0.6 }, allOk),
    fake(10, true, { Lav: 1.5, Uo: 0.6, Ul: 0.8, TI: 8, SR: 0.8 }, allOk),
  ]);
  assert.equal(b.tilt, 5);
});

test("quy tắc: không góc nào Đạt → ít chỉ tiêu rớt nhất, rồi biên lớn nhất; hoà (≤0,02) → góc nhỏ hơn", () => {
  const two = { ...allOk, Ltb: false, SR: false }, one = { ...allOk, SR: false };
  assert.equal(pickBestTilt([
    fake(0, false, { Lav: 0.99, Uo: 0.5, Ul: 0.7, TI: 10, SR: 0.49 }, two),   // m≈0,98 nhưng rớt 2
    fake(5, false, { Lav: 1.2, Uo: 0.5, Ul: 0.7, TI: 10, SR: 0.44 }, one),    // m=0,88 rớt 1 → chọn
  ]).tilt, 5);
  assert.equal(pickBestTilt([
    fake(10, false, { Lav: 1.2, Uo: 0.5, Ul: 0.7, TI: 10, SR: 0.45 }, one),   // m=0,90
    fake(15, false, { Lav: 1.2, Uo: 0.5, Ul: 0.7, TI: 10, SR: 0.46 }, one),   // m=0,92 — hoà trong 0,02 → 10
  ]).tilt, 10);
  assert.equal(pickBestTilt([]), null);
});

test("biên m tính trên số đã làm tròn: TI 10,4 với YC 10 → m = 1 (Đạt), TI = 0 không chia 0", () => {
  const r = { req: { Ltb: 1, Uo: 0.4, Ul: 0.6, TI: 10, SR: 0.5 }, road: { Lav: 2, Uo: 0.8, Ul: 1.2, TI: 10.4, SR: 1 }, checks: allOk };
  assert.equal(tiltMargin(r).m, 1); assert.equal(tiltMargin(r).nfail, 0);
  assert.ok(isFinite(tiltMargin({ ...r, road: { ...r.road, TI: 0 } }).m));
});

test("calcWithTilt: có số → tính đúng 1 lần; null → thử đủ 5 góc", () => {
  const seen = [];
  const one = calcWithTilt((t) => { seen.push(t); return engine(EASY, t); }, 7);
  assert.deepEqual(seen, [7]); assert.equal(one.tilt, 7); assert.equal(one.auto, false);
  seen.length = 0;
  const sw = calcWithTilt((t) => { seen.push(t); return engine(EASY, t); }, null);
  assert.deepEqual(seen, TILT_STEPS); assert.equal(sw.auto, true);
  assert.throws(() => calcWithTilt(() => { throw new Error("x"); }, null));
});

test("calcRoad từ chối góc nghiêng null (không lặng lẽ thành 0°)", () => {
  const g = rowToGeometry({ ...EASY, [COLS.tilt]: 0 }).input;
  assert.throws(() => calcRoad({ ies: phC, ...g, tilt: null }), /góc nghiêng/i);
  assert.throws(() => calcRoad({ ies: phC, ...g, tilt: NaN }), /góc nghiêng/i);
});

test("rowToGeometry: ô trống / chữ / lỗi Excel → tilt null + tiltAuto; số (kể cả 0, '15°') → số", () => {
  for (const v of [null, "", "  ", "#N/A", "abc"]) {
    const g = rowToGeometry({ ...EASY, [COLS.tilt]: v });
    assert.equal(g.input.tilt, null, String(v)); assert.equal(g.meta.tiltAuto, true);
  }
  assert.equal(rowToGeometry({ ...EASY, [COLS.tilt]: 0 }).input.tilt, 0);
  assert.equal(rowToGeometry({ ...EASY, [COLS.tilt]: "15°" }).input.tilt, 15);
  assert.equal(rowToGeometry({ ...EASY, [COLS.tilt]: 0 }).meta.tiltAuto, false);
  assert.ok(rowToGeometry({ ...EASY, [COLS.tilt]: 40 }).warnings.some((w) => /góc nghiêng/i.test(w)));
  assert.ok(rowToGeometry({ ...EASY, [COLS.tilt]: -5 }).warnings.some((w) => /góc nghiêng/i.test(w)));
});

test("Từng phương án: ô trống → Đạt nhờ tự chọn 20° (kèm cảnh báo góc lớn); ô = 0 → Không đạt ở 0°", () => {
  assert.equal(engine(HARD, 0).pass, false); assert.equal(engine(HARD, 20).pass, true); // tiền đề
  const [auto, zero] = runBatch([{ ...HARD }, { ...HARD, [COLS.tilt]: 0 }], idxC);
  assert.equal(auto.pass, true); assert.equal(auto.tilt, 20); assert.equal(auto.tiltAuto, true); assert.match(auto.tiltWarn, /góc 20° lớn/);
  assert.equal(zero.pass, false); assert.equal(zero.tilt, 0); assert.equal(zero.tiltAuto, false); assert.equal(zero.tiltWarn, null);
  const easy = runBatch([{ ...EASY }], idxC)[0];
  assert.equal(easy.tilt, 0); assert.equal(easy.pass, true);
});

test("Từng phương án tự chọn đèn (không ghi model): mỗi IES quét góc, kết quả mang góc", () => {
  const row = { ...HARD }; delete row[COLS.model]; delete row[COLS.power];
  const r = runBatch([row], idx)[0];
  assert.equal(r.status, "ok"); assert.ok(TILT_STEPS.includes(r.tilt)); assert.equal(r.tiltAuto, true);
});

test("Đa phương án: mỗi bộ đèn mang góc tốt nhất của nó; ô có số thì mọi bộ dùng số đó", () => {
  const row = { ...HARD }; delete row[COLS.model]; delete row[COLS.power];
  const [a] = runBatchRanked([row], idx);
  const car = a.options.find((o) => /CARINA/.test(o.iesName));
  assert.equal(car.tilt, 20); assert.equal(car.tiltAuto, true); assert.equal(car.pass, true);
  for (const o of a.options) assert.ok(TILT_STEPS.includes(o.tilt));
  const [b] = runBatchRanked([{ ...row, [COLS.tilt]: 10 }], idx);
  for (const o of b.options) { assert.equal(o.tilt, 10); assert.equal(o.tiltAuto, false); }
  assert.equal(a.input.tilt, a.chosen ? a.chosen.tilt : a.input.tilt);
});

const lampsRoute = (lamps) => { const r = { ...HARD, [COLS.tilt]: 10 }; delete r[COLS.model]; delete r[COLS.power]; Object.defineProperty(r, "__lamps", { value: lamps, enumerable: false }); return r; };

test("file tổng hợp: dòng đèn trống góc KHÔNG mượn góc của dòng khác / của tuyến → quét", () => {
  const R = lampsRoute([{ model: "CARINA", power: 60, tilt: 10 }, { model: "CARINA", power: 60, tilt: null, fitting: "CARINA tự chọn góc" }]);
  const f = lampRows(R);
  assert.equal(f[0][COLS.tilt], 10); assert.equal(f[1][COLS.tilt], null);
  const [r] = runBatchRanked([R], idxC);
  const fixed = r.options.find((o) => o.tilt === 10 && !o.tiltAuto), auto = r.options.find((o) => o.tiltAuto);
  assert.ok(fixed); assert.ok(auto); assert.equal(auto.tilt, 20); assert.equal(auto.pass, true);
});

test("bộ đèn chỉ định không có IES → quét toàn thư viện và quét góc", () => {
  const R = lampsRoute([{ model: "HELIOS", power: 60, tilt: null }]);
  const [r] = runBatchRanked([R], idx);
  assert.ok(r.fallback); assert.ok(r.options.some((o) => o.tiltAuto));
});

async function aoaOf(wb, name) {
  const w = XLSX.read(await wb.xlsx.writeBuffer(), { type: "buffer" });
  return XLSX.utils.sheet_to_json(w.Sheets[name], { header: 1, defval: null, raw: true });
}

test("Excel kết quả: góc theo từng phương án (Chấm điểm chi tiết cột L), cột góc cuối sheet Theo tuyến, ghi chú tự chọn ở TONG HOP cột 18", async () => {
  const R = lampsRoute([{ model: "CARINA", power: 60, tilt: 10, fitting: "A" }, { model: "CARINA", power: 60, tilt: null, fitting: "B" }]);
  const res = runBatchRanked([R], idxC);
  const wb = await buildResultWorkbook(ExcelJS, { results: res, rows: [R] });
  addTongHopResultSheet(wb, { results: res, rows: [R] });
  const s1 = await aoaOf(wb, "Chấm điểm chi tiết");
  assert.equal(s1[3][11], "Nghiêng (°)");
  const tilts = s1.slice(4).filter((r) => r[21]).map((r) => r[11]);
  assert.deepEqual(tilts.sort((a, b) => a - b), res[0].options.filter((o) => o.pass).map((o) => o.tilt).sort((a, b) => a - b));
  const s3 = await aoaOf(wb, "Theo tuyến");
  const h3 = s3[3]; assert.match(String(h3[h3.length - 1]), /Góc nghiêng/);
  assert.equal(s3[4][h3.length - 1], res[0].chosen.tilt);
  const ws = wb.getWorksheet(TH_SHEET);
  const autoRow = [0, 1].map((k) => ws.getRow(TH_FIRST + k)).find((r) => r.getCell(18).value === 20);
  assert.ok(autoRow, "dòng tự chọn ghi 20"); assert.match(String(autoRow.getCell(18).note?.texts?.map((t) => t.text).join("") ?? autoRow.getCell(18).note), /tự chọn/i);
  assert.match(String(autoRow.getCell(18).note?.texts?.map((t) => t.text).join("") ?? autoRow.getCell(18).note), /lớn/);
});

test("Từng phương án + file tổng hợp: groupByRoute lấy góc đã dùng (không lấy ô trống đầu vào)", () => {
  const R = lampsRoute([{ model: "CARINA", power: 60, tilt: null }]);
  const flat = lampRows(R).map((x) => Object.assign(x, { __route: 0 }));
  const g = groupByRoute(runBatch(flat, idxC), flat, [R]);
  assert.equal(g[0].options[0].tilt, 20); assert.equal(g[0].options[0].tiltAuto, true);
  const shaped = toRankedShape(runBatch([{ ...HARD }], idxC), [{ ...HARD }], idxC);
  assert.equal(shaped[0].options[0].tilt, 20);
});

test("index.html: PDF dùng góc của phương án in ra; chia lô theo số lượt tính; bảng hiển thị góc tự chọn", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /res\.tilt/);
  assert.match(html, /chunkFor\(/);
  assert.match(html, /tự chọn/);
});
