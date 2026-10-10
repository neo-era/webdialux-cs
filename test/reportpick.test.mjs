// Đèn dùng cho báo cáo PDF/mục lục phải đúng đèn dòng chỉ định (lỗi: tuyến không đạt → PDF lấy đèn nhỏ nhất 40W
// trong khi dòng ghi 140W; mục lục lại hiện 140). Một hàm pickReportIes dùng chung cho mục lục + trang PDF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { COLS, rowToGeometry } from "../src/mapping.mjs";
import { buildIesIndex, runBatch, runBatchRanked, pickReportIes } from "../src/batch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const iesDir = join(here, "../data/ies");
// MAGNOLIA 60 / 80 / 100 / 120 W
const idx = buildIesIndex(readdirSync(iesDir).filter((f) => f.endsWith(".ies")).map((f) => ({ name: f, text: readFileSync(join(iesDir, f), "utf8") })));
const powerOf = (name) => idx.find((e) => e.name === name).power;

// cấp A, cột 12,5 m, khoảng cột 34 m, đường rộng → không bộ MAGNOLIA nào đạt (giống ca Vành Đai KCX Linh Trung 2)
const hard = (extra) => ({ [COLS.stt]: 1, [COLS.tuyen]: "Vành Đai KCX Linh Trung 2", [COLS.H]: 12.5, [COLS.vuon]: 1.5, [COLS.setback]: 0.5,
  [COLS.width]: 14, [COLS.spacing]: 34, [COLS.tilt]: 0, [COLS.arrangement]: "1 bên", [COLS.lanes]: 4, [COLS.roadClass]: "A", ...extra });
const run = (row, fn = runBatchRanked) => { const res = fn([row], idx, { MF: 0.8, q0: 0.08 })[0]; return { res, meta: rowToGeometry(row).meta }; };

test("TÁI HIỆN LỖI: Đa phương án, không đèn nào đạt, dòng ghi MAGNOLIA 120W → báo cáo dùng đúng 120W (không phải 60W nhỏ nhất)", () => {
  const { res, meta } = run(hard({ [COLS.model]: "MAGNOLIA", [COLS.power]: 120 }));
  assert.equal(res.status, "ok"); assert.equal(res.pass, false, "ca thử: không đèn nào đạt");
  assert.equal(powerOf(res.options[0].iesName), 60, "trước đây PDF lấy options[0] = đèn nhỏ nhất");
  const p = pickReportIes(res, meta, idx);
  assert.equal(p.e.power, 120);
  assert.equal(p.note, "", "đúng công suất dòng ghi → không cảnh báo");
});

test("dòng ghi công suất KHÔNG có trong thư mục IES (140W) → dùng công suất gần nhất (120W) + cảnh báo", () => {
  const { res, meta } = run(hard({ [COLS.model]: "MAGNOLIA", [COLS.power]: 140 }));
  const p = pickReportIes(res, meta, idx);
  assert.equal(p.e.power, 120);
  assert.equal(p.note, "Dữ liệu tuyến ghi 140 W — thư mục IES không có, dùng 120 W (gần nhất).");
});

test("dòng không ghi công suất, không đèn nào đạt → đèn công suất lớn nhất đã thử", () => {
  const { res, meta } = run(hard({ [COLS.model]: "MAGNOLIA" }));
  assert.equal(pickReportIes(res, meta, idx).e.power, 120);
  const { res: r2, meta: m2 } = run(hard({}));
  assert.equal(pickReportIes(r2, m2, idx).e.power, 120);
});

test("có đèn đạt → dùng đèn được chọn ✓; nếu khác công suất dòng ghi thì ghi rõ app tự chọn", () => {
  const easy = { ...hard({ [COLS.model]: "MAGNOLIA", [COLS.power]: 120 }), [COLS.roadClass]: "D2", [COLS.H]: 8, [COLS.width]: 7, [COLS.spacing]: 30, [COLS.lanes]: 2 };
  const { res, meta } = run(easy);
  assert.ok(res.chosen, "ca thử có đèn đạt");
  const p = pickReportIes(res, meta, idx);
  assert.equal(p.e.name, res.chosen.iesName);
  if (p.e.power !== 120) assert.equal(p.note, `Dữ liệu tuyến ghi 120 W — app chọn ${p.e.power} W (công suất nhỏ nhất vẫn Đạt).`);
});

test("Từng phương án: dùng đúng đèn đã tính (res.iesName)", () => {
  const { res, meta } = run(hard({ [COLS.model]: "MAGNOLIA", [COLS.power]: 100 }), runBatch);
  const p = pickReportIes(res, meta, idx);
  assert.equal(p.e.name, res.iesName); assert.equal(p.e.power, 100); assert.equal(p.note, "");
});

test("hai file cùng model + cùng công suất → ưu tiên file khớp chữ Fitting của dòng (STR16C PD24A)", () => {
  const base = readFileSync(join(iesDir, readdirSync(iesDir).find((f) => /120W/.test(f))), "utf8");
  const two = buildIesIndex([{ name: "MAGNOLIA-BL-STR16A-PD36B-140W.ies", text: base }, { name: "MAGNOLIA-BL-STR16C-PD24A-140W.ies", text: base }]);
  const row = hard({ [COLS.model]: "MAGNOLIA", [COLS.power]: 140, [COLS.fitting]: "1 x LED SL MAGNOLIA BL-STR16C PD24A 140W" });
  const res = runBatchRanked([row], two, { MF: 0.8, q0: 0.08 })[0];
  assert.equal(pickReportIes(res, rowToGeometry(row).meta, two).e.name, "MAGNOLIA-BL-STR16C-PD24A-140W.ies");
});

test("tuyến thiếu IES / thiếu hình học → null (bỏ qua như cũ)", () => {
  const { res, meta } = run({ [COLS.tuyen]: "Thiếu", [COLS.width]: 7 });
  assert.equal(pickReportIes(res, meta, idx), null);
  // model có trong danh sách nhưng thư mục IES không có file nào → "thiếu IES"
  const row = hard({ [COLS.model]: "CARINA", [COLS.power]: 60 });
  const r2 = runBatchRanked([row], idx, { MF: 0.8, q0: 0.08 })[0];
  assert.equal(r2.status, "thiếu IES");
  assert.equal(pickReportIes(r2, rowToGeometry(row).meta, idx), null);
});
