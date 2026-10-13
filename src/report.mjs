// Tạo báo cáo PDF kiểu DIALux cho 1 tuyến/phương án.
import { VERSION } from "./version.mjs";
import { luminaireLabel } from "./mapping.mjs";
import { angleLumToPoint, arrangementKind, arrangementLabel } from "./geometry.mjs";
// Phần thuần dữ liệu (reportData) test được ở Node; phần vẽ canvas + jsPDF chạy ở trình duyệt.

/** Mã bộ đèn (Article No.) từ [LUMCAT] + [LAMP], khử lặp khi một bên đã chứa bên kia. */
export function articleNoOf(ph, meta = {}) {
  const a = (ph.lumcat || "").trim(), b = (ph.lampCode || "").trim();
  const na = a.toUpperCase().replace(/\s+/g, " "), nb = b.toUpperCase().replace(/\s+/g, " ");
  if (a && b) {
    if (nb.includes(na)) return b;          // LAMP đã chứa LUMCAT
    if (na.includes(nb)) return a;          // LUMCAT đã chứa LAMP
    return a + " " + b;
  }
  return a || b || meta.model || "";
}

/** Gom dữ liệu báo cáo (thuần, không phụ thuộc DOM). */
export function reportData(input, result, ph, meta = {}) {
  const req = result.req, road = result.road, c = result.checks;
  const eff = ph.totalLumens && ph.inputWatts ? ph.totalLumens / ph.inputWatts : null;
  const checkRow = (sym, calc, target, ok, unit = "") => ({ sym, calc, target, ok, unit });
  return {
    tuyen: meta.tuyen || "", roadClass: result.roadClass,
    autoClass: !!meta.autoClass, autoSelect: !!meta.autoSelect, classSource: meta.classSource || "",
    luminaire: {
      model: meta.model || ph.lumcat || "",
      articleNo: articleNoOf(ph, meta),
      articleName: luminaireLabel(meta.iesName) || ph.luminaireName || "", // tên nhà cung cấp đặt (= tên file IES), như Excel
      iesDesc: ph.luminaireName || "", iesFile: meta.iesName || "",
      iesNote: meta.iesNote || "", // cảnh báo: đèn đã tính khác công suất dòng dữ liệu ghi
      fitting: meta.fitting || "", ncc: meta.ncc || ph.manufac || "",
      P: ph.inputWatts,
      phiLamp: ph.totalLumens, phiLum: ph.totalLumens, // LED: ΦLuminaire ≈ ΦLamp
      eta: ph.totalLumens ? 100 : null,                // hiệu suất bộ đèn (%)
      efficacy: eff,                                   // lm/W
      cct: meta.cct || ph.cct || null, cri: meta.cri || ph.cri || null,
      iesName: meta.iesName || "",
    },
    install: {
      spacing: input.spacing, H: input.H, overhang: input.overhang, tilt: input.tilt,
      boomLength: input.vuon ?? null, setback: input.setback ?? null,
      width: input.width, lanes: input.lanes, arrangement: input.arrangement, MF: input.MF ?? 0.8,
      sidewalk: input.sidewalk ?? null, median: !!input.median, medianW: input.medianW ?? null,
      rot: input.rot || 0, perPole: input.perPole || 1,
      surface: "CIE R3, q0 " + String(input.q0 ?? 0.07).replace(".", ","),
      q0: input.q0 ?? 0.07,
    },
    energy: energyIndicators({
      P: ph.inputWatts, spacing: input.spacing, width: input.width,
      Eav: result.E.avg, arrangement: input.arrangement, perPole: input.perPole || 1,
    }),
    checks: [
      checkRow("Lav (Ltb)", road.Lav, req.Ltb, c.Ltb, "cd/m²"),
      checkRow("Uo", road.Uo, req.Uo, c.Uo, ""),
      checkRow("Ul", road.Ul, req.Ul, c.Ul, ""),
      checkRow("TI", road.TI, req.TI, c.TI, "%"),
      checkRow("SR", road.SR, req.SR, c.SR, ""),
    ],
    pass: result.pass,
    rei: road.REI != null ? { value: road.REI, width: result.reiWidth, target: req.SR } : null,
    illum: { Eav: result.E.avg, Emin: result.E.min, Emax: result.E.max, g1: result.E.g1, g2: result.E.g2 },
    observers: result.observers.map((o) => ({ y: o.pos.y, Lav: o.Lav, Uo: o.Uo, Ul: o.Ul, TI: o.TI })),
  };
}

/**
 * Cường độ sáng lớn nhất tại góc dọc γ (qua mọi mặt C), quy về cd/klm
 * (chia cho quang thông bộ đèn / 1000). Dùng cho khối "Max. luminous intensities".
 */
export function maxIntensityPerKlm(ph, makeIntensity, gammaDeg, pose = {}) {
  // Theo TƯ THẾ LẮP THẬT (như DIALux "with the luminaire installed for use"): xét mọi hướng tạo với
  // phương thẳng đứng hướng xuống một góc ≥ gammaDeg trong hệ toạ độ THẾ GIỚI, quy về hệ của đèn đã nghiêng/xoay.
  const I = makeIntensity(ph);
  const flux = ph.totalLumens || null;
  if (!flux) return null;
  const DEG = Math.PI / 180, lum = { x: 0, y: 0, H: 0, tilt: pose.tilt || 0, rot: pose.rot || 0, c0dir: 1 };
  const at = (gw, f) => {
    const sg = Math.sin(gw * DEG), cg = Math.cos(gw * DEG);
    const a = angleLumToPoint(lum, { x: sg * Math.sin(f * DEG), y: sg * Math.cos(f * DEG), z: -cg });
    return I(a.C, a.gamma);
  };
  // quét thô 0,5° × 2,5° rồi tinh chỉnh 0,1° × 0,25° quanh 3 đỉnh lớn nhất — khớp DIALux ±0,5%, vẫn nhanh
  const top = [];
  for (let gw = gammaDeg; gw <= 180; gw += 0.5) for (let f = 0; f < 360; f += 2.5) {
    const v = at(gw, f);
    if (top.length < 3 || v > top[2].v) { top.push({ v, gw, f }); top.sort((p, q) => q.v - p.v); top.length = Math.min(3, top.length); }
  }
  let imax = top.length ? top[0].v : 0;
  for (const t of top) for (let gw = Math.max(gammaDeg, t.gw - 0.5); gw <= Math.min(180, t.gw + 0.5) + 1e-9; gw += 0.1)
    for (let f = t.f - 2.5; f <= t.f + 2.5 + 1e-9; f += 0.25) { const v = at(gw, f); if (v > imax) imax = v; }
  return imax / (flux / 1000); // cd/klm
}

/**
 * Tỷ lệ quang thông phát lên trên phương ngang khi đèn ở tư thế lắp (ULOR = Φ↑ / Φ bộ đèn).
 * Tích phân ∫∫ I sinγ dγ dφ trên bán cầu trên (thế giới), chia cho quang thông khai báo.
 */
/** Quang thông bộ đèn (lm) = tích phân cường độ trên cả mặt cầu (tư thế bất kỳ cho cùng kết quả). */
function integrateFluxLocal(ph, makeIntensity) {
  const I = makeIntensity(ph), DEG = Math.PI / 180, dg = 1, df = 5; let F = 0;
  for (let g = dg / 2; g < 180; g += dg) for (let c = df / 2; c < 360; c += df) F += I(c, g) * Math.sin(g * DEG) * (dg * DEG) * (df * DEG);
  return F;
}

export function upwardRatio(ph, makeIntensity, pose = {}) {
  const I = makeIntensity(ph), flux = ph.totalLumens || null;
  if (!flux) return null;
  const DEG = Math.PI / 180, lum = { x: 0, y: 0, H: 0, tilt: pose.tilt || 0, rot: pose.rot || 0, c0dir: 1 };
  const dg = 1, df = 5; let up = 0;
  for (let gw = 90 + dg / 2; gw < 180; gw += dg) {
    const sg = Math.sin(gw * DEG), cg = Math.cos(gw * DEG);
    for (let f = df / 2; f < 360; f += df) {
      const a = angleLumToPoint(lum, { x: sg * Math.sin(f * DEG), y: sg * Math.cos(f * DEG), z: -cg });
      up += I(a.C, a.gamma) * sg * (dg * DEG) * (df * DEG);
    }
  }
  return Math.max(0, Math.min(1, up / flux));
}

/**
 * Chỉ số năng lượng (theo quy ước DIALux):
 *  - nSide: số hàng đèn (đối xứng/so le = 2; 1 bên/giữa = 1)
 *  - Wkm   : công suất lắp đặt trên 1 km tuyến (W/km)
 *  - Dp    : mật độ công suất trên độ rọi (W/lx·m²) = (nSide·P/(S·W)) / Eav
 *  - De    : điện năng/m²/năm (kWh/m²·yr) = (nSide·P/(S·W))·giờ/1000
 *  - annualKwh: điện năng/năm cho cụm đèn 1 nhịp (kWh/yr)
 */
