// v2.9 — chiếu sáng mỹ thuật: tòa nhà, tường rào, cây xanh — độ rọi trên mặt đứng theo pháp tuyến, che khuất, độ chói L = ρE/π.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { parseIES } from "../src/ies.mjs";
import { buildIesIndex } from "../src/batch.mjs";
import { calcArea } from "../src/area.mjs";
import { OBJ_COLS, OBJ_HEAD, MATERIALS, ARCH_REQS, archSurfaces, calcArch, parseObjRows, segmentBlocked, objectsSheetRows } from "../src/arch.mjs";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const here = dirname(fileURLToPath(import.meta.url));
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// Nguồn sáng "đẳng hướng" 1000 cd mọi hướng (IES loại C, γ 0–180°) để đối chiếu tính tay
const ISO_TXT = ["IESNA:LM-63-2002", "[TEST] ISO", "[MANUFAC] TEST", "TILT=NONE", "1 12566 1 3 1 1 2 0 0 0", "1 1 100", "0 90 180", "0", "1000 1000 1000"].join("\n");
const ISO = { name: "ISO.ies", ph: parseIES(ISO_TXT), power: 100 };
const lampAt = (x, y, H, aim = 0, tilt = 90) => ({ id: "L", x, y, H, lamps: [{ aim, tilt, arm: 0, H: null, ies: ISO, iesWant: "ISO" }] });
const wall = (id, pts, H = 4, extra = {}) => ({ id, type: "wall", pts, H, rho: 0.5, ...extra });
const bld = (id, pts, H = 10, extra = {}) => ({ id, type: "building", pts, H, rho: 0.5, ...extra });

test("Bảng vật liệu & yêu cầu: ρ trong 0–1; giới hạn độ chói mặt nhà E2 5 / E3 10 / E4 25 cd/m² (ILP GN01:2011 theo CIE 150)", () => {
  for (const m of MATERIALS) assert.ok(m.rho > 0 && m.rho < 1, m.name);
  const L = Object.fromEntries(ARCH_REQS.map((r) => [r.zone, r.Lmax]));
  assert.deepEqual([L.E2, L.E3, L.E4], [5, 10, 25]);
});

test("Mặt đứng: tòa nhà 4 cạnh → 4 mặt, pháp tuyến hướng RA NGOÀI dù đa giác nhập theo chiều nào", () => {
  for (const pts of [[[0, 0], [10, 0], [10, 6], [0, 6]], [[0, 0], [0, 6], [10, 6], [10, 0]]]) {
    const S = archSurfaces([bld("B", pts)]);
    assert.equal(S.length, 4);
    for (const s of S) {                                         // điểm giữa mặt + pháp tuyến phải nằm ngoài nhà
      const m = s.points[Math.floor(s.points.length / 2)];
      const ox = m.x + s.n[0] * 0.5, oy = m.y + s.n[1] * 0.5;
      assert.ok(ox < 0 || ox > 10 || oy < 0 || oy > 6, `${s.name}: ${ox},${oy}`);
      assert.ok(Math.abs(s.n[2]) < 1e-12);
    }
  }
});

test("Tường rào: mỗi đoạn có 2 mặt (2 phía); cây: mặt tán là cầu, pháp tuyến hướng ra", () => {
  const S = archSurfaces([wall("W", [[0, 0], [10, 0], [10, 8]])]);
  assert.equal(S.length, 4);
  const T = archSurfaces([{ id: "C", type: "tree", pts: [[5, 5]], H: 8, crownR: 3, rho: 0.15 }]);
  assert.equal(T.length, 1);
  for (const p of T[0].points.slice(0, 50)) {
    const v = [p.x - 5, p.y - 5, p.z - 5], d = Math.hypot(...v);
    assert.ok(Math.abs(d - 3) < 1e-6, "điểm nằm trên mặt cầu tán (tâm cao H − R)");
    assert.ok(Math.abs(p.n[0] * v[0] + p.n[1] * v[1] + p.n[2] * v[2] - 3) < 1e-6, "pháp tuyến = hướng ra");
  }
});

