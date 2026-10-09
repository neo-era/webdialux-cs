import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { jsPDF } from "jspdf";
import { createCanvas } from "@napi-rs/canvas";
import { buildPdfParts, partSubject, PDF_PER_FILE } from "../src/pdfparts.mjs";
import { parseIES, makeIntensity } from "../src/ies.mjs";
import { calcRoad } from "../src/engine.mjs";
import { makeDoc, renderRoadPage, finalizeDoc } from "../src/report.mjs";
import font from "../src/font.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// doc giả: ghi nhãn từng tuyến đã render
function fakeDoc() { return { pages: [], addPage() {}, finalized: false }; }
async function runFake(items, opts = {}) {
  const files = [];
  const r = await buildPdfParts({
    items,
    prepare: (it) => (it.skip ? null : it),
    makeDoc: fakeDoc,
    render: (doc, it) => doc.pages.push(it.name),
    finalize: (doc) => { doc.finalized = true; },
    emit: (doc, info) => { files.push({ ...info, pages: doc.pages.slice(), finalized: doc.finalized }); },
    ...opts,
  });
  return { r, files };
}
const mk = (n) => Array.from({ length: n }, (_, i) => ({ name: "T" + (i + 1) }));

test("mặc định 50 tuyến/file", () => assert.equal(PDF_PER_FILE, 50));

