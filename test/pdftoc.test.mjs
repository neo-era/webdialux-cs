// Mục lục PDF (mẫu C, chữ kết quả kiểu A) + bookmark + tên bộ đèn thống nhất. Kiểm bằng cách đọc lại PDF bằng pdf.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { jsPDF } from "jspdf";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { parseIES, makeIntensity } from "../src/ies.mjs";
import { calcRoad } from "../src/engine.mjs";
import { makeDoc, renderRoadPage, finalizeDoc, addToc, reportData, TOC_SECTIONS } from "../src/report.mjs";
import { buildPdfParts } from "../src/pdfparts.mjs";
import { luminaireLabel } from "../src/mapping.mjs";
import font from "../src/font.mjs";

globalThis.document ??= { createElement: () => createCanvas(1, 1) };
const here = dirname(fileURLToPath(import.meta.url));
const ph = parseIES(readFileSync(join(here, "fixtures/MAGNOLIA-60W.ies"), "utf8"));
const base = { H: 7.5, overhang: 1.0, spacing: 35, width: 7, lanes: 2, tilt: 15, MF: 0.8, roadClass: "D1", detail: true };
const IESNAME = "242AEE3-NHB-SL-70W_IESNA2002.ies";

// N tuyến, tên duy nhất "Tuyến thử k"; vài tuyến cố ý không đạt (khoảng cột rất lớn)
const jobs = (n) => Array.from({ length: n }, (_, i) => {
  const input = { ...base, spacing: i % 9 === 4 ? 80 : 28 + (i % 10), width: 6 + (i % 4) };
  return { stt: i + 1, tuyen: `Tuyến thử ${i + 1}`, input, result: calcRoad({ ies: ph, ...input }) };
});
const meta = (j) => ({ tuyen: j.tuyen, model: "NHB", power: 70, iesName: IESNAME });

// dựng PDF qua buildPdfParts như index.html: render → entry; finalize = addToc + finalizeDoc
async function build(list, perFile = 300) {
  const files = [];
  await buildPdfParts({
    items: list, perFile, prepare: (j) => j,
    makeDoc: () => makeDoc({ jsPDF, font }),
    render: (doc, j) => {
      const r = renderRoadPage(doc, { input: j.input, result: j.result, ph, makeIntensity, meta: meta(j) });
      return { stt: j.stt, tuyen: j.tuyen, roadClass: j.result.roadClass, lamp: luminaireLabel(IESNAME), power: 70, pass: j.result.pass, ...r };
    },
    finalize: (doc, info) => { addToc(doc, info.entries, info); finalizeDoc(doc); },
    emit: (doc, info) => { files.push({ info, buf: new Uint8Array(doc.output("arraybuffer")) }); },
  });
  return files;
}
async function open(buf) {
  const pdf = await getDocument({ data: buf, verbosity: 0 }).promise;
  const text = [];
  for (let i = 1; i <= pdf.numPages; i++) text.push((await (await pdf.getPage(i)).getTextContent()).items.map((x) => x.str).join(" "));
  const pageOf = async (dest) => (await pdf.getPageIndex((Array.isArray(dest) ? dest : await pdf.getDestination(dest))[0])) + 1;
  return { pdf, text, pageOf };
}

test("luminaireLabel: bỏ .ies và _IESNA2002, giữ nguyên phần còn lại", () => {
  assert.equal(luminaireLabel("242AEE3-NHB-SL-70W_IESNA2002.ies"), "242AEE3-NHB-SL-70W");
  assert.equal(luminaireLabel("242AEE3-NHB-SL-70W_IESNA2002.IES"), "242AEE3-NHB-SL-70W");
  assert.equal(luminaireLabel("MAGNOLIA-BL-STR16A-PD36-60W.ies"), "MAGNOLIA-BL-STR16A-PD36-60W");
  assert.equal(luminaireLabel("Đèn LED 60W bản 2.ies"), "Đèn LED 60W bản 2");
  assert.equal(luminaireLabel(null), ""); assert.equal(luminaireLabel(""), "");
});