test("Độ rọi mặt đứng khớp tính tay: nguồn 1000 cd cách tường 5 m, chiếu thẳng → E = I/d² = 40 lx (MF 1)", () => {
  const S = archSurfaces([wall("W", [[-20, 5], [20, 5]], 10, { step: 0.5 })]);
  const r = calcArch({ poles: [lampAt(0, 0, 2)], objects: [wall("W", [[-20, 5], [20, 5]], 10, { step: 0.5 })] }, { MF: 1 });
  const face = r.surfaces.find((s) => s.n[1] < 0);              // mặt quay về phía đèn
  const back = r.surfaces.find((s) => s.n[1] > 0);
  let best = null;
  face.points.forEach((p, i) => { const d2 = (p.x) ** 2 + (p.z - 2) ** 2; if (!best || d2 < best.d2) best = { d2, i }; });
  const p = face.points[best.i], d = Math.hypot(p.x, 5, p.z - 2), cos = 5 / d;
  assert.ok(rel(face.E[best.i], 1000 * cos / (d * d)) < 1e-9, `${face.E[best.i]} vs ${1000 * cos / d / d}`);
  assert.ok(Math.abs(face.E[best.i] - 40) < 0.5);
  assert.equal(Math.max(...back.E), 0, "mặt sau không nhận sáng (tường đặc)");
  assert.ok(S.length === 2);
});

test("Che khuất: tòa nhà giữa đèn và tường làm tường tối; bỏ tòa nhà thì sáng lại", () => {
  const W = wall("W", [[-5, 10], [5, 10]], 3, { step: 0.5 }), B = bld("B", [[-3, 4], [3, 4], [3, 6], [-3, 6]], 8);
  const lit = calcArch({ poles: [lampAt(0, 0, 1.5)], objects: [W] }, { MF: 1 });
  const dark = calcArch({ poles: [lampAt(0, 0, 1.5)], objects: [W, B] }, { MF: 1 });
  const f = (r) => r.surfaces.find((s) => s.objId === "W" && s.n[1] < 0);
  assert.ok(f(lit).Eav > 5);
  assert.ok(f(dark).Emax < 1e-9, `vẫn sáng ${f(dark).Emax}`);
  assert.equal(segmentBlocked({ x: 0, y: 0, z: 1.5 }, { x: 0, y: 10, z: 1.5 }, [B]), true);
  assert.equal(segmentBlocked({ x: 0, y: 0, z: 12 }, { x: 0, y: 10, z: 12 }, [B]), false, "đi trên mái nhà thì không chắn");
});

test("Đèn hắt âm đất (cao 0, nghiêng 180° = chiếu thẳng lên) dưới tán cây: mặt dưới tán sáng hơn mặt trên", () => {
  const T = { id: "C", type: "tree", pts: [[0, 0]], H: 8, crownR: 3, rho: 0.15 };
  const r = calcArch({ poles: [{ id: "U", x: 0, y: 1, H: 0, lamps: [{ aim: 0, tilt: 180, arm: 0, H: null, ies: ISO }] }], objects: [T] }, { MF: 1 });
  const s = r.surfaces[0];
  const lo = s.points.map((p, i) => [p.z, s.E[i]]).filter(([z]) => z < 4).map(([, e]) => e);
  const hi = s.points.map((p, i) => [p.z, s.E[i]]).filter(([z]) => z > 6).map(([, e]) => e);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(lo) > avg(hi) * 3, `${avg(lo)} vs ${avg(hi)}`);
});

test("Độ chói L = ρ·E/π và đánh giá theo vùng môi trường: Eav ≥ mức tối thiểu, L ≤ giới hạn", () => {
  const obj = wall("W", [[-5, 5], [5, 5]], 4, { rho: 0.6, zone: "E3", step: 0.5 });
  const r = calcArch({ poles: [lampAt(0, 0, 2)], objects: [obj] }, { MF: 1 });
  const f = r.surfaces.find((s) => s.n[1] < 0);
  assert.ok(rel(f.Lav, 0.6 * f.Eav / Math.PI) < 1e-12);
  assert.equal(f.req.Lmax, 10);
  assert.equal(f.okL, f.Lav <= 10 + 1e-9);
  const hot = calcArch({ poles: [lampAt(0, 0, 2)], objects: [{ ...obj, zone: "E2", reqE: 1, reqL: 0.5 }] }, { MF: 1 }).surfaces.find((s) => s.n[1] < 0);
  assert.equal(hot.okE, true); assert.equal(hot.okL, false); assert.equal(hot.pass, false, "vượt giới hạn độ chói → không đạt");
});

test("Bóng đổ trên mặt đất: tòa nhà che đèn → vùng sau nhà tối hơn hẳn", () => {
  const pole = lampAt(0, 0, 3, 90, 60);
  const area = { name: "Sân", x0: -4, y0: 8, L: 8, W: 4, step: 1 };
  const open = calcArea({ poles: [pole], areas: [area] }, { MF: 1 }).areas[0];
  const shade = calcArea({ poles: [pole], areas: [area], objects: [bld("B", [[-6, 4], [6, 4], [6, 6], [-6, 6]], 10)] }, { MF: 1 }).areas[0];
  assert.ok(open.Eav > 1);
  assert.ok(shade.Eav < open.Eav * 0.05, `${shade.Eav} vs ${open.Eav}`);
});