test("786 tuyến → 16 file: 15×50 + 36, tổng 786, mỗi file đã finalize", async () => {
  const { r, files } = await runFake(mk(786));
  assert.equal(files.length, 16);
  assert.deepEqual(files.map((f) => f.pages.length), [...Array(15).fill(50), 36]);
  assert.equal(r.made, 786); assert.equal(r.parts, 16);
  assert.ok(files.every((f) => f.finalized));
  assert.deepEqual(files.map((f) => f.part), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.ok(files.every((f) => f.nParts === 16));
  assert.deepEqual(files.flatMap((f) => f.pages), mk(786).map((x) => x.name)); // đúng thứ tự, không mất/trùng
});

test("50 → 1 file; 51 → 2 file (50+1); 1 → 1 file", async () => {
  assert.deepEqual((await runFake(mk(50))).files.map((f) => f.pages.length), [50]);
  assert.deepEqual((await runFake(mk(51))).files.map((f) => f.pages.length), [50, 1]);
  assert.deepEqual((await runFake(mk(1))).files.map((f) => f.pages.length), [1]);
});

test("tuyến bị bỏ qua (prepare → null) không tạo trang, không lệch lô", async () => {
  const items = mk(60).map((x, i) => (i % 2 ? { ...x, skip: true } : x)); // 30 tuyến hợp lệ
  const { r, files } = await runFake(items);
  assert.equal(r.made, 30);
  assert.deepEqual(files.map((f) => f.pages.length), [30]);
  assert.ok(!files[0].pages.includes("T2"));
});

test("bỏ qua tuyến không làm sai số file trong tên: 52 tuyến, 2 lỗi → 1 file, nParts=1, total=50", async () => {
  const items = mk(52).map((x, i) => (i < 2 ? { ...x, skip: true } : x));
  const { r, files } = await runFake(items);
  assert.equal(files.length, 1);
  assert.equal(files[0].nParts, 1); assert.equal(files[0].total, 50); assert.equal(r.made, 50);
  const { files: f2 } = await runFake(mk(102).map((x, i) => (i === 0 ? { ...x, skip: true } : x)));
  assert.deepEqual(f2.map((f) => [f.part, f.nParts, f.total, f.pages.length]), [[1, 3, 101, 50], [2, 3, 101, 50], [3, 3, 101, 1]]);
});

test("onPrepare báo tiến độ bước tính (n, tổng)", async () => {
  const seen = [];
  await runFake(mk(3), { onPrepare: (n, total) => { seen.push([n, total]); } });
  assert.deepEqual(seen, [[1, 3], [2, 3], [3, 3]]);
});

test("0 tuyến / tất cả bị bỏ → không emit file nào, made=0", async () => {
  assert.deepEqual((await runFake([])).files, []);
  const { r, files } = await runFake(mk(5).map((x) => ({ ...x, skip: true })));
  assert.equal(files.length, 0); assert.equal(r.made, 0); assert.equal(r.parts, 0);
});

test("emit xong mới sang file kế (tuần tự), onProgress nhận số tuyến đã làm", async () => {
  const log = [], prog = [];
  await runFake(mk(120), {
    emit: async (doc, info) => { log.push("start" + info.part); await new Promise((r) => setTimeout(r, 5)); log.push("end" + info.part); },
    onProgress: (n) => { prog.push(n); },
  });
  assert.deepEqual(log, ["start1", "end1", "start2", "end2", "start3", "end3"]);
  assert.equal(prog.length, 120); assert.equal(prog.at(-1), 120);
});

test("partSubject: 1 tuyến → tên tuyến; 1 file → N_tuyen; nhiều file → N_tuyen_phank-n", () => {
  assert.equal(partSubject({ part: 1, nParts: 1, routes: 1, total: 1, firstName: "Cầu Bình Triệu 2" }), "Cầu Bình Triệu 2");
  assert.equal(partSubject({ part: 1, nParts: 1, routes: 1, total: 1, firstName: "" }), "tuyen");
  assert.equal(partSubject({ part: 1, nParts: 1, routes: 37, total: 40 }), "37_tuyen");
  assert.equal(partSubject({ part: 3, nParts: 16, routes: 50, total: 786 }), "786_tuyen_phan3-16");
});

test("jsPDF thật: mỗi file có đúng số trang của lô (finalizeDoc đánh 'Trang i/N' theo đó)", async () => {
  const pages = [];
  await buildPdfParts({
    items: mk(7), perFile: 3,
    prepare: (it) => it,
    makeDoc: () => makeDoc({ jsPDF, font }),
    render: (doc, it) => doc.text(it.name, 20, 20),
    finalize: finalizeDoc,
    emit: (doc) => { pages.push(doc.getNumberOfPages()); },
  });
  assert.deepEqual(pages, [3, 3, 1]);
});

test("báo cáo thật: 1 file 50 tuyến (~3 trang/tuyến, hình học khác nhau) < 20 MB (ảnh nén FAST)", { timeout: 120000 }, async () => {
  globalThis.document ??= { createElement: () => createCanvas(1, 1) };
  const ph = parseIES(readFileSync(join(here, "fixtures/MAGNOLIA-60W.ies"), "utf8"));
  const base = { H: 7.5, overhang: 1.0, spacing: 35, width: 7, lanes: 2, tilt: 15, MF: 0.8, roadClass: "D1", detail: true };
  const sizes = [];
  await buildPdfParts({
    items: Array.from({ length: 50 }, (_, i) => ({ ...base, spacing: 25 + (i % 20), width: 6 + (i % 5) })),
    prepare: (input) => ({ input, result: calcRoad({ ies: ph, ...input }) }),
    makeDoc: () => makeDoc({ jsPDF, font }),
    render: (doc, { input, result }) => renderRoadPage(doc, { input, result, ph, makeIntensity, meta: { tuyen: "T", model: "MAGNOLIA", power: 60 } }),
    finalize: finalizeDoc,
    emit: (doc, info) => { sizes.push({ routes: info.routes, pages: doc.getNumberOfPages(), mb: doc.output().length / 1e6 }); },
  });
  assert.equal(sizes.length, 1); assert.equal(sizes[0].routes, 50); assert.ok(sizes[0].pages >= 50);
  console.log(`50 tuyến: ${sizes[0].pages} trang, ${sizes[0].mb.toFixed(1)} MB`);
  assert.ok(sizes[0].mb < 20, `${sizes[0].mb.toFixed(1)} MB`);
});
