// Excel kết quả có công thức sống: tính lại toàn bộ công thức bằng HyperFormula và so với kết quả app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { HyperFormula } from "hyperformula";
import { COLS } from "../src/mapping.mjs";
import { buildIesIndex, runBatchRanked, runBatch } from "../src/batch.mjs";
import { buildResultWorkbook, summarizeLuminaires, toRankedShape } from "../src/xlsxpro.mjs";
import { scoreOptions } from "../src/scoring.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const here = dirname(fileURLToPath(import.meta.url));
const readIes = (dir) => readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".ies")).map((f) => ({ name: f, text: readFileSync(join(dir, f), "utf8") }));
// 4 MAGNOLIA + CARINA-60W (trùng công suất 60 W với MAGNOLIA-60W → thử nhánh đồng công suất)
const idx = buildIesIndex([...readIes(join(here, "../data/ies")), ...readIes(join(here, "fixtures")).filter((f) => /CARINA/i.test(f.name))]);

const CLS = ["C1", "C2", "D1", "D2", "B2", "A"];
const rows = Array.from({ length: 786 }, (_, i) => ({
  [COLS.stt]: i + 1, [COLS.tuyen]: `Tuyến ${i + 1}`, "Chiều dài tuyến (m)": 300 + (i % 9) * 50,
  [COLS.H]: 7 + (i % 6), [COLS.vuon]: 1.5, [COLS.setback]: 0.5 + (i % 3) * 0.5, [COLS.width]: 6 + (i % 8),
  [COLS.spacing]: 25 + (i % 15), [COLS.tilt]: [5, 10, 15][i % 3], [COLS.arrangement]: ["1 bên", "đối xứng", "so le"][i % 3],
  [COLS.lanes]: 2 + (i % 2), [COLS.roadClass]: CLS[i % CLS.length],
}));
rows.push({ [COLS.stt]: 787, [COLS.tuyen]: "Tuyến thiếu H", [COLS.width]: 7, [COLS.spacing]: 30 });
const results = runBatchRanked(rows, idx, { MF: 0.8, q0: 0.08 });

const S1 = "Chấm điểm chi tiết", S2 = "Tổng hợp đèn", S3 = "Theo tuyến";
// ExcelJS → HyperFormula (giữ công thức dạng "=..."); useArrayArithmetic để SUMPRODUCT tính mảng như Excel
function toHF(wb) {
  const sheets = {};
  for (const ws of wb.worksheets) {
    const data = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const line = [];
      row.eachCell({ includeEmpty: true }, (c, col) => {
        const v = c.isMerged && c.master !== c ? null : c.value;
        line[col - 1] = v && typeof v === "object" && "formula" in v ? "=" + v.formula : v && typeof v === "object" && v.richText ? v.richText.map((t) => t.text).join("") : v;
      });
      data[r - 1] = Array.from(line, (x) => x ?? null);
    });
    sheets[ws.name] = Array.from(data, (x) => x ?? []);
  }
  return HyperFormula.buildFromSheets(sheets, { licenseKey: "gpl-v3", useArrayArithmetic: true });
}
const val = (hf, sheet, r, c) => hf.getCellValue({ sheet: hf.getSheetId(sheet), row: r - 1, col: c - 1 });
const blank = (x) => x === null || x === "" || x === undefined;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

// dòng sheet 1 của từng phương án đạt (thứ tự giống builder)
function layout(res) {
  const out = []; let r = 5;
  res.forEach((t, ti) => {
    const opts = (t.options || []).filter((o) => o.pass);
    if (t.status !== "ok" || opts.length === 0) { out.push({ ti, row: r++, status: true }); return; }
    const first = r;
    opts.forEach((o) => out.push({ ti, row: r++, o, first, last: first + opts.length - 1 }));
  });
  return out;
}

let wb, hf, lay;
test("dựng workbook 786 tuyến + tính lại bằng HyperFormula", async () => {
  wb = await buildResultWorkbook(ExcelJS, { results, rows, q0: 0.08, MF: 0.8, version: "vT", date: new Date(2026, 9, 9) });
  hf = toHF(wb); lay = layout(results);
  assert.ok(lay.filter((x) => x.o).length > 786, "nhiều tuyến có >1 phương án đạt");
});

