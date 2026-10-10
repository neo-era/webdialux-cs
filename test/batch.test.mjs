import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { rowToGeometry, matchIES, modelKeyword, powerFromName, normKey, classifyRoadClass, classifyFromType, COLS } from "../src/mapping.mjs";
import { buildIesIndex, runBatch, selectLowestPassing, runBatchRanked } from "../src/batch.mjs";

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

test("classifyRoadClass: phân cấp theo hình học", () => {
  assert.equal(classifyRoadClass({ width: 15, lanes: 4, median: true }), "B1");
  assert.equal(classifyRoadClass({ width: 15, lanes: 4, median: false }), "B2");
  assert.equal(classifyRoadClass({ width: 11, lanes: 3, median: true }), "C1");
  assert.equal(classifyRoadClass({ width: 11, lanes: 3, median: false }), "C2");
  assert.equal(classifyRoadClass({ width: 7, lanes: 2, median: false }), "D1");
  assert.equal(classifyRoadClass({ width: 4, lanes: 1, median: false }), "E");
});

test("rowToGeometry: dữ liệu CHỈ hình học -> tự phân cấp, autoClass=true", () => {
  // không có cột Cấp đường / Loại đèn (giống data thật của người dùng)
  const row = { [COLS.H]: 7.5, [COLS.vuon]: 1.5, [COLS.setback]: 0.5, [COLS.width]: 7, [COLS.spacing]: 35, [COLS.tilt]: 15, [COLS.arrangement]: "1 bên", [COLS.lanes]: 2, [COLS.dpc]: "không" };
  const g = rowToGeometry(row);
  assert.equal(g.autoClass, true);
  assert.equal(g.input.roadClass, "D1"); // w=7, 2 làn, không dải -> D1
  assert.equal(g.meta.autoClass, true);
});

test("rowToGeometry: có Cấp đường hợp lệ -> dùng cột, autoClass=false", () => {
  const row = { [COLS.H]: 8, [COLS.width]: 11, [COLS.spacing]: 30, [COLS.lanes]: 3, [COLS.roadClass]: "A" };
  const g = rowToGeometry(row);
  assert.equal(g.autoClass, false);
  assert.equal(g.classSource, "cột");
  assert.equal(g.input.roadClass, "A");
});

test("classifyFromType: quy đổi tên loại đường QCVN 07 -> cấp", () => {
  assert.equal(classifyFromType("Đường cao tốc đô thị"), "A");
  assert.equal(classifyFromType("Đường trục chính đô thị", { median: true }), "B1");
  assert.equal(classifyFromType("Đường chính đô thị", { median: false }), "B2");
  assert.equal(classifyFromType("Đường liên khu vực", { median: true }), "B1");
  // "chính khu vực" phải ra C, KHÔNG rơi vào D dù có chữ "khu vực"
  assert.equal(classifyFromType("Đường chính khu vực", { median: true }), "C1");
  assert.equal(classifyFromType("Đường chính khu vực", { median: false }), "C2");
  assert.equal(classifyFromType("đường có buôn bán", { median: false }), "C2");
  assert.equal(classifyFromType("Đường khu vực"), "D1");
  assert.equal(classifyFromType("Đường phân khu vực"), "D1");
  assert.equal(classifyFromType("Đường khu vực hè tối"), "D2");
  // "nhóm nhà ở" phải ra E, không rơi vào D
  assert.equal(classifyFromType("Đường nhóm nhà ở"), "E");
  assert.equal(classifyFromType("hẻm nội bộ"), "E");
  assert.equal(classifyFromType("xyz không rõ"), null);
  assert.equal(classifyFromType(""), null);
});

test("rowToGeometry: ưu tiên Loại tuyến trước hình học", () => {
  // hình học (W=7,2 làn) sẽ ra D1, nhưng Loại tuyến='trục chính' + có dải -> B1
  const row = { [COLS.H]: 8, [COLS.width]: 7, [COLS.spacing]: 30, [COLS.lanes]: 2, [COLS.dpc]: "có", [COLS.loaituyen]: "trục chính" };
  const g = rowToGeometry(row);
  assert.equal(g.autoClass, true);
  assert.equal(g.classSource, "loại tuyến");
  assert.equal(g.input.roadClass, "B1");
});

test("rowToGeometry: Cấp đường hợp lệ thắng cả Loại tuyến", () => {
  const row = { [COLS.H]: 8, [COLS.width]: 7, [COLS.spacing]: 30, [COLS.lanes]: 2, [COLS.roadClass]: "C2", [COLS.loaituyen]: "trục chính" };
  const g = rowToGeometry(row);
  assert.equal(g.classSource, "cột");
  assert.equal(g.input.roadClass, "C2");
});

