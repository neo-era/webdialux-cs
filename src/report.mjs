// Tạo báo cáo PDF kiểu DIALux cho 1 tuyến/phương án.
// Phần thuần dữ liệu (reportData) test được ở Node; phần vẽ canvas + jsPDF chạy ở trình duyệt.

/** Gom dữ liệu báo cáo (thuần, không phụ thuộc DOM). */
export function reportData(input, result, ph, meta = {}) {
  const req = result.req, road = result.road, c = result.checks;
  const eff = ph.totalLumens && ph.inputWatts ? ph.totalLumens / ph.inputWatts : null;
  const checkRow = (sym, calc, target, ok, unit = "") => ({ sym, calc, target, ok, unit });
  return {
    tuyen: meta.tuyen || "", roadClass: result.roadClass,
    autoClass: !!meta.autoClass, autoSelect: !!meta.autoSelect, classSource: meta.classSource || "",
    luminaire: {
      model: meta.model || "", fitting: meta.fitting || "", ncc: meta.ncc || "",
      P: ph.inputWatts, lumens: ph.totalLumens, efficacy: eff, iesName: meta.iesName || "",
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
  const cv = doc.createElement("canvas"); cv.width = 760; cv.height = 360;
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  const mL = 70, mR = 40, mT = 40, mB = 56;
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
  // trụ + đèn: hàng gần tại y=overhang, hàng xa tại y=W-overhang
  const pole = (xx, yy) => {
    ctx.fillStyle = "#4b5563"; ctx.beginPath(); ctx.arc(xx, yy, 5, 0, 2 * Math.PI); ctx.fill();
    ctx.strokeStyle = "#4b5563"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, Y(ov) < yy ? Y(ov) - 14 : Y(ov) + 14); ctx.stroke();
  };
  const near = (k) => pole(X(k * S), Y(ov));
  const far = (k, off = 0) => pole(X(k * S + off), Y(W - ov));
  for (let k = 0; k <= 1; k++) { near(k); if (two) far(k, stag ? S / 2 : 0); }
  if (stag) far(0, -S / 2);
  // kích thước S (dưới) và W (phải)
  ctx.strokeStyle = "#1f2937"; ctx.fillStyle = "#1f2937"; ctx.lineWidth = 1; ctx.font = "16px sans-serif";
  const yb = mT + ph2 + 26;
  ctx.beginPath(); ctx.moveTo(mL, yb); ctx.lineTo(mL + pw, yb); ctx.stroke();
  ctx.textAlign = "center"; ctx.fillText(vn(S, 1) + " m", mL + pw / 2, yb + 18);
  const xr = mL + pw + 20;
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

function drawTable(doc, x, y, cols, rows, opt = {}) {
  const rh = opt.rh || 7, fs = opt.fs || 9;
  doc.setFontSize(fs);
  let cy = y;
  rows.forEach((row, ri) => {
    let cx = x;
    const head = ri === 0 && opt.header;
    cols.forEach((w, ci) => {
      doc.setDrawColor(200); doc.setFillColor(head ? 235 : 255, head ? 238 : 255, head ? 244 : 255);
      doc.rect(cx, cy, w, rh, "FD");
      const cell = row[ci];
      const txt = cell == null ? "" : String(cell.t != null ? cell.t : cell);
      const align = (cell && cell.a) || (ci === 0 ? "left" : "right");
      doc.setTextColor(cell && cell.c ? cell.c[0] : 30, cell && cell.c ? cell.c[1] : 30, cell && cell.c ? cell.c[2] : 40);
      const tx = align === "left" ? cx + 2 : (align === "center" ? cx + w / 2 : cx + w - 2);
      doc.text(txt, tx, cy + rh - 2.2, { align });
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

  doc.setFontSize(14); doc.text("WebDialux-CS — Báo cáo chiếu sáng (QCVN 07-7:2023)", M, y); y += 7;
  doc.setFontSize(11);
  doc.setTextColor(...(d.pass ? [31, 138, 76] : [192, 57, 43]));
  const clsNote = d.classSource === "loại tuyến" ? " (theo loại tuyến)" : d.classSource === "hình học" ? " (tự xác định)" : "";
  const clsLbl = d.roadClass + clsNote;
  doc.text(`Tuyến: ${d.tuyen}    Cấp đường: ${clsLbl}    Kết luận: ${d.pass ? "ĐẠT" : "KHÔNG ĐẠT"}`, M, y);
  doc.setTextColor(30, 30, 40); y += 8;

  // Mặt bằng bố trí
  doc.setFontSize(10.5); doc.text("Mặt bằng bố trí", M, y); y += 3;
  try {
    const plan = planDataURL(d, globalThis.document);
    const pw = 150, phh = pw * 360 / 760;
    doc.addImage(plan, "PNG", M, y, pw, phh);
    y += phh + 5;
  } catch (_) { y += 2; }

  // Thông số bộ đèn + Polar LDC
  doc.setFontSize(10.5); doc.text("Thông số bộ đèn", M, y); y += 2;
  const L = d.luminaire;
  const yAfter = drawTable(doc, M, y, [40, 60], [
    [{ t: "Loại đèn", c: [90, 100, 120] }, L.model],
    ["Fitting", L.fitting],
    ["Nhà cung cấp", L.ncc],
    ["Công suất P", vn(L.P, 1) + " W"],
    ["Quang thông", vn(L.lumens, 0) + " lm"],
    ["Hiệu suất", vn(L.efficacy, 1) + " lm/W"],
  ], { rh: 6.5, fs: 9 });
  try {
    const polar = polarDataURL(ph, makeIntensity, globalThis.document);
    doc.addImage(polar, "PNG", M + 108, y, 56, 56);
    doc.setFontSize(8); doc.text("Polar LDC — đỏ: C0-C180, xanh: C90-C270", M + 108, y + 60);
  } catch (_) {}
  y = Math.max(yAfter, y + 62) + 4;

  // Lắp đặt + cường độ + hình cần đèn
  const I = d.install, en = d.energy;
  const i70 = maxIntensityPerKlm(ph, makeIntensity, 70);
  const i80 = maxIntensityPerKlm(ph, makeIntensity, 80);
  const i90 = maxIntensityPerKlm(ph, makeIntensity, 90);
  if (y + 46 > 282) { doc.addPage(); y = 16; }
  doc.setFontSize(10.5); doc.text("Thông số lắp đặt", M, y); y += 2;
  const yI = drawTable(doc, M, y, [46, 32, 34, 20], [
    ["Khoảng cột", vn(I.spacing, 1) + " m", "Bề rộng", vn(I.width, 1) + " m"],
    ["(1) Độ cao H", vn(I.H, 1) + " m", "Số làn", String(I.lanes)],
    ["(2) Vươn điểm sáng", vn(I.overhang, 2) + " m", "Bố trí", I.arrangement],
    ["(3) Góc nghiêng", vn(I.tilt, 0) + "°", "(4) Cần", vn(I.boomLength, 2) + " m"],
    ["Trụ→mép (setback)", vn(I.setback, 2) + " m", "MF", vn(I.MF, 2)],
    ["Tiêu thụ", vn(en.Wkm, 0) + " W/km", "ULR/ULOR", "0,00/0,00"],
  ], { rh: 6.3, fs: 8.3 });
  try { doc.addImage(armDataURL(d, globalThis.document), "PNG", M + 132, y - 1, 50, 40); } catch (_) {}
  const yJ = drawTable(doc, M + 132, y + 41, [28, 22], [
    [{ t: "Cường độ max", c: [90, 100, 120] }, { t: "cd/klm", a: "right" }],
    ["≥ 70°", vn(i70, 0)], ["≥ 80°", vn(i80, 0)], ["≥ 90°", vn(i90, 1)],
  ], { rh: 5.6, fs: 7.6 });
  y = Math.max(yI, yJ) + 3.5;
  doc.setFontSize(7.8); doc.setTextColor(90, 100, 120);
  doc.text("Mặt đường: " + I.surface + "   ·   File IES: " + L.iesName.replace(/_IESNA2002$/i, "") + (d.autoSelect ? "  (app tự chọn)" : ""), M, y);
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
