// v3.5 — File mẫu theo cấu trúc cột bảng TỔNG HỢP ĐỀ XUẤT (55 cột gốc + 8 cột bổ sung phía sau),
// đọc lại file đó để chạy (mỗi tuyến nhiều dòng đèn, góc nghiêng riêng), và điền kết quả vào cùng cấu trúc.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { TH_SHEET, TH_HEAD, TH_EXTRA, TH_ALL, TH_FIRST, thCol, buildTongHopWorkbook, addTongHopResultSheet, groupByRoute } from "../src/tonghop.mjs";
import { convertRawSheets } from "../src/rawImport.mjs";
import { COLS } from "../src/mapping.mjs";
import { buildIesIndex, runBatchRanked, runBatch, lampRows } from "../src/batch.mjs";
import { buildResultWorkbook } from "../src/xlsxpro.mjs";

const fx = (n) => ({ name: n, text: readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "latin1") });
const idx = buildIesIndex([fx("CARINA-60W.ies"), fx("MAGNOLIA-60W.ies")]);

const route = (o, lamps) => { const r = { ...o }; Object.defineProperty(r, "__lamps", { value: lamps, enumerable: false }); return r; };
const geo = { [COLS.stt]: 1, [COLS.tuyen]: "Đường số 1", [COLS.H]: 8, [COLS.vuon]: 1, [COLS.width]: 7, [COLS.spacing]: 30, [COLS.setback]: 0.5,
  [COLS.arrangement]: "1 bên", [COLS.dpc]: "không", [COLS.lanes]: 2, [COLS.roadClass]: "D1", [COLS.tilt]: 10, "SL đèn trình Sở (bộ)": 9, "Phường/Xã (mới)": "Bình Đông" };
const R1 = route(geo, [
  { fitting: "1 x MAGNOLIA 60W", model: "MAGNOLIA", ncc: "BELED", power: 60, tilt: 10 },
  { fitting: "1 x CARINA 60W", model: "CARINA", ncc: "Thiên Minh", power: 60, tilt: 15 },
  { fitting: "1 x HELIOS 60W", model: "HELIOS", ncc: "X", power: 60, tilt: 0 },        // không có IES
]);
const R2 = route({ ...geo, [COLS.stt]: 2, [COLS.tuyen]: "Đường số 2", [COLS.spacing]: 28 }, []); // không chỉ định đèn → quét

async function toAoa(wb) {
  const buf = await wb.xlsx.writeBuffer();
  const w = XLSX.read(buf, { type: "buffer" });
  return w.SheetNames.map((n) => ({ name: n, aoa: XLSX.utils.sheet_to_json(w.Sheets[n], { header: 1, defval: null, raw: true }) }));
}

test("cấu trúc cột: 55 cột gốc đúng thứ tự + 8 cột bổ sung phía sau", () => {
  assert.equal(TH_HEAD.length, 55);
  assert.equal(TH_HEAD[0], "Stt"); assert.equal(TH_HEAD[1], "Tuyến Đường"); assert.equal(TH_HEAD[54], "Nhà Cung cấp");
  assert.deepEqual(TH_EXTRA, [COLS.loaituyen, COLS.sidewalk, COLS.medianW, COLS.rot, COLS.perPole, COLS.mf, "CCT (K)", "CRI"]);
  assert.equal(TH_ALL.length, 63);
  assert.equal(thCol(COLS.tuyen), 2); assert.equal(thCol(COLS.H), 15); assert.equal(thCol(COLS.tilt), 18);
  assert.equal(thCol(COLS.fitting), 26); assert.equal(thCol(COLS.power), 29); assert.equal(thCol(COLS.mf), 61);
});

test("Excel mẫu (không dữ liệu): đúng sheet, tiêu đề dòng 3, app đọc lại được", async () => {
  const sample = route({ ...geo }, []);
  const wb = await buildTongHopWorkbook(ExcelJS, { samples: [sample] });
  const ws = wb.getWorksheet(TH_SHEET);
  assert.ok(ws);
  for (let i = 0; i < 63; i++) assert.equal(ws.getCell(3, i + 1).value, TH_ALL[i], `cột ${i + 1}`);
  assert.equal(ws.getCell(4, 42).value, 42);
  assert.match(String(ws.getCell(1, 1).value), /TỔNG HỢP/);
  assert.doesNotMatch(String(ws.getCell(1, 1).value), /dialux/i);
  const out = convertRawSheets(await toAoa(wb), { keepLamps: true });
  assert.equal(out.info.sheet, TH_SHEET); assert.equal(out.info.headerRow, 3);
  assert.equal(out.rows.length, 1);
});