test("tiêu chí 3: bật tính lại khi mở file", () => {
  assert.equal(wb.calcProperties.fullCalcOnLoad, true);
});

test("tiêu chí 2: số KQ ghi giá trị gốc (không làm tròn)", () => {
  const ws = wb.getWorksheet(S1);
  for (const x of lay.filter((y) => y.o).slice(0, 200)) {
    assert.equal(ws.getCell(x.row, 23).value, x.o.Ltb); assert.equal(ws.getCell(x.row, 26).value, x.o.TI);
    assert.equal(ws.getCell(x.row, 27).value, x.o.SR);
  }
});

test("tiêu chí 1 — sheet 1: Kết quả/Điểm/Tổng/Hạng/✓ là công thức, tính ra đúng kết quả app; giá trị cache cũng đúng", () => {
  const ws = wb.getWorksheet(S1);
  let ties = 0;
  for (const x of lay.filter((y) => y.o)) {
    const o = x.o;
    for (const c of [29, 30, 31, 32, 33, 34, 35, 36, 37, 38]) assert.ok(ws.getCell(x.row, c).value?.formula, `ô ${x.row},${c} phải là công thức`);
    const exp = ["ĐẠT", o.d_Ltb, o.d_Uo, o.d_Ul, o.d_TI, o.d_SR, o.tong1, o.tong2, o.rank, o.chosen ? "✓" : ""];
    exp.forEach((e, k) => {
      const got = val(hf, S1, x.row, 29 + k);
      assert.equal(got, e, `tuyến ${x.ti + 1} dòng ${x.row} cột ${29 + k}: HF=${got} app=${e}`);
      assert.equal(ws.getCell(x.row, 29 + k).model.result ?? "", e ?? "", `cache dòng ${x.row} cột ${29 + k}`); // .value giấu result=0; file vẫn ghi <v>0</v>
    });
    if (o.tong2 > 0) ties++;
  }
  assert.ok(ties > 0, "dữ liệu có ca đồng Tổng 1 (Tổng 2 > 0)");
});

test("tiêu chí 1 — sheet 3: bộ đèn chọn + chỉ tiêu + Kết quả theo công thức khớp app", () => {
  for (let i = 0; i < results.length; i++) {
    const r = results[i], o = r.chosen, row = 5 + i;
    if (r.status !== "ok") { assert.equal(val(hf, S3, row, 19), r.status); continue; }
    assert.equal(val(hf, S3, row, 9) || "", o ? (o.model || "") : "", `tuyến ${i + 1} bộ đèn`);
    assert.equal(val(hf, S3, row, 19), o ? "ĐẠT" : "KHÔNG ĐẠT");
    if (o) { near(val(hf, S3, row, 11), o.power, "CS"); near(val(hf, S3, row, 13), o.Ltb, "Ltb"); near(val(hf, S3, row, 16), o.TI, "TI"); }
  }
});

test("tiêu chí 1 — sheet 2: Số tuyến/Số bộ/kW/TỔNG CỘNG theo công thức khớp summarizeLuminaires", () => {
  const sum = summarizeLuminaires(results, rows);
  sum.forEach((g, i) => {
    const row = 5 + i;
    assert.equal(val(hf, S2, row, 5), g.routes, `${g.model} số tuyến`);
    near(val(hf, S2, row, 6) || 0, g.lamps, `${g.model} số bộ`);
    near(val(hf, S2, row, 7) || 0, g.kW, `${g.model} kW`);
  });
  const tr = 5 + sum.length;
  assert.equal(val(hf, S2, tr, 2), "TỔNG CỘNG");
  assert.equal(val(hf, S2, tr, 5), sum.reduce((a, g) => a + g.routes, 0));
  near(val(hf, S2, tr, 7), sum.reduce((a, g) => a + g.kW, 0), "tổng kW");
});

