// Tạo báo cáo PDF kiểu DIALux cho 1 tuyến/phương án.
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
      articleName: ph.luminaireName || "",
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
      surface: "CIE R3, q0 " + String(input.q0 ?? 0.07).replace(".", ","),
      q0: input.q0 ?? 0.07,
    },
    energy: energyIndicators({
      P: ph.inputWatts, spacing: input.spacing, width: input.width,
      Eav: result.E.avg, arrangement: input.arrangement,
    }),
    checks: [
      checkRow("Lav (Ltb)", road.Lav, req.Ltb, c.Ltb, "cd/m²"),
      checkRow("Uo", road.Uo, req.Uo, c.Uo, ""),
      checkRow("Ul", road.Ul, req.Ul, c.Ul, ""),
      checkRow("TI", road.TI, req.TI, c.TI, "%"),
      checkRow("SR", road.SR, req.SR, c.SR, ""),
    ],
    pass: result.pass,
    illum: { Eav: result.E.avg, Emin: result.E.min, Emax: result.E.max, g1: result.E.g1, g2: result.E.g2 },
    observers: result.observers.map((o) => ({ y: o.pos.y, Lav: o.Lav, Uo: o.Uo, Ul: o.Ul, TI: o.TI })),
  };
}

/**
 * Cường độ sáng lớn nhất tại góc dọc γ (qua mọi mặt C), quy về cd/klm
 * (chia cho quang thông bộ đèn / 1000). Dùng cho khối "Max. luminous intensities".
 */
export function maxIntensityPerKlm(ph, makeIntensity, gammaDeg) {
  const I = makeIntensity(ph);
  let imax = 0;
  for (let c = 0; c < 360; c += 5) imax = Math.max(imax, I(c, gammaDeg));
  const flux = ph.totalLumens || null;
  return flux ? imax / (flux / 1000) : null; // cd/klm
}

/**
 * Chỉ số năng lượng (theo quy ước DIALux):
 *  - nSide: số hàng đèn (đối xứng/so le = 2; 1 bên/giữa = 1)
 *  - Wkm   : công suất lắp đặt trên 1 km tuyến (W/km)
 *  - Dp    : mật độ công suất trên độ rọi (W/lx·m²) = (nSide·P/(S·W)) / Eav
 *  - De    : điện năng/m²/năm (kWh/m²·yr) = (nSide·P/(S·W))·giờ/1000
 *  - annualKwh: điện năng/năm cho cụm đèn 1 nhịp (kWh/yr)
 */
export function energyIndicators({ P, spacing, width, Eav, arrangement, hours = 4000 }) {
  const two = /đối xứng|doi xung|so le|staggered|two|opposite/i.test(arrangement || "");
  const nSide = two ? 2 : 1;
  if (!P || !spacing || !width) return { nSide, Wkm: null, Dp: null, De: null, annualKwh: null };
  const perM2 = nSide * P / (spacing * width);  // W/m²
  return {
    nSide,
    Wkm: nSide * (1000 / spacing) * P,
    Dp: Eav ? perM2 / Eav : null,
    De: perM2 * hours / 1000,
    annualKwh: nSide * P * hours / 1000,
  };
}

