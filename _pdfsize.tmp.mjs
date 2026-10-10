import { createCanvas } from "@napi-rs/canvas";
import { readFileSync } from "node:fs";
import { jsPDF } from "jspdf";
const R = "file:///C:/Users/maivu/Documents/GitHub/webdialux-cs/";
globalThis.document = { createElement: () => createCanvas(1, 1) };
const { parseIES, makeIntensity } = await import(R + "src/ies.mjs");
const { calcRoad } = await import(R + "src/engine.mjs");
const { makeDoc, renderRoadPage, finalizeDoc } = await import(R + "src/report.mjs");
const font = (await import(R + "src/font.mjs")).default;
const ph = parseIES(readFileSync("C:/Users/maivu/Documents/GitHub/webdialux-cs/test/fixtures/MAGNOLIA-60W.ies", "utf8"));
const input = { H: 7.5, overhang: 1.0, spacing: 35, width: 7, lanes: 2, tilt: 15, MF: 0.8, roadClass: "D1", detail: true };
const result = calcRoad({ ies: ph, ...input });
for (const N of [1, 10, 100]) {
  const doc = makeDoc({ jsPDF, font });
  for (let i = 0; i < N; i++) { if (i) doc.addPage(); renderRoadPage(doc, { input, result, ph, makeIntensity, meta: { tuyen: "T" + i, model: "MAGNOLIA", power: 60 } }); }
  finalizeDoc(doc);
  const s = doc.output();
  console.log(N, "trang:", (s.length / 1e6).toFixed(1), "MB");
}
