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

test("tên bộ đèn thống nhất với PDF: Tổng hợp đèn gộp theo tên file IES (luminaireLabel)", async () => {
  const { luminaireLabel } = await import("../src/mapping.mjs");
  const s = summarizeLuminaires(results, rows);
  const want = new Set(results.filter((r) => r.status === "ok" && r.chosen).map((r) => luminaireLabel(r.chosen.iesName)));
  assert.deepEqual(new Set(s.map((g) => g.model)), want);
  for (const g of s) assert.ok(!/\.ies$|_IESNA2002/i.test(g.model), g.model);
});

test("Tổng hợp đèn: tên khác chữ hoa/thường gộp 1 nhóm (Excel so = không phân biệt hoa thường); đèn thiếu tên file vẫn đếm đúng", async () => {
  const { createRequire } = await import("node:module");
  const { HyperFormula } = await import("hyperformula");
  const fake = (iesName, model) => { const o = { iesName, model, manufac: "ACME", power: 60, Ltb: 1, Uo: 0.5, Ul: 0.6, TI: 10, SR: 0.6, En: 15, pass: true, d_Ltb: 1, d_Uo: 1, d_Ul: 1, d_TI: 1, d_SR: 1, tong1: 5, tong2: 0, rank: 1, chosen: true };
    return { status: "ok", stt: 1, tuyen: "T", roadClass: "D1", input: { spacing: 30, width: 7, H: 8, arrangement: "1 bên" }, meta: {}, req: { Ltb: 0.7, Uo: 0.4, Ul: 0.4, TI: 20, SR: 0.5 }, options: [o], chosen: o }; };
  const res = [fake("Led-A_60W.ies", "LED"), fake("LED-A_60W.IES", "LED"), fake(null, "NOFILE"), fake(null, "NOFILE")];
  const rw = res.map(() => ({ "SL đèn trình Sở (bộ)": 10 }));
  const s = summarizeLuminaires(res, rw);
  assert.deepEqual(s.map((g) => [g.model.toUpperCase(), g.routes]).sort(), [["LED-A_60W", 2], ["NOFILE", 2]]);
  const wb = await buildResultWorkbook(ExcelJS, { results: res, rows: rw });
  const sheets = {};
  for (const ws of wb.worksheets) { const d = []; ws.eachRow({ includeEmpty: true }, (row, r) => { const l = []; row.eachCell({ includeEmpty: true }, (c, col) => { const v = c.isMerged && c.master !== c ? null : c.value; l[col - 1] = v && typeof v === "object" && "formula" in v ? "=" + v.formula : v; }); d[r - 1] = Array.from(l, (x) => x ?? null); }); sheets[ws.name] = Array.from(d, (x) => x ?? []); }
  const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3", useArrayArithmetic: true });
  const sid = hf.getSheetId("Tổng hợp đèn");
  s.forEach((g, i) => assert.equal(hf.getCellValue({ sheet: sid, row: 4 + i, col: 4 }), g.routes, `công thức số tuyến ${g.model}`));
});