/** Lưới 2D [hàng y][cột x] từ Evals phẳng. */
export function grid2D(result) {
  const { nLong, nTrans, dL, dT } = result.grid;
  const xs = Array.from({ length: nLong }, (_, i) => dL / 2 + i * dL);
  const ys = Array.from({ length: nTrans }, (_, j) => dT / 2 + j * dT);
  const g = ys.map((_, j) => xs.map((_, i) => result.Evals[i * nTrans + j]));
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

/** Ảnh false-color lưới độ rọi -> dataURL. */
export function falseColorDataURL(result, doc = globalThis.document) {
  const { xs, ys, g } = grid2D(result);
  const min = result.E.min, max = result.E.max;
  const cw = 24, ch = 24; // px mỗi ô
  const cv = doc.createElement("canvas");
  cv.width = xs.length * cw; cv.height = ys.length * ch;
  const ctx = cv.getContext("2d");
  for (let j = 0; j < ys.length; j++) for (let i = 0; i < xs.length; i++) {
    const t = max > min ? (g[ys.length - 1 - j][i] - min) / (max - min) : 0.5; // y lớn ở trên
    ctx.fillStyle = viridis(t);
    ctx.fillRect(i * cw, j * ch, cw, ch);
  }
  return cv.toDataURL("image/png");
}

/** Polar LDC (hai mặt C0-C180, C90-C270) -> dataURL. */
export function polarDataURL(ph, makeIntensity, doc = globalThis.document) {
  const I = makeIntensity(ph);
  const S = 240, cx = S / 2, cy = 30, R = S - 60;
  const cv = doc.createElement("canvas"); cv.width = S; cv.height = S;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, S, S);
  let imax = 1;
  for (let c = 0; c < 360; c += 10) for (let g = 0; g <= 90; g += 5) imax = Math.max(imax, I(c, g));
  const drawPlane = (c0, c1, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    let first = true;
    for (let side of [c0, c1]) {
      for (let g = 0; g <= 90; g += 2) {
        const v = I(side, g) / imax;
        const ang = (side === c0 ? -1 : 1) * g * Math.PI / 180; // trái/phải
        const x = cx + Math.sin(ang) * v * R, y = cy + Math.cos(ang) * v * R;
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  };
  // lưới
  ctx.strokeStyle = "#ddd";
  for (let k = 1; k <= 3; k++){ ctx.beginPath(); ctx.arc(cx, cy, R*k/3, 0, Math.PI); ctx.stroke(); }
  drawPlane(0, 180, "#c0392b");   // C0-C180 (ngang đường)
  drawPlane(90, 270, "#2563a8");  // C90-C270 (dọc đường)
  return cv.toDataURL("image/png");
}

/** Sơ đồ mặt bằng 1 nhịp (trụ, hướng xe, kích thước) -> dataURL. */
export function planDataURL(d, doc = globalThis.document) {
  const I = d.install, W = I.width || 7, S = I.spacing || 30, ov = I.overhang || 0;
  const two = /đối xứng|doi xung|so le|staggered|opposite/i.test(I.arrangement || "");
  const stag = /so le|staggered/i.test(I.arrangement || "");
  const sb = (I.setback != null && isFinite(I.setback)) ? Math.max(0, I.setback) : 0.5; // trụ cách mép
  const cv = doc.createElement("canvas"); cv.width = 760; cv.height = 400;
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  const mL = 70, mR = 40, mT = 70, mB = 84;
  const pw = cv.width - mL - mR, ph2 = cv.height - mT - mB;
  const X = (x) => mL + (x / S) * pw;              // dọc đường 0..S
  const Y = (y) => mT + (y / W) * ph2;             // ngang đường 0..W (0 = mép gần/trên)
  // nền lòng đường
  ctx.fillStyle = "#f4f6f9"; ctx.fillRect(mL, mT, pw, ph2);
  ctx.strokeStyle = "#9aa7b6"; ctx.lineWidth = 1.5; ctx.strokeRect(mL, mT, pw, ph2);
  // vạch làn
  const lanes = I.lanes || 2;
  ctx.setLineDash([10, 8]); ctx.strokeStyle = "#c2ccd8";
  for (let l = 1; l < lanes; l++) { const yy = Y(W * l / lanes); ctx.beginPath(); ctx.moveTo(mL, yy); ctx.lineTo(mL + pw, yy); ctx.stroke(); }
  ctx.setLineDash([]);
  // mũi tên hướng xe (giữa mỗi làn)
  ctx.strokeStyle = "#5b6676"; ctx.fillStyle = "#5b6676"; ctx.lineWidth = 2;
  for (let l = 0; l < lanes; l++) {
    const yy = Y(W * (l + 0.5) / lanes); const x0 = mL + 14, x1 = mL + 54;
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, yy); ctx.lineTo(x1 - 7, yy - 4); ctx.lineTo(x1 - 7, yy + 4); ctx.closePath(); ctx.fill();
  }
  // vỉa hè (dải ngoài mép) để thấy trụ đứng ngoài lòng đường
  ctx.fillStyle = "#e9ecf1";
  ctx.fillRect(mL, Y(-sb) - 10, pw, (Y(0) - Y(-sb)) + 10);
  ctx.fillRect(mL, Y(W), pw, (Y(W + sb) - Y(W)) + 10);
  ctx.strokeStyle = "#9aa7b6"; ctx.lineWidth = 1.5; ctx.strokeRect(mL, mT, pw, ph2); // vẽ lại viền lòng đường
  // trụ (ngoài đường, cách mép sb) + cần đèn + điểm sáng (tại overhang)
  const poleAt = (xx, yPole, yLamp) => {
    const px = X(xx), pyP = Y(yPole), pyL = Y(yLamp);
    ctx.strokeStyle = "#4b5563"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(px, pyP); ctx.lineTo(px, pyL); ctx.stroke(); // cần
    ctx.fillStyle = "#374151"; ctx.beginPath(); ctx.arc(px, pyP, 5.5, 0, 2 * Math.PI); ctx.fill();               // trụ
    ctx.fillStyle = "#f59e0b"; ctx.strokeStyle = "#b45309"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.rect(px - 5, pyL - 3.5, 10, 7); ctx.fill(); ctx.stroke();                              // bộ đèn
  };
  const near = (k) => poleAt(k * S, -sb, ov);
  const far = (k, off = 0) => poleAt(k * S + off, W + sb, W - ov);
  for (let k = 0; k <= 1; k++) { near(k); if (two) far(k, stag ? S / 2 : 0); }
  if (stag) far(0, -S / 2);
  // kích thước S (dưới) và W (phải)
  ctx.strokeStyle = "#1f2937"; ctx.fillStyle = "#1f2937"; ctx.lineWidth = 1; ctx.font = "16px sans-serif";
  const yb = Y(W + sb) + 30;
  ctx.beginPath(); ctx.moveTo(mL, yb); ctx.lineTo(mL + pw, yb); ctx.stroke();
  ctx.textAlign = "center"; ctx.fillText(vn(S, 1) + " m", mL + pw / 2, yb + 18);
  const xr = mL + pw + 22;
  ctx.beginPath(); ctx.moveTo(xr, mT); ctx.lineTo(xr, mT + ph2); ctx.stroke();
  ctx.save(); ctx.translate(xr + 16, mT + ph2 / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(vn(W, 1) + " m", 0, 0); ctx.restore();
  // nhãn giữa
  const area = S * W;
  ctx.fillStyle = "#1f2937"; ctx.textAlign = "center"; ctx.font = "bold 16px sans-serif";
  ctx.fillText(`${d.tuyen} (${d.roadClass}), ${vn(area, 2)} m²`, mL + pw / 2, mT + ph2 / 2 - 4);
  ctx.font = "14px sans-serif"; ctx.fillStyle = "#5b6676";
  ctx.fillText("Mặt đường: " + I.surface, mL + pw / 2, mT + ph2 / 2 + 16);
  return cv.toDataURL("image/png");
}

/**
 * Mô phỏng 3D phối cảnh ban đêm — DATA-DRIVEN: mặt đường được tô từ chính
 * lưới độ rọi E đã tính (chiếu ngược từng pixel → toạ độ đường → lấy E, lặp theo nhịp).
 * Kèm thang màu lx. Đây là bản đồ kết quả thật trong phối cảnh, không phải minh hoạ.
 */
export function perspective3DDataURL(d, result, doc = globalThis.document) {
  const I = d.install, W = I.width || 7, S = I.spacing || 30, H = I.H || 9, ov = I.overhang || 0;
  const two = /đối xứng|doi xung|so le|staggered|opposite/i.test(I.arrangement || "");
  const stag = /so le|staggered/i.test(I.arrangement || "");
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
  // thang màu "đêm": nhựa tối → hổ phách → trắng ấm (theo t = E/Emax)
  const ramp = (t) => {
    t = Math.max(0, Math.min(1, t));
    const st = [[0, [38, 41, 47]], [0.25, [92, 78, 54]], [0.55, [214, 160, 86]], [0.8, [255, 212, 140]], [1, [255, 246, 215]]];
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

  // --- mặt đường: tô từng pixel theo E thật ---
  const img = ctx.getImageData(0, 0, CW, CH); const px = img.data;
  const y0 = Math.ceil(horizonY) + 1;
  for (let sy = y0; sy < CH; sy++) {
    const xw = f * hCam / (sy - horizonY) - d0;        // khoảng cách dọc đường
    if (xw < 0 || xw > Xfar) continue;
    const kx = (xw + d0) / f;
    for (let sx = 0; sx < CW; sx++) {
      const yLat = (sx - cx) * kx;
      if (yLat < -W / 2 || yLat > W / 2) continue;
      const E = sampleE(xw, yLat + W / 2);
      const c = ramp((E - Emin) / Math.max(1e-6, Emax - Emin)); // giãn Emin→Emax cho rõ vũng sáng/tối
      const o = (sy * CW + sx) * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // --- vạch mép & vạch làn (mờ, để lộ dữ liệu) ---
  for (const s of [-1, 1]) {
    const a = proj(0, s * W / 2), b = proj(Xfar, s * W / 2);
    ctx.strokeStyle = "rgba(240,242,246,0.75)"; ctx.lineWidth = Math.max(0.8, a.s * 0.1);
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  }
  const lanes = I.lanes || 2;
  for (let l = 1; l < lanes; l++) {
    const yl = -W / 2 + W * l / lanes;
    for (let x = 2; x < Xfar; x += 8) {
      const p1 = proj(x, yl), p2 = proj(x + 4, yl);
      ctx.strokeStyle = "rgba(235,238,243,0.55)"; ctx.lineWidth = Math.max(0.5, p1.s * 0.09);
      ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.stroke();
    }
  }

  // --- trụ + cần + đèn (vẽ xa trước) ---
  const sb3 = (I.setback != null && isFinite(I.setback)) ? Math.max(0, I.setback) : 0.5;
  const poles = [];
  for (let k = 0; k <= Math.floor(Xfar / S) + 1; k++) {
    poles.push({ x: k * S, poleLat: -(W / 2 + sb3), lampLat: ov - W / 2 });                       // hàng gần: trụ ngoài mép
    if (two) poles.push({ x: k * S + (stag ? S / 2 : 0), poleLat: W / 2 + sb3, lampLat: W / 2 - ov }); // hàng xa
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
    lg.addColorStop(0, "rgba(255,244,210,0.8)"); lg.addColorStop(0.5, "rgba(255,222,150,0.28)"); lg.addColorStop(1, "rgba(255,210,120,0)");
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = lg;
    ctx.beginPath(); ctx.arc(lamp.sx, lamp.sy, lr * 2.2, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
    ctx.fillStyle = "#fff4d6"; ctx.beginPath(); ctx.arc(lamp.sx, lamp.sy, lr * 0.8, 0, 2 * Math.PI); ctx.fill();
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
const vn = (x, d = 2) => (x == null || !isFinite(x)) ? "—" : Number(x).toFixed(d).replace(".", ",");

/** Cắt chữ bằng "…" cho vừa bề rộng maxW (mm) ở cỡ chữ hiện tại. */
function fitText(doc, txt, maxW) {
  let s = String(txt ?? "");
  if (doc.getTextWidth(s) <= maxW) return s;
  const ell = "…";
  while (s.length > 1 && doc.getTextWidth(s + ell) > maxW) s = s.slice(0, -1);
  return s + ell;
}

function drawTable(doc, x, y, cols, rows, opt = {}) {
  const rh = opt.rh || 7, fs = opt.fs || 9;
  let cy = y;
  rows.forEach((row, ri) => {
    let cx = x;
    const head = ri === 0 && opt.header;
    cols.forEach((w, ci) => {
      doc.setDrawColor(200); doc.setFillColor(head ? 235 : 255, head ? 238 : 255, head ? 244 : 255);
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

/** Tạo doc jsPDF đã nạp font Unicode (dùng chung cho báo cáo nhiều trang). */
export function makeDoc({ jsPDF, font }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.addFileToVFS(font.vfs, font.b64); doc.addFont(font.vfs, font.name, "normal"); doc.setFont(font.name);
  return doc;
}

/** Vẽ 1 trang báo cáo cho 1 tuyến lên trang hiện tại của doc. */
export function renderRoadPage(doc, { input, result, ph, meta, makeIntensity }) {
  const d = reportData(input, result, ph, meta);
  const M = 14, W = 210; let y = 16;

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
    doc.addImage(p3, "PNG", M, y, pw3, ph3);
    doc.setFontSize(7.4); doc.setTextColor(120, 130, 145);
    doc.text("Phối cảnh minh hoạ — độ sáng vũng đèn theo độ rọi trung bình Eav = " + vn(result.E.avg, 1) + " lx.", M, y + ph3 + 3.5);
    doc.setTextColor(30, 30, 40);
    y += ph3 + 7;
  } catch (_) { y += 2; }

  // Mặt bằng bố trí
  if (y + 78 > 284) { doc.addPage(); y = 16; }
  doc.setFontSize(10.5); doc.text("Mặt bằng bố trí", M, y); y += 3;
  try {
    const plan = planDataURL(d, globalThis.document);
    const pw = 150, phh = pw * 400 / 760;
    doc.addImage(plan, "PNG", M, y, pw, phh);
    y += phh + 5;
  } catch (_) { y += 2; }

  // Thông số bộ đèn + Polar LDC
  if (y + 72 > 284) { doc.addPage(); y = 16; }
  doc.setFontSize(10.5); doc.text("Thông số bộ đèn", M, y); y += 2;
  const L = d.luminaire;
  const yAfter = drawTable(doc, M, y, [46, 56], [
    [{ t: "Nhà cung cấp", c: [90, 100, 120] }, L.ncc || "—"],
    ["Mã bộ đèn", L.articleNo || "—"],
    ["Tên bộ đèn", L.articleName || L.model || "—"],
    ["Fitting", L.fitting || "—"],
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
    doc.addImage(polar, "PNG", M + 112, y, 54, 54);
    doc.setFontSize(8); doc.setTextColor(90, 100, 120);
    doc.text("Polar LDC — đỏ: C0-C180, xanh: C90-C270 (cd/klm)", M + 108, y + 58);
    doc.setTextColor(30, 30, 40);
  } catch (_) {}
  y = Math.max(yAfter, y + 62) + 4;

  // Thông số lắp đặt (bố cục kiểu DIALux: toàn chiều rộng) + Imax + hình cần đèn
  const I = d.install, en = d.energy;
  const i70 = maxIntensityPerKlm(ph, makeIntensity, 70);
  const i80 = maxIntensityPerKlm(ph, makeIntensity, 80);
  const i90 = maxIntensityPerKlm(ph, makeIntensity, 90);
  const arrText = /đối xứng|doi xung/i.test(I.arrangement) ? "hai bên đối diện"
    : /so le|staggered/i.test(I.arrangement) ? "hai bên so le"
    : /giữa/i.test(I.arrangement) ? "trên dải phân cách" : "một bên";
  if (y + 70 > 284) { doc.addPage(); y = 16; }
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
    ["Trụ → mép đường (setback)", vn(I.setback, 2) + " m"],
    ["Tiêu thụ / tuyến", vn(en.Wkm, 0) + " W/km"],
    ["ULR / ULOR", "0,00 / 0,00"],
    [{ t: "Cường độ sáng max ≥ 70°", c: [40, 46, 58] }, vn(i70, 0) + " cd/klm"],
    ["Cường độ sáng max ≥ 80°", vn(i80, 0) + " cd/klm"],
    ["Cường độ sáng max ≥ 90°", vn(i90, 1) + " cd/klm"],
    ["Phân cấp cường độ sáng", "–"],
    ["Hệ số bảo trì MF", vn(I.MF, 2)],
  ], { rh: 6.0, fs: 8.3 });
  try { doc.addImage(armDataURL(d, globalThis.document), "PNG", M + Lcol + Vcol + 6, y - 1, 48, 38); } catch (_) {}
  doc.setFontSize(7.2); doc.setTextColor(120, 130, 145);
  doc.text("Imax: cường độ lớn nhất ở góc nêu (so với phương", M + Lcol + Vcol + 6, y + 42);
  doc.text("thẳng đứng), quy về cd trên 1000 lm quang thông.", M + Lcol + Vcol + 6, y + 46);
  doc.setTextColor(30, 30, 40);
  y = yI + 4;
  doc.setFontSize(7.8); doc.setTextColor(90, 100, 120);
  doc.text("Mặt đường: " + I.surface + (d.autoSelect ? "   ·   bộ đèn do app tự chọn" : ""), M, y);
  doc.setTextColor(30, 30, 40); y += 6;

  // Bảng đánh giá
  if (y + 48 > 284) { doc.addPage(); y = 16; }
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
  doc.setTextColor(30, 30, 40); y += 5;

  // Chỉ số năng lượng
  if (y + 24 > 286) { doc.addPage(); y = 16; }
  doc.setFontSize(10.5); doc.text("Chỉ số năng lượng", M, y); y += 2;
  y = drawTable(doc, M, y, [48, 42, 50, 40], [
    ["Mật độ công suất Dp", vn(en.Dp, 3) + " W/lx·m²", "Điện năng De", vn(en.De, 2) + " kWh/m²·yr"],
    ["Tiêu thụ tuyến", vn(en.Wkm, 0) + " W/km", "Điện năng/năm (1 nhịp)", vn(en.annualKwh, 1) + " kWh/yr"],
  ], { rh: 6.5, fs: 8.5 });
  y += 5;

  // Độ rọi
  doc.setFontSize(10.5); doc.text("Độ rọi ngang (maintenance) — lưới & phân bố", M, y); y += 3;
  try {
    const g = grid2D(result);
    const aspect = g.ys.length / g.xs.length;
    let iw = 118, ih = iw * aspect;
    const maxH = 50; if (ih > maxH) { ih = maxH; iw = ih / aspect; } // giới hạn chiều cao ảnh
    if (y + ih + 14 > 288) { doc.addPage(); y = 16; } // tránh tràn trang
    const fc = falseColorDataURL(result, globalThis.document);
    doc.addImage(fc, "PNG", M, y, iw, ih);
    doc.setFontSize(8); doc.text(`${vn(result.grid.S,0)} m × ${vn(result.grid.W,1)} m (dọc × ngang)`, M, y + ih + 4);
    const e = d.illum;
    drawTable(doc, M + iw + 6, y, [22, 20], [
      ["Eav", vn(e.Eav, 1)], ["Emin", vn(e.Emin, 2)], ["Emax", vn(e.Emax, 1)],
      ["Uo (g1)", vn(e.g1, 2)], ["g2", vn(e.g2, 2)],
    ], { rh: 6.5, fs: 8.5 });
    y += ih + 9;
  } catch (_) { y += 4; }

  // Observer
  if (y + 10 + d.observers.length * 6.5 > 286) { doc.addPage(); y = 16; } // tránh tràn trang
  doc.setFontSize(10.5); doc.text("Kết quả theo người quan sát", M, y); y += 2;
  const orows = [[{ t: "Observer (y, m)", a: "left" }, "Lav", "Uo", "Ul", "TI %"]];
  d.observers.forEach((o, i) => orows.push([`#${i + 1}  (y=${vn(o.y, 2)})`, vn(o.Lav), vn(o.Uo), vn(o.Ul), vn(o.TI, 0)]));
  y = drawTable(doc, M, y, [50, 30, 30, 30, 30], orows, { header: true, rh: 6.5, fs: 8.5 });

  doc.setFontSize(7.5); doc.setTextColor(120, 130, 145);
  doc.text("© 2026 maivulam · WebDialux-CS v1.1 · engine CIE 140 · bảng R3 CIE · TI theo Stiles-Holladay (xấp xỉ)", M, 290);
  return doc;
}

/** Báo cáo 1 trang cho 1 tuyến. */
export function buildRoadPdf({ jsPDF, input, result, ph, meta, makeIntensity, font }) {
  const doc = makeDoc({ jsPDF, font });
  renderRoadPage(doc, { input, result, ph, meta, makeIntensity });
  return doc;
}