test("PDF 'Thông số bộ đèn': Tên bộ đèn = tên file IES; [LUMINAIRE] chuyển xuống 'Mô tả trong IES'; có dòng File IES", async () => {
  const d = reportData(base, calcRoad({ ies: ph, ...base }), ph, { iesName: IESNAME });
  assert.equal(d.luminaire.articleName, "242AEE3-NHB-SL-70W");
  assert.equal(d.luminaire.iesDesc, "LED STREET LIGHT 60W");
  assert.equal(d.luminaire.iesFile, IESNAME);
  const [f] = await build(jobs(1));
  const { text } = await open(f.buf);
  const all = text.join("\n");
  assert.match(all, /Tên bộ đèn\s+242AEE3-NHB-SL-70W(?!_)/);
  assert.match(all, /Mô tả trong IES\s+LED STREET LIGHT 60W/);
  assert.match(all, /File IES\s+242AEE3-NHB-SL-70W_IESNA2002\.ies/);
  const noDesc = reportData(base, calcRoad({ ies: ph, ...base }), { ...ph, luminaireName: null }, { iesName: IESNAME });
  assert.equal(noDesc.luminaire.iesDesc, "");
});

test("renderRoadPage trả trang bắt đầu + trang từng phần (đủ 7 phần, tăng dần)", () => {
  const doc = makeDoc({ jsPDF, font }); const j = jobs(1)[0];
  const r = renderRoadPage(doc, { input: j.input, result: j.result, ph, makeIntensity, meta: meta(j) });
  assert.equal(r.firstPage, 1);
  assert.deepEqual(r.sections.map((s) => s.title), TOC_SECTIONS);
  for (let k = 1; k < r.sections.length; k++) assert.ok(r.sections[k].page >= r.sections[k - 1].page);
  assert.equal(r.sections.at(-1).page <= doc.getNumberOfPages(), true);
});

test("45 tuyến: mục lục ở đầu, link mỗi dòng nhảy đúng trang bắt đầu tuyến, bookmark tuyến + 7 phần, Trang i/N tính cả mục lục", { timeout: 120000 }, async () => {
  const list = jobs(45);
  const [f] = await build(list);
  const { pdf, text, pageOf } = await open(f.buf);
  const N = pdf.numPages;
  assert.match(text[0], /Mục lục & tổng quan/);
  assert.match(text[0], /45\s+tuyến trong file/);
  const nPass = list.filter((j) => j.result.pass).length;
  assert.ok(nPass < 45 && nPass > 0, "dữ liệu có cả đạt và không đạt");
  assert.match(text[0], new RegExp(`${nPass}\\s+ĐẠT`)); assert.match(text[0], new RegExp(`${45 - nPass}\\s+KHÔNG ĐẠT`));
  const K = text.findIndex((t) => /Tuyến thử 1\b/.test(t) && !/Mục lục/.test(t)); // trang đầu tiên của tuyến 1 (0-based) = số trang mục lục
  assert.ok(K >= 2, `mục lục ${K} trang (45 tuyến không vừa 1 trang)`);
  for (let i = 0; i < K; i++) assert.match(text[i], /Mục lục/);
  // link
  const links = [];
  for (let i = 1; i <= K; i++) for (const a of await (await pdf.getPage(i)).getAnnotations()) if (a.subtype === "Link" && a.dest) links.push(await pageOf(a.dest));
  assert.equal(links.length, 45, "mỗi dòng một link");
  for (let k = 0; k < 45; k++) {
    const p = links[k], name = new RegExp(`Tuyến thử ${k + 1}(?!\\d)`);
    assert.match(text[p - 1], name, `link tuyến ${k + 1} → trang ${p}`);
    assert.ok(p - 1 === K || !name.test(text[p - 2]) || /Mục lục/.test(text[p - 2]), `trang ${p} là trang ĐẦU của tuyến ${k + 1}`);
    assert.match(text.slice(0, K).join(" "), new RegExp(`Tuyến thử ${k + 1}(?!\\d)`), "dòng có trong mục lục");
  }
  // bookmark
  const ol = await pdf.getOutline();
  const routes = ol.filter((o) => /^\d+\. Tuyến thử/.test(o.title));
  assert.equal(routes.length, 45);
  for (let k = 0; k < 45; k++) {
    assert.equal(await pageOf(routes[k].dest), links[k]);
    assert.deepEqual(routes[k].items.map((x) => x.title), TOC_SECTIONS);
    const next = k < 44 ? links[k + 1] : N + 1;
    for (const s of routes[k].items) { const p = await pageOf(s.dest); assert.ok(p >= links[k] && p < next, `phần "${s.title}" tuyến ${k + 1} ở trang ${p}`); }
    // tiêu đề "Độ rọi ngang" không bị bỏ trơ cuối trang: trang bookmark có luôn bảng Eav cạnh ảnh
    const pE = await pageOf(routes[k].items.find((x) => x.title === "Độ rọi ngang").dest);
    assert.match(text[pE - 1], /Độ rọi ngang \(maintenance\)[\s\S]*Eav/, `tuyến ${k + 1}: tiêu đề Độ rọi ngang và ảnh cùng trang ${pE}`);
  }
  assert.match(text[0], new RegExp(`Trang 1/${N}\\b`)); assert.match(text[N - 1], new RegExp(`Trang ${N}/${N}\\b`));
});