test("ghi file tổng hợp từ dữ liệu → đọc lại giữ nguyên tuyến, bộ đèn, góc nghiêng từng dòng", async () => {
  const wb = await buildTongHopWorkbook(ExcelJS, { rows: [R1, R2] });
  const ws = wb.getWorksheet(TH_SHEET);
  // tuyến 1: 3 dòng đèn; STT + SL chỉ ở dòng đầu; hình học lặp lại
  assert.equal(ws.getCell(TH_FIRST, 1).value, 1);
  assert.equal(ws.getCell(TH_FIRST + 1, 1).value, null);
  assert.equal(ws.getCell(TH_FIRST, 7).value, 9);
  assert.equal(ws.getCell(TH_FIRST + 1, 7).value, null);
  assert.equal(ws.getCell(TH_FIRST + 1, 2).value, "Đường số 1");
  assert.equal(ws.getCell(TH_FIRST + 1, 18).value, 15);
  assert.equal(ws.getCell(TH_FIRST + 2, 27).value, "HELIOS");
  assert.equal(ws.getCell(TH_FIRST + 3, 1).value, 2);
  assert.equal(ws.getCell(TH_FIRST + 3, 27).value, null);
  const out = convertRawSheets(await toAoa(wb), { keepLamps: true });
  assert.equal(out.rows.length, 2);
  assert.deepEqual(out.rows[0].__lamps.map((l) => [l.model, l.power, l.tilt]), [["MAGNOLIA", 60, 10], ["CARINA", 60, 15], ["HELIOS", 60, 0]]);
  assert.equal(out.rows[1].__lamps.length, 0);
  assert.equal(out.rows[0][COLS.width], 7);
  assert.equal(out.rows[0]["Phường/Xã (mới)"], "Bình Đông");
});

test("chạy đa phương án: tính đúng các bộ đèn chỉ định, mỗi bộ dùng góc nghiêng riêng; thiếu IES vẫn có dòng", () => {
  const [r1, r2] = runBatchRanked([R1, R2], idx, { MF: 0.8 });
  assert.equal(r1.status, "ok"); assert.equal(r1.options.length, 3);
  const by = Object.fromEntries(r1.options.map((o) => [o.lampModel, o]));
  assert.equal(by.CARINA.tilt, 15); assert.equal(by.MAGNOLIA.tilt, 10);
  assert.match(by.HELIOS.missing, /thiếu IES/); assert.equal(by.HELIOS.pass, false);
  assert.ok(by.CARINA.Ltb > 0 && by.MAGNOLIA.Ltb > 0);
  // góc nghiêng thực sự đổi kết quả: tính lại CARINA với 10° phải khác
  const alt = runBatchRanked([route(geo, [{ model: "CARINA", power: 60, tilt: 10 }])], idx)[0].options[0];
  assert.notEqual(alt.Ltb, by.CARINA.Ltb);
  // tuyến không chỉ định → quét toàn bộ thư viện
  assert.equal(r2.options.length, idx.length);
});

test("lampRows: tách tuyến thành dòng phẳng mỗi bộ đèn; tuyến không đèn giữ nguyên", () => {
  const f = lampRows(R1);
  assert.equal(f.length, 3); assert.equal(f[1][COLS.model], "CARINA"); assert.equal(f[1][COLS.tilt], 15); assert.equal(f[1][COLS.width], 7);
  assert.deepEqual(lampRows(R2), [R2]);
});

test("file kết quả: sheet tổng hợp đứng đầu, điền QCVN, kết quả, điểm, xếp hạng, đèn được chọn", async () => {
  const res = runBatchRanked([R1, R2], idx, { MF: 0.8 });
  const wb = await buildResultWorkbook(ExcelJS, { results: res, rows: [R1, R2] });
  addTongHopResultSheet(wb, { results: res, rows: [R1, R2] });
  assert.equal(wb.worksheets[0].name, TH_SHEET);
  assert.ok(wb.worksheets.length >= 4, "giữ các sheet kết quả cũ");
  const sheets = await toAoa(wb);
  assert.equal(sheets[0].name, TH_SHEET);
  const a = sheets[0].aoa, row = (i) => a[TH_FIRST - 1 + i];
  assert.deepEqual(a[2].slice(0, 63), TH_ALL);
  const n1 = res[0].options.length;
  // dòng đầu tuyến 1
  const q = res[0].req;
  assert.equal(row(0)[30], q.Ltb); assert.equal(row(0)[31], q.Uo);
  assert.equal(row(0)[29], "D1");
  const ch = res[0].chosen;
  assert.ok(ch, "có bộ đèn đạt");
  {
    assert.equal(row(0)[25], ch.fitting); assert.equal(row(0)[17], ch.tilt);
    assert.equal(row(0)[41], true); assert.match(String(row(0)[49]), /^1- /);
    assert.equal(row(0)[50], `1- ${ch.lampModel}`); assert.equal(row(0)[52], ch.power); assert.equal(row(0)[54], ch.ncc);
    assert.equal(row(0)[35], Math.round(ch.Ltb * 100) / 100);
    assert.equal(typeof row(0)[47], "number");
  }
  assert.equal(row(1)[50], null, "đèn được chọn chỉ ghi ở dòng đầu tuyến");
  assert.equal(row(1)[0], null);
  // dòng thiếu IES: ghi lý do ở cột Kết Quả
  const miss = [...Array(n1).keys()].map(row).find((x) => x[26] === "HELIOS");
  assert.match(String(miss[41]), /thiếu IES/);
  // tuyến 2 bắt đầu sau n1 dòng
  assert.equal(row(n1)[0], 2); assert.equal(row(n1)[1], "Đường số 2");
  // cột bổ sung có tiêu đề
  assert.equal(a[2][55], COLS.loaituyen);
});