export function energyIndicators({ P, spacing, width, Eav, arrangement, hours = 4000, perPole = 1 }) {
  const kind = arrangementKind(arrangement);
  // nSide = số bộ đèn trong 1 nhịp: 2 hàng (đối xứng/so le) hoặc cần đôi (giữa); nhân số bộ đèn/trụ
  const nSide = (kind === "single" ? 1 : 2) * Math.max(1, Math.round(perPole || 1));
  if (!P || !spacing || !width) return { nSide, Wkm: null, Dp: null, De: null, annualKwh: null };
  const perM2 = nSide * P / (spacing * width);  // W/m²
  return {
    nSide,
    // như DIALux: số đèn trên 1 km mỗi hàng = 1000/S làm tròn gần nhất (đối chiếu S = 34, 35, 36, 37, 42 m)
    Wkm: nSide * Math.max(1, Math.round(1000 / spacing)) * P,
    Dp: Eav ? perM2 / Eav : null,
    De: perM2 * hours / 1000,
    annualKwh: nSide * P * hours / 1000,
  };
}

/** Lưới 2D [hàng y][cột x] từ Evals phẳng. */
export function grid2D(result, vals = result.Evals) {
  const { nLong, nTrans, dL, dT } = result.grid;
  const xs = Array.from({ length: nLong }, (_, i) => dL / 2 + i * dL);
  const ys = Array.from({ length: nTrans }, (_, j) => dT / 2 + j * dT);
  const g = ys.map((_, j) => xs.map((_, i) => vals[i * nTrans + j]));
  return { xs, ys, g };
}