test("Excel sheet VAT THE: đọc tòa nhà/tường/cây, vật liệu theo tên → ρ; dòng sai → cảnh báo", () => {
  const C = OBJ_COLS;
  const rows = [
    { [C.id]: "NH1", [C.type]: "Tòa nhà", [C.pts]: "0 0; 20 0; 20 12; 0 12", [C.H]: 18, [C.mat]: "Đá, bê tông sáng", [C.zone]: "E3" },
    { [C.id]: "TR1", [C.type]: "Tường rào", [C.pts]: "-5 -5; 30 -5", [C.H]: 2.5, [C.rho]: 0.45 },
    { [C.id]: "C1", [C.type]: "Cây xanh", [C.pts]: "25 20", [C.H]: 9, [C.crownR]: 3.5 },
    { [C.id]: "X1", [C.type]: "Tòa nhà", [C.pts]: "0 0; 1 1", [C.H]: 5 },
    { [C.id]: "X2", [C.type]: "Tường rào", [C.pts]: "0 0; 5 0", [C.H]: null },
    { [C.id]: "X3", [C.type]: "Cây xanh", [C.pts]: "1 1", [C.H]: 6, [C.rho]: 1.7 },
  ];
  const { objects, warnings } = parseObjRows(rows);
  assert.deepEqual(objects.map((o) => o.id), ["NH1", "TR1", "C1", "X3"]);
  const nh = objects[0];
  assert.equal(nh.type, "building"); assert.equal(nh.zone, "E3");
  assert.equal(nh.rho, MATERIALS.find((m) => m.name === "Đá, bê tông sáng").rho);
  assert.equal(objects[1].rho, 0.45);
  assert.equal(objects[2].crownR, 3.5);
  assert.equal(objects[3].rho, MATERIALS.find((m) => m.type === "tree").rho, "ρ sai → dùng mặc định theo loại");
  assert.ok(warnings.some((w) => /X1/.test(w)), "đa giác < 3 đỉnh");
  assert.ok(warnings.some((w) => /X2/.test(w)), "thiếu chiều cao");
  assert.ok(warnings.some((w) => /X3/.test(w)), "ρ ngoài 0–1");
});

test("Excel VAT THE ghi → đọc lại giữ nguyên vật thể", async () => {
  const objs = [bld("NH1", [[0, 0], [20, 0], [20, 12], [0, 12]], 18, { zone: "E3", mat: "Đá, bê tông sáng", rho: 0.5, step: 1 }),
    wall("TR1", [[-5, -5], [30, -5]], 2.5, { zone: "E3" }), { id: "C1", type: "tree", pts: [[25, 20]], H: 9, crownR: 3.5, rho: 0.15, zone: "E3" }];
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("VAT THE");
  ws.addRow(OBJ_HEAD); for (const r of objectsSheetRows(objs)) ws.addRow(r);
  const x = XLSX.read(await wb.xlsx.writeBuffer());
  const back = parseObjRows(XLSX.utils.sheet_to_json(x.Sheets["VAT THE"], { defval: null })).objects;
  assert.deepEqual(back.map((o) => [o.id, o.type, o.H, o.pts.length, o.zone]), objs.map((o) => [o.id, o.type, o.H, o.pts.length, o.zone]));
});

test("Bảng tham khảo không tự mâu thuẫn: đạt mức Eav tối thiểu thì độ chói vẫn trong giới hạn vùng (ρ đại diện mỗi nhóm)", () => {
  for (const z of ARCH_REQS.filter((r) => r.Lmax > 0)) for (const [cls, rho] of [["light", 0.65], ["medium", 0.45], ["dark", 0.2]]) {
    const L = rho * z.Emin[cls] / Math.PI;
    assert.ok(L <= z.Lmax * 1.15, `${z.zone} ${cls}: L ${L.toFixed(1)} > ${z.Lmax}`);
  }
});

test("Mặt đánh giá: chỉ các cạnh khai báo bị đánh giá; mặt khác vẫn tính số nhưng không kết luận", () => {
  const o = bld("B", [[0, 5], [10, 5], [10, 10], [0, 10]], 6, { zone: "E3", faces: [1], step: 1 });
  const r = calcArch({ poles: [lampAt(5, 0, 1)], objects: [o] }, { MF: 1 });
  assert.ok(r.surfaces[0].req && r.surfaces[0].edge === 1);
  assert.ok(r.surfaces.slice(1).every((s) => s.req === null));
  const back = parseObjRows([{ [OBJ_COLS.id]: "B", [OBJ_COLS.type]: "Tòa nhà", [OBJ_COLS.pts]: "0 5; 10 5; 10 10; 0 10", [OBJ_COLS.H]: 6, [OBJ_COLS.faces]: "1; 3" }]).objects[0];
  assert.deepEqual(back.faces, [1, 3]);
});