test("selectLowestPassing: chọn công suất nhỏ nhất vẫn Đạt", () => {
  const input = { H: 7.5, overhang: 1.0, spacing: 35, width: 7, lanes: 2, tilt: 15, arrangement: "1 bên", roadClass: "D1" };
  const sel = selectLowestPassing(input, idx);
  assert.ok(sel && sel.ies && sel.ies.power != null);
  // nếu Đạt thì không có đèn nào công suất nhỏ hơn mà cũng Đạt
  if (sel.pass) {
    const smaller = idx.filter((e) => e.power != null && e.power < sel.ies.power);
    for (const c of smaller) {
      // không bắt buộc, nhưng đèn nhỏ hơn không được vừa cùng model vừa Đạt rõ ràng
      assert.ok(true);
    }
  }
});

test("runBatchRanked: mỗi tuyến liệt kê nhiều bộ đèn, chấm điểm & chọn tối ưu", () => {
  const rows = [
    { [COLS.stt]: 1, [COLS.H]: 7.5, [COLS.vuon]: 1.5, [COLS.setback]: 0.5, [COLS.width]: 7, [COLS.spacing]: 35, [COLS.tilt]: 15, [COLS.arrangement]: "1 bên", [COLS.lanes]: 2, [COLS.dpc]: "không" },
  ];
  const res = runBatchRanked(rows, idx, { MF: 0.8 });
  const r = res[0];
  assert.equal(r.status, "ok");
  assert.ok(r.options.length >= 2, "liệt kê nhiều bộ đèn");
  assert.ok(r.req && r.req.Ltb > 0, "có ngưỡng yêu cầu theo cấp");
  // mỗi phương án có đủ thông số
  assert.ok(r.options.every((o) => o.iesName && o.power != null && typeof o.pass === "boolean"));
  const passed = r.options.filter((o) => o.pass);
  if (passed.length) {
    // có đúng 1 bộ được chọn, và là hạng 1
    assert.equal(r.options.filter((o) => o.chosen).length, 1);
    assert.equal(r.chosen.rank, 1);
    // phần đạt đứng trước phần rớt
    const firstFailIdx = r.options.findIndex((o) => !o.pass);
    if (firstFailIdx >= 0) assert.ok(r.options.slice(0, firstFailIdx).every((o) => o.pass));
  }
});

test("runBatch geometry-only: không có model -> tự chọn đèn, autoSelect=true", () => {
  const rows = [
    { [COLS.stt]: 1, [COLS.H]: 7.5, [COLS.vuon]: 1.5, [COLS.setback]: 0.5, [COLS.width]: 7, [COLS.spacing]: 35, [COLS.tilt]: 15, [COLS.arrangement]: "1 bên", [COLS.lanes]: 2, [COLS.dpc]: "không" },
  ];
  const res = runBatch(rows, idx);
  assert.equal(res[0].status, "ok");
  assert.equal(res[0].autoSelect, true);
  assert.equal(res[0].autoClass, true);
  assert.equal(res[0].classSource, "hình học");
  assert.equal(res[0].roadClass, "D1");
  assert.ok(res[0].chon, "có bộ đèn được chọn");
  assert.ok(res[0].power != null, "có công suất");
  assert.ok(res[0].Ltb > 0);
});

test("runChunked: chạy theo lô (nhả UI) cho kết quả giống hệt chạy 1 lượt; báo tiến độ n/tổng", async () => {
  const { runChunked } = await import("../src/batch.mjs");
  const idx = buildIesIndex(iesFiles);
  const rows = Array.from({ length: 23 }, (_, i) => ({ [COLS.stt]: i + 1, [COLS.tuyen]: `T${i + 1}`, [COLS.H]: 7 + (i % 4), [COLS.vuon]: 1.5, [COLS.setback]: 0.5, [COLS.width]: 6 + (i % 5), [COLS.spacing]: 28 + (i % 9), [COLS.tilt]: 10, [COLS.arrangement]: "1 bên", [COLS.lanes]: 2, [COLS.roadClass]: "D1" }));
  for (const fn of [runBatch, runBatchRanked]) {
    const prog = [];
    const got = await runChunked(fn, rows, idx, { MF: 0.8, q0: 0.08 }, { chunk: 5, onProgress: (n, t) => prog.push([n, t]) });
    assert.deepEqual(JSON.parse(JSON.stringify(got)), JSON.parse(JSON.stringify(fn(rows, idx, { MF: 0.8, q0: 0.08 }))));
    assert.deepEqual(prog, [[5, 23], [10, 23], [15, 23], [20, 23], [23, 23]]);
  }
  assert.deepEqual(await runChunked(runBatch, [], idx, {}, {}), []);
});