test("tiêu chí 4: sửa Ltb của đèn đang ✓ xuống dưới YC → KHÔNG ĐẠT, điểm/hạng/✓/sheet 3/sheet 2 tự đổi đúng như app chấm lại", () => {
  const groups = new Map(); lay.filter((x) => x.o).forEach((x) => { if (!groups.has(x.ti)) groups.set(x.ti, []); groups.get(x.ti).push(x); });
  const [ti, g] = [...groups].find(([, v]) => v.length >= 3);
  const chosen = g.find((x) => x.o.chosen), req = results[ti].req;
  const newLtb = req.Ltb - 0.1;
  const hf2 = toHF(wb);
  hf2.setCellContents({ sheet: hf2.getSheetId(S1), row: chosen.row - 1, col: 22 }, newLtb);
  // app chấm lại sau khi sửa
  const opts = g.map((x) => x === chosen ? { ...x.o, Ltb: newLtb, pass: false } : x.o);
  const re = scoreOptions(opts);
  g.forEach((x, k) => {
    const e = re[k], isC = x === chosen;
    assert.equal(val(hf2, S1, x.row, 29), isC ? "KHÔNG ĐẠT" : "ĐẠT");
    const exp = isC ? ["", "", "", "", "", "", "", "", ""] : [e.d_Ltb, e.d_Uo, e.d_Ul, e.d_TI, e.d_SR, e.tong1, e.tong2, e.rank, e.chosen ? "✓" : ""];
    exp.forEach((v, j) => assert.equal(val(hf2, S1, x.row, 30 + j) ?? "", v, `dòng ${x.row} cột ${30 + j}`));
  });
  const nc = re.find((o) => o.chosen);
  assert.equal(val(hf2, S3, 5 + ti, 9), nc.model, "sheet 3 đổi sang đèn mới");
  near(val(hf2, S3, 5 + ti, 13), nc.Ltb, "sheet 3 Ltb mới");
});

test("tiêu chí 5 + ca biên: tuyến lỗi giữ dòng trạng thái; định dạng hiển thị 0.00 cho KQ; tuyến chỉ 1 phương án đạt", () => {
  const ws = wb.getWorksheet(S1);
  const st = lay.find((x) => x.status && results[x.ti].status !== "ok");
  assert.match(String(ws.getCell(st.row, 29).value), /thiếu/);
  const one = lay.find((x) => x.o && x.first === x.last);
  assert.ok(one, "có tuyến chỉ 1 phương án đạt");
  assert.deepEqual([30, 35, 37, 38].map((c) => val(hf, S1, one.row, c)), [1, 5, 1, "✓"]);
  assert.equal(ws.getCell(one.row, 23).numFmt, "0.00");
  assert.equal(ws.getCell(one.row, 26).numFmt, "0");
});

test("chế độ Từng phương án: cột điểm để trống như app, Kết quả là công thức, Hạng/✓ tĩnh", async () => {
  const shaped = toRankedShape(runBatch(rows.slice(0, 60), idx, { MF: 0.8, q0: 0.08 }), rows.slice(0, 60), idx);
  const wbE = await buildResultWorkbook(ExcelJS, { results: shaped, rows: rows.slice(0, 60) });
  const hfE = toHF(wbE), ws = wbE.getWorksheet(S1);
  const lE = layout(shaped).filter((x) => x.o);
  assert.ok(lE.length > 0);
  for (const x of lE) {
    assert.ok(ws.getCell(x.row, 29).value?.formula);
    assert.equal(val(hfE, S1, x.row, 29), "ĐẠT");
    for (let c = 30; c <= 36; c++) assert.ok(blank(ws.getCell(x.row, c).value), `cột ${c} trống`);
    assert.deepEqual([val(hfE, S1, x.row, 37), val(hfE, S1, x.row, 38)], [1, "✓"]);
    assert.equal(val(hfE, S3, 5 + x.ti, 19), "ĐẠT");
  }
  // sửa Ltb xuống dưới YC → KHÔNG ĐẠT, mất ✓, sheet 3 KHÔNG ĐẠT
  const x = lE[0], hf2 = toHF(wbE);
  hf2.setCellContents({ sheet: hf2.getSheetId(S1), row: x.row - 1, col: 22 }, shaped[x.ti].req.Ltb - 0.1);
  assert.equal(val(hf2, S1, x.row, 29), "KHÔNG ĐẠT");
  assert.equal(val(hf2, S1, x.row, 38) ?? "", "");
  assert.equal(val(hf2, S3, 5 + x.ti, 19), "KHÔNG ĐẠT");
  assert.equal(val(hf2, S3, 5 + x.ti, 9) ?? "", "");
});

