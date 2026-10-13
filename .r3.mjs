import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { buildIesIndex } from "./src/batch.mjs";
import { sampleState } from "./src/areaSamples.mjs";
import { calcArch } from "./src/arch.mjs";
import { calcArea } from "./src/area.mjs";
import { drawArea3D } from "./src/areaView3D.mjs";
const idx = buildIesIndex([{ name: "242AEE3-NHB-SL-70W_IESNA2002.IES", text: readFileSync("test/fixtures/SL-70W.ies", "utf8") }, { name: "238AEE3-NHB-SL-90W_IESNA2002.IES", text: readFileSync("test/fixtures/SL-90W.ies", "utf8") }]);
for (const kind of ["mythuat", "congvien", "quangtruong"]) {
  const s = sampleState(kind, idx), result = s.areas.length ? calcArea(s) : null, arch = s.objects.length ? calcArch(s) : null;
  const cv = createCanvas(1400, 760), t = Date.now();
  drawArea3D(cv.getContext("2d"), 1400, 760, { ...s, result, arch }, { px: 1.6, ss: 2 });
  writeFileSync(process.argv[2] + `/r3-${kind}.png`, cv.toBuffer("image/png")); console.log(kind, Date.now() - t, "ms");
}