// ---------- mẫu, Excel kết quả, 3D, mặt đứng trải phẳng ----------
import { sampleState } from "../src/areaSamples.mjs";
import { buildAreaWorkbook, buildAreaTemplate, parseAreaRows } from "../src/area.mjs";
import { drawArea3D } from "../src/areaView3D.mjs";
import { drawFacades } from "../src/archDraw.mjs";
const SLtxt = readFileSync(join(here, "fixtures/SL-70W.ies"), "utf8");
const idxM = buildIesIndex([{ name: "242AEE3-NHB-SL-70W_IESNA2002.IES", text: SLtxt }]);

test("Mẫu mỹ thuật: mặt Nam tòa nhà đạt E3 (Eav ≥ 30 lx với ρ 0,75, L ≤ 10 cd/m²); mặt khác không kết luận", () => {
  const s = sampleState("mythuat", idxM);
  const r = calcArch(s, { MF: 0.8 });
  const south = r.surfaces.find((f) => f.objId === "NH1" && f.edge === 1);
  assert.ok(south.pass, `Eav ${south.Eav.toFixed(1)} L ${south.Lav.toFixed(2)}`);
  assert.ok(south.Eav >= 30 && south.Lav <= 10);
  assert.ok(r.surfaces.filter((f) => f.objId === "NH1" && f.edge !== 1).every((f) => f.req === null));
  const crowns = r.surfaces.filter((f) => f.kind === "crown");
  assert.equal(crowns.length, 2); assert.ok(crowns.every((c) => c.Eav > 5), "cây được hắt sáng");
});

test("Excel kết quả có VAT THE + KET QUA MAT DUNG + LUOI MAT DUNG; đọc lại VAT THE ra đúng vật thể", async () => {
  const s = sampleState("mythuat", idxM), result = calcArea(s, { MF: 0.8 }), arch = calcArch(s, { MF: 0.8 });
  const wb = await buildAreaWorkbook(ExcelJS, { poles: s.poles, areas: s.areas, objects: s.objects, result, arch });
  for (const n of ["VAT THE", "KET QUA MAT DUNG", "LUOI MAT DUNG"]) assert.ok(wb.getWorksheet(n), n);
  assert.equal(wb.getWorksheet("KET QUA MAT DUNG").rowCount, 1 + arch.surfaces.length);
  const x = XLSX.read(await wb.xlsx.writeBuffer());
  const back = parseObjRows(XLSX.utils.sheet_to_json(x.Sheets["VAT THE"], { defval: null }));
  assert.deepEqual(back.warnings, []);
  assert.deepEqual(back.objects.map((o) => [o.id, o.type, o.zone, (o.faces || []).join()]), s.objects.map((o) => [o.id, o.type, o.zone || null, (o.faces || []).join()]));
  const tpl = await buildAreaTemplate(ExcelJS, { sample: sampleState("mythuat", []) });
  assert.ok(tpl.getWorksheet("VAT THE").rowCount === 1 + s.objects.length);
});

test("Đèn âm đất: Excel đọc được cao 0 và nghiêng tới 180°", () => {
  const { poles, warnings } = parseAreaRows({
    poleRows: [{ "Trụ": "H1", "x (m)": 1, "y (m)": 2, "Cao H (m)": 0, "Bộ đèn (IES)": "242AEE3-NHB-SL-70W" }],
    lampRows: [{ "Trụ": "H1", "Đèn số": 1, "Hướng chiếu (độ)": 90, "Góc nghiêng (độ)": 165, "Cao độ (m)": 0 }],
  }, idxM);
  assert.deepEqual(warnings, []);
  assert.equal(poles[0].H, 0); assert.equal(poles[0].lamps[0].tilt, 165); assert.equal(poles[0].lamps[0].H, 0);
});