test("đồng hạng tuyệt đối (cùng IES nạp 2 tên, cùng CS): chỉ 1 ✓, hạng duy nhất như app", async () => {
  const mag = readIes(join(here, "../data/ies"));
  const dupIdx = buildIesIndex([...mag, ...mag.map((f) => ({ ...f, name: "COPY_" + f.name }))]);
  const res = runBatchRanked(rows.slice(0, 40), dupIdx, { MF: 0.8, q0: 0.08 });
  const wbD = await buildResultWorkbook(ExcelJS, { results: res, rows: rows.slice(0, 40) });
  const hfD = toHF(wbD); let checked = 0;
  for (const x of layout(res).filter((y) => y.o)) {
    assert.equal(val(hfD, S1, x.row, 37), x.o.rank, `dòng ${x.row} hạng`);
    assert.equal(val(hfD, S1, x.row, 38), x.o.chosen ? "✓" : "", `dòng ${x.row} ✓`);
    checked++;
  }
  assert.ok(checked > 40);
  res.forEach((r, i) => { if (r.status === "ok" && r.chosen) assert.equal(val(hfD, S3, 5 + i, 9), r.chosen.model); });
});

test("sheet 2 so khớp đúng ký tự (không coi * ? ~ là ký tự đại diện); CS trống ở sheet 3 không thành 0", async () => {
  const fake = (model, power) => ({ status: "ok", stt: 1, tuyen: "T", roadClass: "D1", input: { spacing: 30, width: 7, H: 8, arrangement: "1 bên" }, meta: {}, req: { Ltb: 0.7, Uo: 0.4, Ul: 0.4, TI: 20, SR: 0.5 },
    options: [{ model, manufac: "ACME", power, iesName: model + ".ies", Ltb: 1, Uo: 0.5, Ul: 0.6, TI: 10, SR: 0.6, En: 15, pass: true, d_Ltb: 1, d_Uo: 1, d_Ul: 1, d_TI: 1, d_SR: 1, tong1: 5, tong2: 0, rank: 1, chosen: true }] });
  const res = [fake("LED*~A", 60), fake("LEDXXA", 60), fake("LED?B", 80)];
  res.forEach((r) => { r.chosen = r.options[0]; });
  const rw = res.map(() => ({ "SL đèn trình Sở (bộ)": 10 }));
  const wbW = await buildResultWorkbook(ExcelJS, { results: res, rows: rw });
  const hfW = toHF(wbW), sum = summarizeLuminaires(res, rw);
  sum.forEach((g, i) => assert.equal(val(hfW, S2, 5 + i, 5), g.routes, `${g.model}: ${val(hfW, S2, 5 + i, 5)} ≠ ${g.routes}`));
  const noP = fake("NOPOWER", null); noP.chosen = noP.options[0]; noP.options[0].rank = 1;
  const wbN = await buildResultWorkbook(ExcelJS, { results: [noP], rows: [{}] });
  assert.equal(val(toHF(wbN), S3, 5, 11) ?? "", "", "CS trống");
});

test("ghi ra .xlsx rồi đọc lại: công thức còn nguyên", async () => {
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook(); await back.xlsx.load(buf);
  const x = lay.find((y) => y.o);
  const c = back.getWorksheet(S1).getCell(x.row, 37).value;
  assert.ok(c && c.formula, "Hạng vẫn là công thức sau khi đọc lại");
  assert.equal(back.getWorksheet(S2).getCell(5, 5).value?.formula?.startsWith("SUMPRODUCT"), true);
});