test("chế độ từng phương án: gom kết quả từng dòng đèn về theo tuyến và chấm điểm", () => {
  const flat = [];
  [R1, R2].forEach((r, k) => lampRows(r).forEach((x) => flat.push(Object.assign(x, { __route: k }))));
  const res = runBatch(flat, idx, { MF: 0.8 });
  const g = groupByRoute(res, flat, [R1, R2]);
  assert.equal(g.length, 2);
  assert.equal(g[0].options.length, 3);
  assert.ok(g[0].options.find((o) => o.lampModel === "HELIOS").missing);
  const ok = g[0].options.filter((o) => o.pass);
  assert.equal(ok.length, 2); assert.equal(ok[0].rank, 1); assert.ok(g[0].chosen);
  assert.equal(g[1].options.length, 1);
});

test("index.html: mẫu đường dùng cấu trúc tổng hợp, nạp file tổng hợp, xuất thêm sheet tổng hợp", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /buildTongHopWorkbook/);
  assert.match(html, /addTongHopResultSheet/);
  assert.match(html, /keepLamps:\s*true/);
  assert.match(html, /lampRows/);
});

test("Excel mẫu mặc định (2 tuyến mẫu, tuyến B 2 dòng đèn) đọc lại đúng", async () => {
  const out = convertRawSheets(await toAoa(await buildTongHopWorkbook(ExcelJS)), { keepLamps: true });
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].__lamps.length, 0);
  assert.deepEqual(out.rows[1].__lamps.map((l) => [l.model, l.tilt]), [["MAGNOLIA", 5], ["CARINA", 10]]);
});

test("ô hình học gộp theo tuyến: dòng chỉ có bộ đèn vẫn là phương án của tuyến", async () => {
  const wb = await buildTongHopWorkbook(ExcelJS, { rows: [R1] });
  const aoa = (await toAoa(wb))[0].aoa;
  for (const r of [TH_FIRST, TH_FIRST + 1]) for (let c = 1; c < 25; c++) if (c !== 17) aoa[r][c] = null; // xoá như ô gộp (giữ góc nghiêng)
  const out = convertRawSheets([{ name: TH_SHEET, aoa }], { keepLamps: true });
  assert.equal(out.rows.length, 1); assert.equal(out.rows[0].__lamps.length, 3);
});

test("bộ đèn chỉ định không có IES nào khớp → quét toàn bộ thư mục, ghi lý do", () => {
  const r = runBatchRanked([route(geo, [{ model: "Philips BRP", power: 60, tilt: 10 }])], idx)[0];
  assert.equal(r.status, "ok"); assert.equal(r.options.length, idx.length);
  assert.match(r.fallback, /quét toàn bộ/);
});

test("mở lại file kết quả: không cảnh báo đèn được chọn, cấp đường tự xác định không bị ghi cứng", async () => {
  const auto = route({ ...geo, [COLS.roadClass]: null, [COLS.loaituyen]: "Đường khu vực" }, [{ model: "HELIOS", power: 60, tilt: 0 }]);
  const res = runBatchRanked([auto], idx);
  const wb = new ExcelJS.Workbook(); addTongHopResultSheet(wb, { results: res, rows: [auto] });
  const aoa = (await toAoa(wb))[0].aoa;
  assert.equal(aoa[TH_FIRST - 1][29], null);
  assert.ok(aoa[TH_FIRST - 1][30] != null, "vẫn có yêu cầu QCVN");
  const out = convertRawSheets([{ name: TH_SHEET, aoa }], { keepLamps: true });
  assert.ok(!out.warnings.some((w) => /được chọn/.test(w)), out.warnings.join("; "));
});

test("index.html: mở file mới thì xoá kết quả cũ; PDF dùng góc nghiêng của bộ đèn in ra", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /routeRows = null;\s*\/\/ file mới: bỏ kết quả[^\n]*\n\s*if \(results\) \{ results = null; resRows = null;/);
  assert.match(html, /o\.iesName===pk0\.e\.name && o\.tilt!=null/);
});