test("chia nhiều file: mỗi file có mục lục riêng 'phần k/n (tuyến a–b / tổng)' chỉ gồm tuyến của file đó", { timeout: 120000 }, async () => {
  const files = await build(jobs(25), 10);
  assert.equal(files.length, 3);
  const ranges = [[1, 10], [11, 20], [21, 25]];
  for (let k = 0; k < 3; k++) {
    const { text, pdf } = await open(files[k].buf);
    const [a, b] = ranges[k];
    assert.match(text[0], new RegExp(`phần ${k + 1}/3 \\(tuyến ${a}–${b} / 25\\)`));
    const toc = text.filter((t) => /Mục lục/.test(t)).join(" ");
    for (let s = 1; s <= 25; s++) assert.equal(new RegExp(`Tuyến thử ${s}(?!\\d)`).test(toc), s >= a && s <= b, `tuyến ${s} trong mục lục file ${k + 1}`);
    assert.equal((await pdf.getOutline()).filter((o) => /^\d+\. /.test(o.title)).length, b - a + 1);
  }
});

test("PDF 1 tuyến: không có trang mục lục, vẫn có bookmark các phần", async () => {
  const [f] = await build(jobs(1));
  const { text, pdf } = await open(f.buf);
  assert.ok(!text.some((t) => /Mục lục/.test(t)));
  const ol = await pdf.getOutline();
  assert.equal(ol.length, 1); assert.deepEqual(ol[0].items.map((x) => x.title), TOC_SECTIONS);
});

test("tên tuyến rất dài vẫn nằm gọn trong ô (thu chữ/cắt …), không tràn sang cột khác", async () => {
  const list = jobs(2); list[0].tuyen = "Đường nội bộ khu dân cư Bình Hưng Hoà mở rộng giai đoạn 2 đoạn từ Tỉnh lộ 10 đến kênh Tham Lương";
  const [f] = await build(list);
  const { pdf } = await open(f.buf);
  const items = (await (await pdf.getPage(1)).getTextContent()).items;
  const longItem = items.find((x) => x.str.startsWith("Đường nội bộ"));
  assert.ok(longItem, "có dòng tên dài");
  const cs = items.find((x) => x.str === "Cấp"); // tiêu đề cột kế bên
  assert.ok(longItem.transform[4] + longItem.width <= cs.transform[4] - 1, "không tràn sang cột Cấp");
});