// ---- Vẽ (trình duyệt) ----
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// bảng màu kiểu viridis rút gọn
function viridis(t) {
  t = clamp(t, 0, 1);
  const stops = [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];
  const f = t * (stops.length - 1), i = Math.floor(f), r = f - i;
  const a = stops[i], b = stops[Math.min(i + 1, stops.length - 1)];
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*r)},${Math.round(a[1]+(b[1]-a[1])*r)},${Math.round(a[2]+(b[2]-a[2])*r)})`;
}

/**
 * Ảnh false-color lưới độ rọi -> dataURL. Nội suy SONG TUYẾN giữa các điểm lưới
 * (mịn, không còn ô vuông), độ phân giải cao, kèm thang màu lx bên phải.
 * @param vals  mảng giá trị theo thứ tự grid.points (mặc định Evals; có thể truyền Lvals)
 */
export function falseColorDataURL(result, doc = globalThis.document, vals = result.Evals, label = "lx") {
  const { xs, ys, g } = grid2D(result, vals);
  let min = Infinity, max = -Infinity; for (const row of g) for (const v of row) { if (v < min) min = v; if (v > max) max = v; }
  const nx = xs.length, ny = ys.length, S = result.grid.S, W = result.grid.W;
  const PPM = Math.max(6, Math.min(14, Math.floor(900 / S)));  // pixel/mét theo chiều dọc
  const w = Math.round(S * PPM), h = Math.max(60, Math.round(W * PPM));
  const barW = 18, pad = 78;                                     // chỗ cho thang màu + nhãn
  const cv = doc.createElement("canvas"); cv.width = w + pad; cv.height = h;
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  const dL = xs[1] - xs[0], dT = ys.length > 1 ? ys[1] - ys[0] : W;
  const sample = (xw, yw) => {                                   // song tuyến trên tâm ô, kẹp ở biên
    let fi = (xw - xs[0]) / dL, fj = (yw - ys[0]) / dT;
    let i0 = Math.max(0, Math.min(nx - 2, Math.floor(fi))), j0 = Math.max(0, Math.min(ny - 2, Math.floor(fj)));
    const tx = Math.max(0, Math.min(1, fi - i0)), ty = Math.max(0, Math.min(1, fj - j0));
    if (nx === 1) return g[Math.min(ny - 1, Math.max(0, Math.round(fj)))][0];
    if (ny === 1) return g[0][i0] + (g[0][i0 + 1] - g[0][i0]) * tx;
    const a = g[j0][i0] + (g[j0][i0 + 1] - g[j0][i0]) * tx, b = g[j0 + 1][i0] + (g[j0 + 1][i0 + 1] - g[j0 + 1][i0]) * tx;
    return a + (b - a) * ty;
  };
  const img = ctx.createImageData(w, h); const px = img.data;
  const hex = (c) => c.match(/\d+/g).map(Number);
  for (let py = 0; py < h; py++) {
    const yw = W - (py + 0.5) / h * W;                           // y lớn ở trên
    for (let pxl = 0; pxl < w; pxl++) {
      const xw = (pxl + 0.5) / w * S;
      const t = max > min ? (sample(xw, yw) - min) / (max - min) : 0.5;
      const c = hex(viridis(t)); const o = (py * w + pxl) * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = "#8a94a6"; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  // thang màu
  const bx = w + 10, by = 6, bh = h - 12;
  const grd = ctx.createLinearGradient(0, by + bh, 0, by);
  for (let k = 0; k <= 10; k++) grd.addColorStop(k / 10, viridis(k / 10));
  ctx.fillStyle = grd; ctx.fillRect(bx, by, barW, bh);
  ctx.strokeStyle = "#8a94a6"; ctx.strokeRect(bx + 0.5, by + 0.5, barW - 1, bh - 1);
  ctx.fillStyle = "#374151"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  const dg = label === "lx" ? 1 : 2;
  ctx.fillText(vn(max, dg), bx + barW + 3, by + 9);
  ctx.fillText(vn((min + max) / 2, dg), bx + barW + 3, by + bh / 2 + 4);
  ctx.fillText(vn(min, dg), bx + barW + 3, by + bh - 1);
  return cv.toDataURL("image/png");
}

/**
 * Polar LDC kiểu DIALux: lưới góc 15° có nhãn, vòng tròn cd/klm có số,
 * đỏ = mặt C0–C180 (ngang đường), xanh = mặt C90–C270 (dọc đường). -> dataURL
 */
export function polarDataURL(ph, makeIntensity, doc = globalThis.document) {
  const I = makeIntensity(ph);
  const klm = (ph.totalLumens || 1000) / 1000;            // quy về cd/klm
  const S = 460, cx = S / 2, cy = 168, R = 190;             // tâm (đèn) phía trên, 0° hướng xuống; R vừa để nhãn 105° còn trong khung
  const cv = doc.createElement("canvas"); cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, S, S);
  // thang: bước đẹp sao cho ~4 vòng
  let imax = 1; const gMax = Math.max(90, Math.max(...ph.vAngles));
  for (let c = 0; c < 360; c += 5) for (let g = 0; g <= gMax; g += 2) imax = Math.max(imax, I(c, g) / klm);
  const nice = (x) => { const e = Math.pow(10, Math.floor(Math.log10(x))); const m = x / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * e; };
  const step = nice(imax / 4); const top = Math.ceil(imax / step) * step; const sc = R / top;
  const pt = (gDeg, v, side) => { const a = gDeg * Math.PI / 180; return [cx + side * Math.sin(a) * v * sc, cy + Math.cos(a) * v * sc]; };
  // lưới vòng tròn + nhãn giá trị (dọc trục xuống, hơi lệch phải)
  ctx.strokeStyle = "#c9ced6"; ctx.lineWidth = 1; ctx.fillStyle = "#4b5563"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  for (let v = step; v <= top + 1e-9; v += step) {
    ctx.beginPath(); ctx.arc(cx, cy, v * sc, 0, 2 * Math.PI); ctx.stroke();
    ctx.fillText(String(Math.round(v)), cx + 4, cy + v * sc - 3);
  }
  // lưới góc mỗi 15° (tới 105° như DIALux) + nhãn
  for (let g = 0; g <= 105; g += 15) for (const side of [-1, 1]) {
    if (g === 0 && side === -1) continue;
    const [x1, y1] = pt(g, top, side);
    ctx.strokeStyle = "#d6dae1"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x1, y1); ctx.stroke();
    const [lx, ly] = pt(g, top * 1.07, side);
    ctx.fillStyle = "#374151"; ctx.textAlign = "center"; ctx.fillText(g + "°", lx, ly + 4);
  }
  // đường cong 2 mặt C
  const plane = (cR, cL, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); let first = true;
    const put = (c, g, side) => { const v = I(c, g) / klm; const [x, y] = pt(g, v, side); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); };
    for (let g = 0; g <= gMax; g++) put(cR, g, 1);        // nhánh phải: 0 → gMax
    for (let g = gMax; g >= 0; g--) put(cL, g, -1);       // nhánh trái: gMax → 0 (khép kín)
    ctx.closePath(); ctx.stroke();
  };
  // Màu theo DIALux: ĐỎ = mặt dọc đường (cánh dơi rộng; IES gọi C90–C270), XANH = mặt ngang đường (IES C0–C180)
  plane(90, 270, "#d62728");
  plane(0, 180, "#1f4fd6");
  // chú thích đơn vị
  ctx.fillStyle = "#4b5563"; ctx.font = "11px sans-serif"; ctx.textAlign = "right";
  ctx.fillText("cd/klm", S - 8, S - 8);
  return cv.toDataURL("image/png");
}

/** Sơ đồ mặt bằng 1 nhịp (trụ, hướng xe, kích thước) -> dataURL. */
/**
 * Bố trí ngang dùng cho hình vẽ (mặt bằng + 3D). Toạ độ TÍNH: y = 0..W là lòng đường (y=0 mép gần),
 * y<0 / y>W là vỉa hè. Toạ độ VẼ: tâm đường = 0, có chèn dải phân cách bề rộng mW ở giữa (chỉ để vẽ —
 * engine coi W là tổng các làn). Vỉa hè vẽ rộng `walk` (cột vỉa hè; trống → max(3, setback+1)).
 */
export function lateralLayout(I = {}) {
  const W = I.width || 7;
  const center = arrangementKind(I.arrangement) === "center";     // trụ trên dải phân cách → luôn có dải
  const mW = (I.median || center) ? (I.medianW > 0 ? I.medianW : 2) : 0;
  const Wt = W + mW;
  const sb = (I.setback != null && isFinite(I.setback)) ? Math.max(0, I.setback) : 0.5;
  const walk = I.sidewalk > 0 ? I.sidewalk : Math.max(3, sb + 1);
  const toDraw = (y) => {
    if (y <= 0) return -Wt / 2 + y;
    if (y >= W) return Wt / 2 + (y - W);
    if (!mW) return y - W / 2;
    return y < W / 2 ? -Wt / 2 + y : -Wt / 2 + y + mW;
  };
  const classify = (yd) => {
    if (yd < -Wt / 2) { const dd = -Wt / 2 - yd; return { kind: dd <= walk ? "walk" : "ground", side: "left", d: dd }; }
    if (yd > Wt / 2) { const dd = yd - Wt / 2; return { kind: dd <= walk ? "walk" : "ground", side: "right", d: dd }; }
    if (mW && Math.abs(yd) < mW / 2) return { kind: "median", d: yd };
    return { kind: "road", y: (!mW || yd <= -mW / 2) ? yd + Wt / 2 : yd + Wt / 2 - mW };
  };
  return { W, mW, Wt, walk, sb, toDraw, classify, center };
}

export function planDataURL(d, doc = globalThis.document) {
  const I = d.install, W = I.width || 7, S = I.spacing || 30, ov = I.overhang || 0;
  const kindA = arrangementKind(I.arrangement), two = kindA === "opposite" || kindA === "staggered", stag = kindA === "staggered";
  const LY = lateralLayout(I), Wt = LY.Wt, mW = LY.mW, walk = LY.walk, sb = LY.sb;
  const cv = doc.createElement("canvas"); cv.width = 760; cv.height = 400;
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  const mL = 70, mR = 40, mT = 34, mB = 64;
  const pw = cv.width - mL - mR, ph2 = cv.height - mT - mB;
  const tot = Wt + 2 * walk;
  const X = (x) => mL + (x / S) * pw;                         // dọc đường 0..S
  const Yd = (yd) => mT + ((yd + tot / 2) / tot) * ph2;       // toạ độ vẽ (tâm đường = 0)
  const Y = (y) => Yd(LY.toDraw(y));                          // toạ độ tính (0..W, hè <0 / >W)
  const band = (y0, y1, fill) => { ctx.fillStyle = fill; ctx.fillRect(mL, Yd(y0), pw, Yd(y1) - Yd(y0)); };
  // vỉa hè hai bên + lòng đường + dải phân cách
  band(-tot / 2, -Wt / 2, "#e6e9ee"); band(Wt / 2, tot / 2, "#e6e9ee");
  band(-Wt / 2, Wt / 2, "#f4f6f9");
  if (mW) band(-mW / 2, mW / 2, "#dcebd7");
  ctx.strokeStyle = "#9aa7b6"; ctx.lineWidth = 1.5;
  for (const yd of [-Wt / 2, Wt / 2, ...(mW ? [-mW / 2, mW / 2] : [])]) { ctx.beginPath(); ctx.moveTo(mL, Yd(yd)); ctx.lineTo(mL + pw, Yd(yd)); ctx.stroke(); }
  ctx.font = "12px sans-serif"; ctx.fillStyle = "#7b8695"; ctx.textAlign = "center";
  const walkLbl = "Vỉa hè " + vn(walk, 1) + " m" + (I.sidewalk > 0 ? "" : " (minh hoạ)");
  ctx.fillText(walkLbl, mL + pw / 2, (Yd(-tot / 2) + Yd(-Wt / 2)) / 2 + 4);
  ctx.fillText(walkLbl, mL + pw / 2, (Yd(tot / 2) + Yd(Wt / 2)) / 2 + 4);
  if (mW) { ctx.fillStyle = "#4f7a45"; ctx.fillText("Dải phân cách " + vn(mW, 1) + " m", mL + pw / 2, Yd(0) + 4); }
  // vạch làn (bỏ vạch trùng dải phân cách)
  const lanes = I.lanes || 2;
  ctx.setLineDash([10, 8]); ctx.strokeStyle = "#c2ccd8"; ctx.lineWidth = 1.5;
  for (let l = 1; l < lanes; l++) {
    const yr = W * l / lanes; if (mW && Math.abs(yr - W / 2) < 1e-6) continue;
    const yy = Y(yr); ctx.beginPath(); ctx.moveTo(mL, yy); ctx.lineTo(mL + pw, yy); ctx.stroke();
  }
  ctx.setLineDash([]);
  // mũi tên hướng xe (giữa mỗi làn)
  ctx.strokeStyle = "#5b6676"; ctx.fillStyle = "#5b6676"; ctx.lineWidth = 2;
  for (let l = 0; l < lanes; l++) {
    const yy = Y(W * (l + 0.5) / lanes); const x0 = mL + 14, x1 = mL + 54;
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, yy); ctx.lineTo(x1 - 7, yy - 4); ctx.lineTo(x1 - 7, yy + 4); ctx.closePath(); ctx.fill();
  }
  // trụ (trên vỉa hè, cách mép sb) + cần đèn + điểm sáng (tại overhang)
  const poleAt = (xx, yPoleD, yLampD) => {
    const px = X(xx), pyP = Yd(yPoleD), pyL = Yd(yLampD);
    ctx.strokeStyle = "#4b5563"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px, pyP); ctx.lineTo(px, pyL); ctx.stroke(); // cần
    ctx.fillStyle = "#374151"; ctx.beginPath(); ctx.arc(px, pyP, 5.5, 0, 2 * Math.PI); ctx.fill();                 // trụ
    ctx.fillStyle = "#f59e0b"; ctx.strokeStyle = "#b45309"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(px - 5, pyL - 3.5, 10, 7); ctx.fill(); ctx.stroke();                                // bộ đèn
  };
  const near = (k) => poleAt(k * S, -Wt / 2 - sb, LY.toDraw(ov));
  const far = (k, off = 0) => poleAt(k * S + off, Wt / 2 + sb, LY.toDraw(W - ov));
  if (LY.center) for (let k = 0; k <= 1; k++) { poleAt(k * S, 0, LY.toDraw(W / 2 - ov)); poleAt(k * S, 0, LY.toDraw(W / 2 + ov)); }
  else for (let k = 0; k <= 1; k++) { near(k); if (two) far(k, stag ? S / 2 : 0); }
  if (stag) far(0, -S / 2);
  // kích thước S (dưới) và W (phải, đo lòng đường)
  ctx.strokeStyle = "#1f2937"; ctx.fillStyle = "#1f2937"; ctx.lineWidth = 1; ctx.font = "16px sans-serif";
  const yb = mT + ph2 + 22;
  ctx.beginPath(); ctx.moveTo(mL, yb); ctx.lineTo(mL + pw, yb); ctx.stroke();
  ctx.textAlign = "center"; ctx.fillText(vn(S, 1) + " m", mL + pw / 2, yb + 18);
  const xr = mL + pw + 22;
  ctx.beginPath(); ctx.moveTo(xr, Yd(-Wt / 2)); ctx.lineTo(xr, Yd(Wt / 2)); ctx.stroke();
  ctx.save(); ctx.translate(xr + 16, Yd(0)); ctx.rotate(-Math.PI / 2);
  ctx.fillText(vn(W, 1) + " m" + (mW ? " + " + vn(mW, 1) + " m" : ""), 0, 0); ctx.restore();
  // nhãn trên lòng đường (nửa gần nếu có dải phân cách)
  const area = S * W, yLbl = mW ? (Yd(-Wt / 2) + Yd(-mW / 2)) / 2 : Yd(0);
  ctx.fillStyle = "#1f2937"; ctx.textAlign = "center"; ctx.font = "bold 16px sans-serif";
  ctx.fillText(`${d.tuyen} (${d.roadClass}), ${vn(area, 2)} m²`, mL + pw / 2, yLbl - 4);
  ctx.font = "14px sans-serif"; ctx.fillStyle = "#5b6676";
  ctx.fillText("Mặt đường: " + I.surface, mL + pw / 2, yLbl + 16);
  return cv.toDataURL("image/png");
}

/** Nhiệt độ màu (K) -> màu RGB xấp xỉ của ánh sáng (Tanner Helland). 3000K ấm vàng, 4000K trung tính, 5700K+ trắng lạnh. */
export function cctToRGB(K) {
  let t = Math.max(1000, Math.min(12000, K || 4000)) / 100, r, g, b;
  r = t <= 66 ? 255 : Math.min(255, Math.max(0, 329.698727446 * Math.pow(t - 60, -0.1332047592)));
  g = t <= 66 ? Math.min(255, Math.max(0, 99.4708025861 * Math.log(t) - 161.1195681661))
              : Math.min(255, Math.max(0, 288.1221695283 * Math.pow(t - 60, -0.0755148492)));
  b = t >= 66 ? 255 : (t <= 19 ? 0 : Math.min(255, Math.max(0, 138.5177312231 * Math.log(t - 10) - 305.0447927307)));
  return [Math.round(r), Math.round(g), Math.round(b)];
}

/**
 * Mô phỏng 3D phối cảnh ban đêm — DATA-DRIVEN: mặt đường được tô từ chính
 * lưới độ rọi E đã tính (chiếu ngược từng pixel → toạ độ đường → lấy E, lặp theo nhịp).
 * Kèm thang màu lx. Đây là bản đồ kết quả thật trong phối cảnh, không phải minh hoạ.
 */
export function perspective3DDataURL(d, result, doc = globalThis.document) {
  const I = d.install, W = I.width || 7, S = I.spacing || 30, H = I.H || 9, ov = I.overhang || 0;
  const LY = lateralLayout(I), Wt = LY.Wt, mW = LY.mW;
  const kindA = arrangementKind(I.arrangement), two = kindA === "opposite" || kindA === "staggered", stag = kindA === "staggered";
  const CW = 840, CH = 400, xNear = 6, Xfar = 220;
  const cv = doc.createElement("canvas"); cv.width = CW; cv.height = CH;
  const ctx = cv.getContext("2d");
  // --- camera / phép chiếu pinhole (tầm mắt lái xe) ---
  const cx = CW / 2, horizonY = CH * 0.40, f = 620, hCam = 1.7, d0 = 10;
  const proj = (x, yLat, z = 0) => ({ sx: cx + f * yLat / (x + d0), sy: horizonY + f * (hCam - z) / (x + d0), s: f / (x + d0) });

  // --- lưới E một nhịp + hàm lấy mẫu song tuyến (lặp theo S, kẹp theo W) ---
  const G = grid2D(result); const xs = G.xs, ys = G.ys, g = G.g;
  const Emax = Math.max(1e-6, result.E.max), Emin = result.E.min;
  const nx = xs.length, ny = ys.length, dL = xs[1] - xs[0], dT = ys[1] - ys[0];
  const sampleE = (xw, yw) => {
    let xm = ((xw % S) + S) % S;               // lặp theo nhịp
    let fi = (xm - xs[0]) / dL;                // chỉ số cột (có thể <0 hoặc >nx-1 → wrap)
    let i0 = Math.floor(fi), tx = fi - i0;
    const ia = ((i0 % nx) + nx) % nx, ib = (ia + 1) % nx;
    let fj = (Math.min(W, Math.max(0, yw)) - ys[0]) / dT;
    let j0 = Math.max(0, Math.min(ny - 2, Math.floor(fj))), ty = Math.max(0, Math.min(1, fj - j0));
    const a = g[j0][ia] + (g[j0][ib] - g[j0][ia]) * tx;
    const b = g[j0 + 1][ia] + (g[j0 + 1][ib] - g[j0 + 1][ia]) * tx;
    return a + (b - a) * ty;
  };
  // màu ánh sáng theo nhiệt độ màu CCT của đèn (IES/Excel); không có -> 4000K trung tính
  const cctK = parseInt(d.luminaire && d.luminaire.cct, 10) || 4000;
  const LC = cctToRGB(cctK);                                      // màu nguồn sáng
  const mix = (A, B, u) => [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u];
  const asphalt = [38, 41, 47], white = [255, 252, 245];
  // thang màu "đêm": nhựa tối → màu đèn (theo CCT) → gần trắng (theo t = E chuẩn hoá)
  const ramp = (t) => {
    t = Math.max(0, Math.min(1, t));
    const st = [[0, asphalt], [0.3, mix(asphalt, LC, 0.45)], [0.65, mix(asphalt, LC, 0.85)], [0.88, LC], [1, mix(LC, white, 0.55)]];
    for (let k = 0; k < st.length - 1; k++) {
      if (t <= st[k + 1][0]) {
        const u = (t - st[k][0]) / (st[k + 1][0] - st[k][0]); const A = st[k][1], B = st[k + 1][1];
        return [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u];
      }
    }
    return st[st.length - 1][1];
  };

  // --- bầu trời đêm + nền đất ---
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, "#070d1c"); sky.addColorStop(0.7, "#132138"); sky.addColorStop(1, "#2a3b52");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, CW, horizonY);
  const glow = ctx.createLinearGradient(0, horizonY - 40, 0, horizonY);
  glow.addColorStop(0, "rgba(255,210,150,0)"); glow.addColorStop(1, "rgba(255,196,120,0.16)");
  ctx.fillStyle = glow; ctx.fillRect(0, horizonY - 40, CW, 40);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = 0; i < 70; i++) { const rx = (i * 137.5) % CW, ry = (i * 61.7) % (horizonY - 20); ctx.globalAlpha = 0.3 + ((i * 7) % 10) / 14; ctx.fillRect(rx, ry, 1.4, 1.4); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#0e1014"; ctx.fillRect(0, horizonY, CW, CH - horizonY);

  // --- mặt đường + vỉa hè + dải phân cách: tô từng pixel theo E thật ---
  const EW = result.Ewalk;                                   // lưới E trên vỉa hè (engine detail)
  const sampleWalk = (xw, side, dd) => {
    if (!EW) return 0.45 * sampleE(xw, side === "left" ? 0 : W);  // dữ liệu cũ: ước lượng từ mép đường
    const M = side === "left" ? EW.left : EW.right, ysw = EW.ys, n = M[0].length;
    let fi = ((((xw % S) + S) % S) - xs[0]) / dL, i0 = Math.floor(fi), tx = fi - i0;
    const ia = ((i0 % n) + n) % n, ib = (ia + 1) % n;
    const fj = Math.max(0, Math.min(ysw.length - 1, (dd - ysw[0]) / (ysw[1] - ysw[0] || 1)));
    const j0 = Math.min(ysw.length - 2, Math.floor(fj)), ty = fj - j0;
    const a = M[j0][ia] + (M[j0][ib] - M[j0][ia]) * tx, b = M[j0 + 1][ia] + (M[j0 + 1][ib] - M[j0 + 1][ia]) * tx;
    return a + (b - a) * ty;
  };
  const pave0 = [44, 45, 50], paveLit = mix(mix(LC, white, 0.25), [200, 198, 192], 0.35);   // gạch lát hè
  const grass0 = [16, 30, 20], grassLit = mix([70, 128, 64], LC, 0.25);                      // cỏ dải phân cách
  const img = ctx.getImageData(0, 0, CW, CH); const px = img.data;
  const y0 = Math.ceil(horizonY) + 1;
  for (let sy = y0; sy < CH; sy++) {
    const xw = f * hCam / (sy - horizonY) - d0;        // khoảng cách dọc đường
    if (xw < -d0 + 0.6 || xw > Xfar) continue;          // tô cả vùng sát camera (trước đây bỏ trống thành dải đen)
    const kx = (xw + d0) / f;
    for (let sx = 0; sx < CW; sx++) {
      const cl = LY.classify((sx - cx) * kx);
      let c;
      if (cl.kind === "road") {
        const E = sampleE(xw, cl.y);
        c = ramp((E - Emin) / Math.max(1e-6, Emax - Emin)); // giãn Emin→Emax cho rõ vũng sáng/tối
      } else if (cl.kind === "walk") {
        const t = Math.max(0, Math.min(1, sampleWalk(xw, cl.side, cl.d) / Emax));
        c = mix(pave0, paveLit, Math.pow(t, 0.8) * 0.9);
        if (((Math.floor(xw / 0.6) + Math.floor(cl.d / 0.6)) & 1) === 0) c = [c[0] * 0.93, c[1] * 0.93, c[2] * 0.93]; // mạch gạch
      } else if (cl.kind === "median") {
        const t = Math.max(0, Math.min(1, sampleE(xw, W / 2) / Emax));
        c = mix(grass0, grassLit, Math.pow(t, 0.9) * 0.8);
      } else continue;
      const o = (sy * CW + sx) * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // --- bó vỉa (mép hè + mép dải phân cách) và vạch sơn — dải đa giác đúng phối cảnh (bề rộng thật, m) ---
  const xBot = f * hCam / (CH - horizonY) - d0;               // điểm dọc đường ở mép dưới khung hình
  const strip = (yd0, yd1, color, x0 = xBot, x1 = Xfar) => {
    const a0 = proj(x0, yd0), a1 = proj(x1, yd0), b1 = proj(x1, yd1), b0 = proj(x0, yd1);
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(a0.sx, a0.sy); ctx.lineTo(a1.sx, a1.sy); ctx.lineTo(b1.sx, b1.sy); ctx.lineTo(b0.sx, b0.sy); ctx.closePath(); ctx.fill();
  };
  const curbs = [-Wt / 2, Wt / 2]; if (mW) curbs.push(-mW / 2, mW / 2);
  for (const yd of curbs) strip(yd - 0.09, yd + 0.09, "rgba(176,181,190,0.85)");          // bó vỉa 18 cm
  const edgeIn = 0.25, pw0 = 0.12;                                                          // vạch sơn mép 12 cm
  const paint = "rgba(236,239,244,0.62)";
  strip(-Wt / 2 + edgeIn, -Wt / 2 + edgeIn + pw0, paint); strip(Wt / 2 - edgeIn - pw0, Wt / 2 - edgeIn, paint);
  if (mW) { strip(-mW / 2 - edgeIn - pw0, -mW / 2 - edgeIn, paint); strip(mW / 2 + edgeIn, mW / 2 + edgeIn + pw0, paint); }
  // vạch chia làn (đứt 4 m, cách 4 m) — bỏ vạch trùng dải phân cách
  const lanes = I.lanes || 2;
  for (let l = 1; l < lanes; l++) {
    const yr = W * l / lanes;
    if (mW && Math.abs(yr - W / 2) < 1e-6) continue;
    const yl = LY.toDraw(yr);
    for (let x = Math.floor(xBot / 8) * 8; x < Xfar; x += 8) strip(yl - pw0 / 2, yl + pw0 / 2, "rgba(232,236,242,0.5)", Math.max(x, xBot), x + 4);
  }
  // cây bụi thấp trên dải phân cách (đủ rộng mới trồng), vẽ xa trước
  if (mW >= 1.2) {
    for (let x = Math.floor(Xfar / 7) * 7; x >= 14; x -= 7) {
      if (LY.center && Math.abs(x - Math.round(x / S) * S) < 2.5) continue;   // chừa chỗ chân trụ trên dải
      const p = proj(x, 0, 0.35); if (p.s < 0.15) continue;
      const r = Math.max(1, Math.min(14, Math.min(mW * 0.22, 0.6) * p.s));
      const t = Math.max(0, Math.min(1, sampleE(x, W / 2) / Emax));
      const cc = mix([10, 22, 14], [58, 104, 52], t * 0.85);
      ctx.fillStyle = `rgb(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0})`;
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy, r, r * 0.7, 0, 0, 2 * Math.PI); ctx.fill();
    }
  }

  // --- trụ + cần + đèn (vẽ xa trước) ---
  const sb3 = LY.sb;
  const poles = [];
  for (let k = 0; k <= Math.floor(Xfar / S) + 1; k++) {
    if (LY.center) {                                                                                  // trụ ở tim dải phân cách, cần đôi
      poles.push({ x: k * S, poleLat: 0, lampLat: LY.toDraw(W / 2 - ov) }, { x: k * S, poleLat: 0, lampLat: LY.toDraw(W / 2 + ov) });
      continue;
    }
    poles.push({ x: k * S, poleLat: -(Wt / 2 + sb3), lampLat: LY.toDraw(ov) });                        // hàng gần: trụ trên vỉa hè
    if (two) poles.push({ x: k * S + (stag ? S / 2 : 0), poleLat: Wt / 2 + sb3, lampLat: LY.toDraw(W - ov) }); // hàng xa
  }
  poles.sort((a, b) => b.x - a.x);
  for (const p of poles) {
    if (p.x < xNear) continue;
    const base = proj(p.x, p.poleLat, 0), top = proj(p.x, p.poleLat, H);
    if (base.s < 0.12) continue;
    ctx.strokeStyle = "#0b0d11"; ctx.lineWidth = Math.max(0.8, base.s * 0.5);
    ctx.beginPath(); ctx.moveTo(base.sx, base.sy); ctx.lineTo(top.sx, top.sy); ctx.stroke();
    const lamp = proj(p.x, p.lampLat, H);                                                           // cần vươn tới điểm sáng
    ctx.beginPath(); ctx.moveTo(top.sx, top.sy); ctx.lineTo(lamp.sx, lamp.sy); ctx.stroke();
    const lr = Math.max(1.2, Math.min(4.5, base.s * 0.6));
    const lg = ctx.createRadialGradient(lamp.sx, lamp.sy, 0, lamp.sx, lamp.sy, lr * 2.2);
    const lc = `${LC[0]},${LC[1]},${LC[2]}`;
    lg.addColorStop(0, `rgba(${lc},0.85)`); lg.addColorStop(0.5, `rgba(${lc},0.3)`); lg.addColorStop(1, `rgba(${lc},0)`);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(lamp.sx, lamp.sy, lr * 2.2, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
    const wc = mix(LC, white, 0.6); ctx.fillStyle = `rgb(${wc[0] | 0},${wc[1] | 0},${wc[2] | 0})`;
    ctx.beginPath(); ctx.arc(lamp.sx, lamp.sy, lr * 0.8, 0, 2 * Math.PI); ctx.fill();
  }

  // --- thang màu E [lx] ---
  const lx0 = CW - 46, ly0 = horizonY + 18, lh = CH - horizonY - 52, lw = 14;
  const lg2 = ctx.createLinearGradient(0, ly0 + lh, 0, ly0);
  for (let k = 0; k <= 10; k++) { const c = ramp(k / 10); lg2.addColorStop(k / 10, `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`); }
  ctx.fillStyle = "rgba(10,12,16,0.55)"; ctx.fillRect(lx0 - 8, ly0 - 16, 52, lh + 34);
  ctx.fillStyle = lg2; ctx.fillRect(lx0, ly0, lw, lh);
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1; ctx.strokeRect(lx0, ly0, lw, lh);
  ctx.fillStyle = "#e8ecf2"; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("E [lx]", lx0 - 4, ly0 - 5);
  ctx.fillText(vn(Emax, 0), lx0 + lw + 3, ly0 + 4);
  ctx.fillText(vn((Emax + Emin) / 2, 0), lx0 + lw + 3, ly0 + lh / 2 + 4);
  ctx.fillText(vn(Emin, 0), lx0 + lw + 3, ly0 + lh + 4);
  // nhãn nhiệt độ màu
  ctx.fillStyle = "rgba(10,12,16,0.55)"; ctx.fillRect(10, CH - 30, 150, 22);
  ctx.fillStyle = `rgb(${LC[0]},${LC[1]},${LC[2]})`; ctx.beginPath(); ctx.arc(22, CH - 19, 6, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = "#e8ecf2"; ctx.font = "12px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(`CCT ${cctK} K` + ((d.luminaire && d.luminaire.cct) ? "" : " (mặc định)"), 34, CH - 14);
  // vignette nhẹ
  const vg = ctx.createRadialGradient(cx, CH * 0.6, CH * 0.35, cx, CH * 0.6, CH * 0.95);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);
  return cv.toDataURL("image/png");
}

/** Sơ đồ cần đèn với nhãn (1)-(4) -> dataURL. */
export function armDataURL(d, doc = globalThis.document) {
  const I = d.install;
  const cv = doc.createElement("canvas"); cv.width = 300; cv.height = 240;
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.strokeStyle = "#374151"; ctx.lineWidth = 2.5;
  const gx = 40, gy = 210;                       // gốc trụ (mặt đất)
  const topY = 52;                                // đỉnh trụ
  // mặt đất
  ctx.strokeStyle = "#9aa7b6"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(10, gy); ctx.lineTo(290, gy); ctx.stroke();
  // trụ
  ctx.strokeStyle = "#374151"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, topY); ctx.stroke();
  // cần nghiêng + đèn
  const armLen = 120, inc = (I.tilt || 0) * Math.PI / 180;
  const ex = gx + armLen * Math.cos(inc) * 0.9, ey = topY - armLen * Math.sin(inc) * 0.9 + 6;
  ctx.beginPath(); ctx.moveTo(gx, topY + 6); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.fillStyle = "#f59e0b"; ctx.strokeStyle = "#b45309"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(ex, ey, 11, 5, 0, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  // nhãn
  ctx.fillStyle = "#1f2937"; ctx.font = "13px sans-serif"; ctx.textAlign = "left";
  ctx.fillText("(1) " + vn(I.H, 1) + " m", gx + 6, (gy + topY) / 2);
  ctx.fillText("(3) " + vn(I.tilt, 0) + "°", gx + 16, topY + 26);
  ctx.textAlign = "center";
  ctx.fillText("(4) cần " + vn(I.boomLength, 2) + " m", (gx + ex) / 2, Math.min(ey, topY) - 10);
  ctx.fillText("(2) vươn " + vn(I.overhang, 2) + " m", ex, gy - 10);
  return cv.toDataURL("image/png");
}

// ---- Dựng PDF (trình duyệt): cần jsPDF + font Unicode + makeIntensity ----
// Ảnh PNG luôn thêm với nén "FAST": mặc định jsPDF lưu pixel thô → PDF to gấp ~10 lần.
export const vn = (x, d = 2) => (x == null || !isFinite(x)) ? "—" : Number(x).toFixed(d).replace(".", ",");

/** Cắt chữ bằng "…" cho vừa bề rộng maxW (mm) ở cỡ chữ hiện tại. */
export function fitText(doc, txt, maxW) {
  let s = String(txt ?? "");
  if (doc.getTextWidth(s) <= maxW) return s;
  const ell = "…";
  while (s.length > 1 && doc.getTextWidth(s + ell) > maxW) s = s.slice(0, -1);
  return s + ell;
}

export function drawTable(doc, x, y, cols, rows, opt = {}) {
  const rh = opt.rh || 7, fs = opt.fs || 9;
  let cy = y;
  rows.forEach((row, ri) => {
    let cx = x;
    const head = ri === 0 && opt.header;
    cols.forEach((w, ci) => {
      const fill = head ? [235, 238, 244] : (opt.zebra && ri % 2 === 0 ? [247, 249, 252] : [255, 255, 255]);
      doc.setDrawColor(200); doc.setFillColor(...fill);
      doc.rect(cx, cy, w, rh, "FD");
      const cell = row[ci];
      const raw = cell == null ? "" : String(cell.t != null ? cell.t : cell);
      const align = (cell && cell.a) || (ci === 0 ? "left" : "right");
      doc.setTextColor(cell && cell.c ? cell.c[0] : 30, cell && cell.c ? cell.c[1] : 30, cell && cell.c ? cell.c[2] : 40);
      // chữ dài: thu cỡ tới 6.5pt, còn dài nữa thì cắt "…" — không bao giờ tràn ô
      let size = fs; doc.setFontSize(size);
      while (size > 6.5 && doc.getTextWidth(raw) > w - 4) { size -= 0.5; doc.setFontSize(size); }
      const txt = fitText(doc, raw, w - 4);
      const tx = align === "left" ? cx + 2 : (align === "center" ? cx + w / 2 : cx + w - 2);
      doc.text(txt, tx, cy + rh - 2.2, { align });
      doc.setFontSize(fs);
      cx += w;
    });
    cy += rh;
  });
  doc.setTextColor(30, 30, 40);
  return cy;
}

/** Sang trang mới trong báo cáo 1 tuyến: in đầu trang nhỏ (tên tuyến) và trả y bắt đầu. */
function newPage(doc, d) {
  doc.addPage();
  doc.setFontSize(7.8); doc.setTextColor(120, 130, 145);
  doc.text(fitText(doc, (d.tuyen || "") + "  ·  Báo cáo tính toán chiếu sáng đường (QCVN 07-7:2023)", 182), 14, 10);
  doc.setTextColor(30, 30, 40);
  return 16;
}

/** Đóng tài liệu: chân trang © + "Trang i/N" cho MỌI trang (gọi 1 lần sau khi render xong). */
export function finalizeDoc(doc, { tail = "engine CIE 140 · bảng R3 CIE · TI theo EN 13201-3 (giá trị ban đầu)" } = {}) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5); doc.setTextColor(120, 130, 145);
    doc.text(`© 2026 maivulam · WebDialux-CS ${VERSION} · ${tail}`, 14, 290);
    doc.text(`Trang ${i}/${n}`, 196, 290, { align: "right" });
    doc.setTextColor(30, 30, 40);
  }
  return doc;
}

const OK_RGB = [31, 138, 76], BAD_RGB = [192, 57, 43], ACCENT_RGB = [31, 78, 121];
const TOC_ROW = 6, TOC_Y1 = 58, TOC_YN = 22, TOC_BOTTOM = 284;
const tocRowsOn = (y0) => Math.floor((TOC_BOTTOM - y0) / TOC_ROW) - 1; // trừ dòng tiêu đề bảng

/**
 * Mục lục (mẫu C: ô tổng quan + bảng sọc; chữ Kết quả màu) + bookmark. Gọi SAU khi đã render
 * các tuyến, TRƯỚC finalizeDoc. entries: [{stt, tuyen, roadClass, lamp, power, pass, firstPage, sections}].
 * ≥ 2 tuyến: chèn K trang mục lục vào đầu file, cộng K vào mọi số trang; 1 tuyến: chỉ bookmark.
 * info (tuỳ chọn, từ buildPdfParts): { part, nParts, from, to, total }.
 */
export function addToc(doc, entries, info = {}) {
  const n = entries.length;
  const first = tocRowsOn(TOC_Y1), rest = tocRowsOn(TOC_YN);
  const K = n < 2 ? 0 : 1 + Math.max(0, Math.ceil((n - first) / rest));
  for (let k = 0; k < K; k++) doc.insertPage(1);
  const sh = (p) => p + K;
  const M = 14, cols = [10, 60, 12, 56, 12, 20, 12];
  const head = [{ t: "STT", a: "right" }, { t: "Tuyến đường", a: "left" }, { t: "Cấp", a: "center" }, { t: "Bộ đèn", a: "left" },
    { t: "CS (W)", a: "right" }, { t: "Kết quả", a: "left" }, { t: "Trang", a: "right" }];
  if (K > 0) {
    const nPass = entries.filter((e) => e.pass).length;
    const lamps = new Set(entries.map((e) => e.lamp).filter(Boolean)).size;
    const scope = info.nParts > 1 ? `phần ${info.part}/${info.nParts} (tuyến ${info.from}–${info.to} / ${info.total})` : `${n} tuyến`;
    let idx = 0;
    for (let pg = 1; pg <= K; pg++) {
      doc.setPage(pg);
      let y;
      if (pg === 1) {
        doc.setFontSize(18); doc.setTextColor(25, 30, 40); doc.text("Mục lục & tổng quan", M, 20);
        doc.setFillColor(...ACCENT_RGB); doc.rect(M, 23, 22, 1.1, "F");
        doc.setFontSize(9.5); doc.setTextColor(95, 105, 120);
        doc.text(fitText(doc, `Báo cáo tính toán chiếu sáng đường — QCVN 07-7:2023 · ${scope}`, 182), M, 30);
        const cards = [[String(n), "tuyến trong file", [25, 30, 40]], [String(nPass), "ĐẠT", OK_RGB], [String(n - nPass), "KHÔNG ĐẠT", BAD_RGB],
          [String(doc.getNumberOfPages()), `trang · ${lamps} loại đèn`, [25, 30, 40]]];
        const cw = (182 - 3 * 4) / 4;
        cards.forEach(([v, lbl, rgb], k) => {
          const x = M + k * (cw + 4);
          doc.setDrawColor(200); doc.setFillColor(255, 255, 255); doc.roundedRect(x, 35, cw, 17, 2, 2, "FD");
          doc.setFontSize(16); doc.setTextColor(...rgb); doc.text(v, x + 4, 43.5);
          doc.setFontSize(8); doc.setTextColor(95, 105, 120); doc.text(lbl, x + 4, 49);
        });
        y = TOC_Y1;
      } else {
        doc.setFontSize(12); doc.setTextColor(25, 30, 40); doc.text("Mục lục (tiếp)", M, 16);
        y = TOC_YN;
      }
      const take = entries.slice(idx, idx + (pg === 1 ? first : rest));
      const rows = [head, ...take.map((e) => [{ t: String(e.stt ?? ""), a: "right" }, { t: e.tuyen || "", a: "left" }, { t: e.roadClass || "", a: "center" },
        { t: e.lamp || "—", a: "left" }, { t: e.power != null ? String(e.power) : "—", a: "right" },
        { t: e.pass ? "ĐẠT" : "KHÔNG ĐẠT", a: "left", c: e.pass ? OK_RGB : BAD_RGB }, { t: String(sh(e.firstPage)), a: "right" }])];
      drawTable(doc, M, y, cols, rows, { header: true, zebra: true, rh: TOC_ROW, fs: 8.4 });
      // bấm cả dòng → tới trang đầu tuyến
      take.forEach((e, k) => doc.link(M, y + (k + 1) * TOC_ROW, 182, TOC_ROW, { pageNumber: sh(e.firstPage) }));
      idx += take.length;
    }
    doc.setTextColor(30, 30, 40);
    doc.outline.add(null, "Mục lục & tổng quan", { pageNumber: 1 });
  }
  for (const e of entries) {
    const label = (e.stt !== "" && e.stt != null ? `${e.stt}. ` : "") + (e.tuyen || "Tuyến");
    const node = doc.outline.add(null, label, { pageNumber: sh(e.firstPage) });
    for (const s of e.sections || []) doc.outline.add(node, s.title, { pageNumber: sh(s.page) });
  }
  return { tocPages: K };
}

/** Bảng lưới giá trị (hàng = y từ trên xuống, cột = x) — kiểu DIALux "Value grid". */
function drawValueGrid(doc, M, y, G, digits, d) {
  const nx = G.xs.length;
  const c0 = 14, cw = Math.max(9, Math.floor((182 - c0) / nx * 10) / 10);
  const fs = nx > 12 ? 6.2 : nx > 9 ? 6.8 : 7.4;
  const rows = [[{ t: "y \\ x (m)", a: "left" }, ...G.xs.map((x) => ({ t: vn(x, 2), a: "center" }))]];
  for (let j = G.ys.length - 1; j >= 0; j--) rows.push([{ t: vn(G.ys[j], 3), a: "left" }, ...G.g[j].map((v) => ({ t: vn(v, digits), a: "center" }))]);
  const need = rows.length * 4.8 + 8;
  if (y + need > 284) y = newPage(doc, d);
  return drawTable(doc, M, y, [c0, ...Array(nx).fill(cw)], rows, { header: true, rh: 4.8, fs });
}

/** Tạo doc jsPDF đã nạp font Unicode (dùng chung cho báo cáo nhiều trang). */
export function makeDoc({ jsPDF, font }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS(font.vfs, font.b64); doc.addFont(font.vfs, font.name, "normal"); doc.setFont(font.name);
  return doc;
}

/** Các phần của báo cáo 1 tuyến — bookmark con trong PDF (thứ tự xuất hiện). */
export const TOC_SECTIONS = ["Phối cảnh & mặt bằng", "Thông số bộ đèn", "Thông số lắp đặt", "Kết quả đánh giá", "Chỉ số năng lượng", "Độ rọi ngang", "Kết quả theo người quan sát"];

/**
 * Vẽ báo cáo 1 tuyến (3–4 trang) bắt đầu từ trang hiện tại của doc.
 * Trả { firstPage, sections: [{title, page}] } để dựng mục lục/bookmark.
 */
export function renderRoadPage(doc, { input, result, ph, meta, makeIntensity }) {
  const d = reportData(input, result, ph, meta);
  const M = 14, W = 210; let y = 16;
  const page = () => doc.getCurrentPageInfo().pageNumber;
  const firstPage = page(), sections = [];
  const mark = (title) => sections.push({ title, page: page() });
  mark("Phối cảnh & mặt bằng");

  const clsNote = d.classSource === "loại tuyến" ? " (theo loại tuyến)" : d.classSource === "hình học" ? " (tự xác định)" : "";
  const clsLbl = d.roadClass + clsNote;
  doc.setFontSize(15); doc.setTextColor(25, 30, 40);
  doc.text(d.tuyen || "Tuyến chiếu sáng", M, y); y += 6;
  doc.setFontSize(10); doc.setTextColor(95, 105, 120);
  doc.text("BÁO CÁO TÍNH TOÁN CHIẾU SÁNG ĐƯỜNG — Tiêu chuẩn QCVN 07-7:2023 (phương pháp CIE 140)", M, y); y += 7;
  doc.setFontSize(11);
  doc.setTextColor(...(d.pass ? [31, 138, 76] : [192, 57, 43]));
  doc.text(`Cấp đường: ${clsLbl}        Kết luận: ${d.pass ? "ĐẠT" : "KHÔNG ĐẠT"}`, M, y);
  doc.setTextColor(30, 30, 40); y += 8;

  // Mô phỏng 3D ban đêm (phối cảnh)
  doc.setFontSize(10.5); doc.text("Mô phỏng chiếu sáng ban đêm (phối cảnh 3D)", M, y); y += 3;
  try {
    const p3 = perspective3DDataURL(d, result, globalThis.document);
    const pw3 = 182, ph3 = pw3 * 440 / 840;
    doc.addImage(p3, "PNG", M, y, pw3, ph3, undefined, "FAST");
    doc.setFontSize(7.4); doc.setTextColor(120, 130, 145);
    const cctTxt = (d.luminaire && d.luminaire.cct) ? d.luminaire.cct + " K" : "4000 K (mặc định, IES không ghi)";
    const capLines = doc.splitTextToSize("Mặt đường tô theo lưới độ rọi E đã tính (Emin " + vn(result.E.min, 1) + " – Emax " + vn(result.E.max, 1) + " lx); màu ánh sáng theo nhiệt độ màu CCT " + cctTxt + ".", 182);
    doc.text(capLines, M, y + ph3 + 3.5);
    doc.setTextColor(30, 30, 40);
    y += ph3 + 6.5 + capLines.length * 3.5;
  } catch (_) { y += 2; }

  // Mặt bằng bố trí
  if (y + 78 > 284) { y = newPage(doc, d); }
  doc.setFontSize(10.5); doc.text("Mặt bằng bố trí", M, y); y += 3;
  try {
    const plan = planDataURL(d, globalThis.document);
    const pw = 150, phh = pw * 400 / 760;
    doc.addImage(plan, "PNG", M, y, pw, phh, undefined, "FAST");
    y += phh + 5;
  } catch (_) { y += 2; }

  // Thông số bộ đèn + Polar LDC
  if (y + 84 > 284) { y = newPage(doc, d); }
  mark("Thông số bộ đèn");
  doc.setFontSize(10.5); doc.text("Thông số bộ đèn", M, y); y += 2;
  const L = d.luminaire;
  const yAfter = drawTable(doc, M, y, [46, 56], [
    [{ t: "Nhà cung cấp", c: [90, 100, 120] }, L.ncc || "—"],
    ["Mã bộ đèn", L.articleNo || "—"],
    ["Tên bộ đèn", L.articleName || L.model || "—"],
    ["Mô tả trong IES", L.iesDesc || "—"],
    ["File IES", L.iesFile || "—"],
    ["Fitting (theo dữ liệu tuyến)", L.fitting || "—"],
    ["Công suất P", vn(L.P, 1) + " W"],
    ["Quang thông bóng ΦLamp", vn(L.phiLamp, 0) + " lm"],
    ["Quang thông bộ đèn ΦLum", vn(L.phiLum, 0) + " lm"],
    ["Hiệu suất bộ đèn η", vn(L.eta, 0) + " %"],
    ["Hiệu suất phát sáng", vn(L.efficacy, 1) + " lm/W"],
    ["Nhiệt độ màu CCT", L.cct ? L.cct + " K" : "—"],
    ["Chỉ số hoàn màu CRI", L.cri != null ? String(L.cri) : "—"],
  ], { rh: 6.0, fs: 8.6 });
  try {
    const polar = polarDataURL(ph, makeIntensity, globalThis.document);
    doc.addImage(polar, "PNG", M + 106, y - 2, 70, 70, undefined, "FAST");
    doc.setFontSize(8); doc.setTextColor(90, 100, 120);
    doc.text("Polar LDC (cd/klm) — đỏ: mặt dọc đường (C90–C270 IES), xanh: mặt ngang đường (C0–C180 IES)", M + 106 - 60, y + 71);
    doc.setTextColor(30, 30, 40);
  } catch (_) {}
  y = Math.max(yAfter, y + 74) + 4;
  if (L.iesNote) {
    doc.setFontSize(8.4); doc.setTextColor(...BAD_RGB);
    const ln = doc.splitTextToSize("Lưu ý: " + L.iesNote, 182);
    doc.text(ln, M, y); y += ln.length * 3.8 + 2;
    doc.setTextColor(30, 30, 40);
  }

  // Thông số lắp đặt (bố cục kiểu DIALux: toàn chiều rộng) + Imax + hình cần đèn
  const I = d.install, en = d.energy;
  const pose = { tilt: I.tilt || 0, rot: I.rot || 0 };                     // tư thế lắp thật
  const i70 = maxIntensityPerKlm(ph, makeIntensity, 70, pose);
  const i80 = maxIntensityPerKlm(ph, makeIntensity, 80, pose);
  const i90 = maxIntensityPerKlm(ph, makeIntensity, 90, pose);
  const ulor = upwardRatio(ph, makeIntensity, pose);
  const arrText = arrangementLabel(I.arrangement);
  if (y + 70 > 284) { y = newPage(doc, d); }
  mark("Thông số lắp đặt");
  doc.setFontSize(9.6); doc.setTextColor(40, 46, 58);
  doc.text(fitText(doc, L.iesName.replace(/_IESNA2002(\.IES)?$/i, "") + "  (" + arrText + ")", 182), M, y); y += 3;
  doc.setTextColor(30, 30, 40);
  const Lcol = 70, Vcol = 62;
  const yI = drawTable(doc, M, y, [Lcol, Vcol], [
    ["Khoảng cột (pole distance)", vn(I.spacing, 1) + " m"],
    ["(1) Độ cao điểm sáng", vn(I.H, 1) + " m"],
    ["(2) Vươn điểm sáng", vn(I.overhang, 2) + " m"],
    ["(3) Góc nghiêng cần", vn(I.tilt, 0) + "°"],
    ["(4) Chiều dài cần", vn(I.boomLength, 2) + " m"],
    arrangementKind(I.arrangement) === "center" ? ["Bề rộng dải phân cách (trụ ở tim)", vn(I.medianW ?? 2, 2) + " m"] : ["Trụ đến mép đường (setback)", vn(I.setback, 2) + " m"],
    ...(I.rot ? [["Góc xoay bộ đèn", vn(I.rot, 0) + "°"]] : []),
    ...((I.perPole || 1) > 1 ? [["Số bộ đèn / trụ", String(I.perPole)]] : []),
    ["Tiêu thụ / tuyến", vn(en.Wkm, 0) + " W/km"],
    ["ULR / ULOR", ulor == null ? "–" : vn(ulor * (ph.totalLumens / (integrateFluxLocal(ph, makeIntensity) || ph.totalLumens)), 2) + " / " + vn(ulor, 2)],
    [{ t: "Cường độ sáng max ≥ 70°", c: [40, 46, 58] }, vn(i70, 0) + " cd/klm"],
    ["Cường độ sáng max ≥ 80°", vn(i80, 0) + " cd/klm"],
    ["Cường độ sáng max ≥ 90°", vn(i90, 1) + " cd/klm"],
    ["Phân cấp cường độ sáng", "–"],
    ["Hệ số bảo trì MF", vn(I.MF, 2)],
  ], { rh: 6.0, fs: 8.3 });
  try { doc.addImage(armDataURL(d, globalThis.document), "PNG", M + Lcol + Vcol + 6, y - 1, 48, 38, undefined, "FAST"); } catch (_) {}
  doc.setFontSize(7.0); doc.setTextColor(120, 130, 145);
  const nx0 = M + Lcol + Vcol + 6, nw = 196 - nx0;
  ["Imax: cường độ sáng lớn nhất", "ở góc nêu so với phương", "thẳng đứng, quy về cd trên", "1000 lm quang thông (cd/klm)."]
    .forEach((ln, k) => doc.text(fitText(doc, ln, nw), nx0, y + 42 + k * 3.6));
  doc.setTextColor(30, 30, 40);
  y = yI + 4;
  doc.setFontSize(7.8); doc.setTextColor(90, 100, 120);
  doc.text("Mặt đường: " + I.surface + (d.autoSelect ? "   ·   bộ đèn do app tự chọn" : ""), M, y);
  doc.setTextColor(30, 30, 40); y += 6;

  // Bảng đánh giá
  if (y + 48 > 284) { y = newPage(doc, d); }
  mark("Kết quả đánh giá");
  doc.setFontSize(10.5); doc.text("Kết quả đánh giá (Symbol · Tính toán · Yêu cầu · Đạt)", M, y); y += 2;
  const crows = [[{ t: "Chỉ tiêu", a: "left" }, { t: "Tính toán", a: "right" }, { t: "Yêu cầu", a: "right" }, { t: "Đạt", a: "center" }]];
  const op = { "Lav (Ltb)": "≥", "Uo": "≥", "Ul": "≥", "TI": "≤", "SR": "≥" };
  for (const r of d.checks) crows.push([
    r.sym,
    vn(r.calc, r.sym === "TI" ? 0 : 2) + (r.unit ? " " + r.unit : ""),
    (op[r.sym] || "") + " " + vn(r.target, r.sym === "TI" ? 0 : 2) + (r.unit ? " " + r.unit : ""),
    { t: r.ok ? "✓" : "✗", a: "center", c: r.ok ? [31, 138, 76] : [192, 57, 43] },
  ]);
  y = drawTable(doc, M, y, [45, 48, 48, 24], crows, { header: true, rh: 7, fs: 9 });
  y += 3;
  doc.setFontSize(7.6); doc.setTextColor(90, 100, 120);
  doc.text("Hệ số bảo trì MF = " + vn(I.MF, 2) + " dùng cho tính toán.", M, y);
  if (d.rei) {
    y += 3.8;
    doc.text(fitText(doc, `Tham khảo REI (EN 13201-2:2015, mép xấu hơn, dải ${vn(d.rei.width, 2)} m) = ${vn(d.rei.value, 2)}` +
      ` — để đối chiếu phần mềm theo EN 13201; kết luận theo SR của QCVN 07-7.`, 182), M, y);
  }
  doc.setTextColor(30, 30, 40); y += 5;

  // Chỉ số năng lượng
  if (y + 24 > 286) { y = newPage(doc, d); }
  mark("Chỉ số năng lượng");
  doc.setFontSize(10.5); doc.text("Chỉ số năng lượng", M, y); y += 2;
  y = drawTable(doc, M, y, [48, 42, 50, 40], [
    ["Mật độ công suất Dp", vn(en.Dp, 3) + " W/lx·m²", "Điện năng De", vn(en.De, 2) + " kWh/m²·yr"],
    ["Tiêu thụ tuyến", vn(en.Wkm, 0) + " W/km", "Điện năng/năm (1 nhịp)", vn(en.annualKwh, 1) + " kWh/yr"],
  ], { rh: 6.5, fs: 8.5 });
  y += 5;

  // Độ rọi — tính kích thước ảnh TRƯỚC để tiêu đề sang trang cùng ảnh (không bỏ trơ tiêu đề cuối trang)
  const S_ = result.grid.S, W_ = result.grid.W;
  const PPM_ = Math.max(6, Math.min(14, Math.floor(900 / S_)));
  const cw_ = Math.round(S_ * PPM_) + 78, ch_ = Math.max(60, Math.round(W_ * PPM_));
  const aspect = ch_ / cw_;
  let iw = 132, ih = iw * aspect;
  if (ih < 40) { ih = 40; iw = Math.min(132, ih / aspect); }     // tối thiểu 40mm cao
  const maxH = 78; if (ih > maxH) { ih = maxH; iw = ih / aspect; }
  if (y + 3 + ih + 14 > 288) { y = newPage(doc, d); }
  mark("Độ rọi ngang");
  doc.setFontSize(10.5); doc.text("Độ rọi ngang (maintenance) — lưới & phân bố", M, y); y += 3;
  try {
    const fc = falseColorDataURL(result, globalThis.document);
    doc.addImage(fc, "PNG", M, y, iw, ih, undefined, "FAST");
    doc.setFontSize(8); doc.text(`${vn(result.grid.S,0)} m × ${vn(result.grid.W,1)} m (dọc × ngang)`, M, y + ih + 4);
    const e = d.illum;
    drawTable(doc, M + iw + 4, y, [22, 20], [
      ["Eav", vn(e.Eav, 1) + " lx"], ["Emin", vn(e.Emin, 2)], ["Emax", vn(e.Emax, 1)],
      ["Uo (g1)", vn(e.g1, 2)], ["g2", vn(e.g2, 2)],
    ], { rh: 6.5, fs: 8.5 });
    y += ih + 9;
  } catch (_) { y += 4; }

  // #1 Lưới giá trị số độ rọi (Value grid)
  try {
    const G = grid2D(result);
    if (y + (G.ys.length + 1) * 4.8 + 14 > 284) { y = newPage(doc, d); }
    doc.setFontSize(9.5); doc.setTextColor(40, 46, 58);
    doc.text("Độ rọi ngang duy trì [lx] — lưới giá trị", M, y); y += 2; doc.setTextColor(30, 30, 40);
    y = drawValueGrid(doc, M, y, G, 1, d) + 5;
  } catch (_) { y += 2; }

  // #3 Observer: vị trí (x, y, z) + Tính toán / Yêu cầu / Đạt từng chỉ tiêu (kiểu DIALux)
  const req = result.req, r2 = (v) => Math.round(v * 100) / 100;
  const obsBlockH = 2 + 7 + 4 * 6.2 + 3;
  if (y + 10 + obsBlockH > 284) { y = newPage(doc, d); }
  mark("Kết quả theo người quan sát");
  doc.setFontSize(10.5); doc.text("Kết quả theo người quan sát", M, y); y += 2;
  d.observers.forEach((o, i) => {
    if (y + obsBlockH > 284) { y = newPage(doc, d); }
    const chk = { Lav: r2(o.Lav) >= req.Ltb, Uo: r2(o.Uo) >= req.Uo, Ul: r2(o.Ul) >= req.Ul, TI: Math.round(o.TI) <= req.TI };
    const ok = (b) => ({ t: b ? "✓" : "✗", a: "center", c: b ? [31, 138, 76] : [192, 57, 43] });
    const rows = [
      [{ t: `Observer ${i + 1}  —  vị trí: -60,000 m; ${vn(o.y, 3)} m; 1,500 m`, a: "left", c: [40, 46, 58] }, { t: "Tính toán", a: "right" }, { t: "Yêu cầu", a: "right" }, { t: "Đạt", a: "center" }],
      ["Lav", vn(o.Lav) + " cd/m²", "≥ " + vn(req.Ltb) + " cd/m²", ok(chk.Lav)],
      ["Uo", vn(o.Uo), "≥ " + vn(req.Uo), ok(chk.Uo)],
      ["Ul", vn(o.Ul), "≥ " + vn(req.Ul), ok(chk.Ul)],
      ["TI", vn(o.TI, 0) + " %", "≤ " + vn(req.TI, 0) + " %", ok(chk.TI)],
    ];
    y = drawTable(doc, M, y, [86, 36, 36, 24], rows, { header: true, rh: 6.2, fs: 8.3 }) + 3;
  });
  doc.setFontSize(7.4); doc.setTextColor(120, 130, 145);
  const obsLines = doc.splitTextToSize("Observer đặt cách trường tính 60 m về phía trước, cao 1,5 m, trên tim từng làn (CIE 140). Kết quả mặt đường = trường hợp xấu nhất qua các observer.", 182);
  doc.text(obsLines, M, y);
  doc.setTextColor(30, 30, 40); y += 2.5 + obsLines.length * 3.5;

  // #4 Lưới giá trị độ chói theo từng observer (khi engine chạy detail=true)
  result.observers.forEach((o, i) => {
    if (!o.Lvals) return;
    try {
      const GL = grid2D(result, o.Lvals);
      if (y + (GL.ys.length + 1) * 4.8 + 14 > 284) { y = newPage(doc, d); }
      doc.setFontSize(9.5); doc.setTextColor(40, 46, 58);
      doc.text(`Observer ${i + 1}: độ chói duy trì, mặt đường khô [cd/m²] — lưới giá trị`, M, y); y += 2; doc.setTextColor(30, 30, 40);
      y = drawValueGrid(doc, M, y, GL, 2, d) + 5;
    } catch (_) { y += 2; }
  });
  return { firstPage, sections };
}

/** Báo cáo 1 trang cho 1 tuyến. */
export function buildRoadPdf({ jsPDF, input, result, ph, meta, makeIntensity, font }) {
  const doc = makeDoc({ jsPDF, font });
  const r = renderRoadPage(doc, { input, result, ph, meta, makeIntensity });
  addToc(doc, [{ stt: 1, tuyen: meta?.tuyen || "", ...r }]);
  return finalizeDoc(doc);
}
