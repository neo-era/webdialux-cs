import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { COLS } from "../src/mapping.mjs";
import { buildIesIndex, runBatchRanked } from "../src/batch.mjs";
import { summarizeLuminaires, estimateLampCount, buildResultWorkbook } from "../src/xlsxpro.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const here = dirname(fileURLToPath(import.meta.url));
const iesDir = join(here, "../data/ies");
const idx = buildIesIndex(readdirSync(iesDir).filter((f) => f.endsWith(".ies")).map((f) => ({ name: f, text: readFileSync(join(iesDir, f), "utf8") })));

const rows = [
  { [COLS.stt]: 1, [COLS.tuyen]: "Tuyến A", "Chiều dài tuyến (m)": 700, [COLS.H]: 7.5, [COLS.vuon]: 1.5, [COLS.setback]: 0.5, [COLS.width]: 7, [COLS.spacing]: 35, [COLS.tilt]: 15, [COLS.arrangement]: "1 bên", [COLS.lanes]: 2, [COLS.roadClass]: "D1" },
  { [COLS.stt]: 2, [COLS.tuyen]: "Tuyến B", "SL đèn trình Sở (bộ)": 18, [COLS.H]: 10.5, [COLS.vuon]: 1.5, [COLS.setback]: 1.5, [COLS.width]: 13, [COLS.spacing]: 35, [COLS.tilt]: 15, [COLS.arrangement]: "đối xứng", [COLS.lanes]: 3, [COLS.roadClass]: "C2" },
  { [COLS.stt]: 3, [COLS.tuyen]: "Tuyến C (thiếu H)", [COLS.width]: 7, [COLS.spacing]: 30 },
];
const results = runBatchRanked(rows, idx, { MF: 0.8, q0: 0.08 });

test("estimateLampCount: ưu tiên cột SL, không thì ceil(L/S)·nSide", () => {
  assert.deepEqual(estimateLampCount(rows[1], results[1].input), { n: 18, src: "theo Excel" });
  const e = estimateLampCount(rows[0], results[0].input);
  assert.equal(e.n, Math.ceil(700 / 35) * 1); assert.equal(e.src, "ước tính L/S");
  assert.equal(estimateLampCount({}, { spacing: 30, arrangement: "1 bên" }).n, null);
});

test("summarizeLuminaires: gộp theo hãng·loại·CS, cộng số tuyến/số bộ/kW, sắp theo CS", () => {
  const s = summarizeLuminaires(results, rows);
  assert.ok(s.length >= 1);
  const totalRoutes = s.reduce((a, g) => a + g.routes, 0);
  assert.equal(totalRoutes, results.filter((r) => r.status === "ok" && r.chosen).length);
  for (let i = 1; i < s.length; i++) assert.ok((s[i - 1].power ?? 0) <= (s[i].power ?? 0), "sắp theo công suất");
  for (const g of s) assert.ok(g.manufac && g.model && g.tuyen.length === g.routes);
  // kW = Σ số bộ × P/1000
  for (const g of s) if (g.lampsKnown) assert.ok(Math.abs(g.kW - g.lamps * g.power / 1000) < 1e-9);
});

test("buildResultWorkbook: 3 sheet, tiêu đề, header định dạng, dòng dữ liệu, tổng cộng", async () => {
  const wb = await buildResultWorkbook(ExcelJS, { results, rows, q0: 0.08, MF: 0.8, version: "v1.1", date: new Date(2026, 9, 9) });
  assert.deepEqual(wb.worksheets.map((w) => w.name), ["Chấm điểm chi tiết", "Tổng hợp đèn", "Theo tuyến"]);
  const ws = wb.getWorksheet("Chấm điểm chi tiết");
  assert.match(String(ws.getCell("A1").value), /CHẤM ĐIỂM/);
  const hdr = ws.getRow(4);
  assert.equal(hdr.getCell(1).value, "STT");
  assert.equal(hdr.getCell(1).fill.fgColor.argb, "FF1F4E79", "header có màu nền");
  assert.ok(ws.rowCount > 4, "có dòng dữ liệu");
  // dòng bộ đèn được chọn có ✓ và tô màu
  let found = false;
  ws.eachRow((row, n) => { if (n > 4 && (row.getCell(38).value?.result ?? row.getCell(38).value) === "✓") { found = true; assert.equal(row.getCell(1 + 19 - 1).fill?.fgColor?.argb, "FFE2F0D9"); } });
  assert.ok(found, "có dòng ✓ chọn");
  // tuyến thiếu hình học vẫn có dòng với trạng thái
  let thieu = false; ws.eachRow((row) => { if (String(row.getCell(29).value || "").includes("thiếu hình học")) thieu = true; });
  assert.ok(thieu);
  const ws2 = wb.getWorksheet("Tổng hợp đèn");
  let tong = false; ws2.eachRow((row) => { if (row.getCell(2).value === "TỔNG CỘNG") tong = true; });
  assert.ok(tong, "có dòng TỔNG CỘNG");
  const ws3 = wb.getWorksheet("Theo tuyến");
  assert.equal(ws3.rowCount, 4 + results.length);
  // ghi được ra buffer xlsx hợp lệ
  const buf = await wb.xlsx.writeBuffer();
  assert.ok(buf.byteLength > 5000);
});

test("toRankedShape: kết quả Từng phương án (runBatch) xuất được workbook 3 sheet", async () => {
  const { runBatch } = await import("../src/batch.mjs");
  const { toRankedShape } = await import("../src/xlsxpro.mjs");
  const each = runBatch(rows, idx, { MF: 0.8, q0: 0.08 });
  const shaped = toRankedShape(each, rows, idx);
  assert.equal(shaped.length, each.length);
  const ok = shaped.find((r) => r.status === "ok" && r.pass);
  assert.ok(ok && ok.options.length === 1 && ok.chosen === ok.options[0] && ok.chosen.rank === 1, "1 option, chosen rank 1");
  assert.ok(ok.chosen.manufac, "manufac tra từ iesIndex");
  assert.ok(ok.input && ok.input.spacing, "input dựng từ rowToGeometry");
  const thieu = shaped.find((r) => r.status !== "ok");
  assert.deepEqual([thieu.options, thieu.chosen], [[], null]);
  // ranked đưa vào trả nguyên
  assert.equal(toRankedShape(results, rows, idx)[0], results[0]);
  const wb = await buildResultWorkbook(ExcelJS, { results: shaped, rows, q0: 0.08, MF: 0.8 });
  assert.equal(wb.worksheets.length, 3);
  let tong = false; wb.getWorksheet("Tổng hợp đèn").eachRow((row) => { if (row.getCell(2).value === "TỔNG CỘNG") tong = true; });
  assert.ok(tong);
});