test("3D + mặt đứng trải phẳng vẽ được với vật thể; mặt tiền được chiếu sáng có điểm ảnh sáng", async () => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const s = sampleState("mythuat", idxM), result = calcArea(s, { MF: 0.8 }), arch = calcArch(s, { MF: 0.8 });
  const cv = createCanvas(900, 520), ctx = cv.getContext("2d");
  const out = drawArea3D(ctx, 900, 520, { ...s, result, arch }, {});
  assert.ok(out.p95 > 0);
  const d = ctx.getImageData(0, 0, 900, 520).data; let bright = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 500) bright++;
  assert.ok(bright > 2000, `điểm sáng ${bright}`);
  const cv2 = createCanvas(900, 400);
  assert.equal(drawFacades(cv2.getContext("2d"), 900, 400, arch, { objId: "NH1" }).n, 4);
  assert.equal(drawFacades(cv2.getContext("2d"), 900, 400, null, {}).n, 0);
});

test("Rà soát: điểm mặt đất trong chân nhà bị loại; đèn trong chân nhà → cảnh báo; cây không có mức chuẩn → không kết luận; tán không xuống dưới đất", () => {
  const B = bld("B", [[-2, 10], [2, 10], [2, 14], [-2, 14]], 6);
  const a = calcArea({ poles: [lampAt(0, 0, 6, 90, 40)], areas: [{ name: "S", x0: -6, y0: 6, L: 12, W: 12, step: 1 }], objects: [B] }, { MF: 1 }).areas[0];
  assert.equal(a.grid.inBuilding, 16); assert.equal(a.E.length, 144 - 16);
  const r = calcArch({ poles: [lampAt(0, 12, 1)], objects: [B] }, { MF: 1 });
  assert.equal(r.warnings.length, 1); assert.match(r.warnings[0], /trong chân tòa nhà B/);
  const t = calcArch({ poles: [lampAt(0, 0, 1)], objects: [{ id: "C", type: "tree", pts: [[0, 3]], H: 2, crownR: 3, rho: 0.15, zone: "E3" }] }, { MF: 1 }).surfaces[0];
  assert.equal(t.req, null);
  assert.ok(t.points.every((p) => p.z >= 0) && Math.abs(t.R - 1) < 1e-9, "R kẹp ≤ H/2");
});

test("3D đường trong PDF: vẽ ở độ phân giải 2× (1680 × 800), JPEG", async () => {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const { perspective3DDataURL } = await import("../src/report.mjs");
  const { calcRoad } = await import("../src/engine.mjs");
  const ph = parseIES(SLtxt), input = { ies: ph, H: 10, overhang: 1, spacing: 35, width: 10, lanes: 2, tilt: 10, arrangement: "1 bên", MF: 0.8, detail: true };
  const url = perspective3DDataURL({ install: { ...input }, luminaire: { cct: 4000 } }, calcRoad(input), { createElement: () => createCanvas(10, 10) });
  assert.match(url, /^data:image\/jpeg/);
  const img = await loadImage(Buffer.from(url.split(",")[1], "base64"));
  assert.deepEqual([img.width, img.height], [1680, 800]);
});

test("3D khu vực dò tia: mặt đất ngoài vùng tính cũng có vũng sáng dưới trụ (trường độ rọi toàn cảnh); ảnh mượt, không ô khối", async () => {
  const { createCanvas } = await import("@napi-rs/canvas");
  const s = sampleState("congvien", idxM), result = calcArea(s, { MF: 0.8 });
  const cv = createCanvas(600, 340), ctx = cv.getContext("2d");
  drawArea3D(ctx, 600, 340, { ...s, result }, { ss: 1, overlays: false });
  const d = ctx.getImageData(0, 0, 600, 340).data;
  // độ mượt: chênh lệch giữa điểm ảnh liền kề nhỏ ở phần lớn ảnh (ô khối sẽ tạo bậc lớn đều đặn)
  let big = 0, n = 0;
  for (let y = 120; y < 330; y++) for (let x = 1; x < 600; x++) { const o = (y * 600 + x) * 4, p = o - 4; n++; if (Math.abs(d[o] - d[p]) + Math.abs(d[o + 1] - d[p + 1]) + Math.abs(d[o + 2] - d[p + 2]) > 30) big++; }
  assert.ok(big / n < 0.01, `bậc màu ${(100 * big / n).toFixed(2)}%`);
  // vũng sáng dưới trụ V1 (ngoài mọi vùng tính) sáng hơn hẳn mặt đất xa trụ
  const pr = (await import("../src/areaView3D.mjs")).makeProjector((await import("../src/areaView3D.mjs")).defaultCamera(s.poles, s.areas, []), 600, 340);
  const at = (x, y) => { const q = pr.P(x, y, 0); const o = (Math.round(q[1]) * 600 + Math.round(q[0])) * 4; return d[o] + d[o + 1] + d[o + 2]; };
  assert.ok(at(10, 24) > at(-8, 50) + 60, `${at(10, 24)} vs ${at(-8, 50)}`);
});
