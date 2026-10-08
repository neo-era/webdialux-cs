// Tạo báo cáo PDF kiểu DIALux cho 1 tuyến/phương án.
// Phần thuần dữ liệu (reportData) test được ở Node; phần vẽ canvas + jsPDF chạy ở trình duyệt.

/** Gom dữ liệu báo cáo (thuần, không phụ thuộc DOM). */
export function reportData(input, result, ph, meta = {}) {
  const req = result.req, road = result.road, c = result.checks;
  const eff = ph.totalLumens && ph.inputWatts ? ph.totalLumens / ph.inputWatts : null;
  const checkRow = (sym, calc, target, ok, unit = "") => ({ sym, calc, target, ok, unit });
  return {
    tuyen: meta.tuyen || "", roadClass: result.roadClass,
    autoClass: !!meta.autoClass, autoSelect: !!meta.autoSelect,
    luminaire: {
      model: meta.model || "", fitting: meta.fitting || "", ncc: meta.ncc || "",
      P: ph.inputWatts, lumens: ph.totalLumens, efficacy: eff, iesName: meta.iesName || "",
    },
    install: {
      spacing: input.spacing, H: input.H, overhang: input.overhang, tilt: input.tilt,
      width: input.width, lanes: input.lanes, arrangement: input.arrangement, MF: input.MF ?? 0.8,
      surface: "CIE R3, q0 0,07",
    },
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
  const clsLbl = d.roadClass + (d.autoClass ? " (tự xác định)" : "");
  doc.text(`Tuyến: ${d.tuyen}    Cấp đường: ${clsLbl}    Kết luận: ${d.pass ? "ĐẠT" : "KHÔNG ĐẠT"}`, M, y);
  doc.setTextColor(30, 30, 40); y += 8;

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

  // Lắp đặt
  doc.setFontSize(10.5); doc.text("Thông số lắp đặt", M, y); y += 2;
  const I = d.install;
  y = drawTable(doc, M, y, [45, 40, 45, 40], [
    ["Khoảng cột", vn(I.spacing, 1) + " m", "Bề rộng lòng đường", vn(I.width, 1) + " m"],
    ["Độ cao đèn H", vn(I.H, 1) + " m", "Số làn xe", String(I.lanes)],
    ["Vươn cần (net)", vn(I.overhang, 2) + " m", "Bố trí trụ", I.arrangement],
    ["Góc nghiêng", vn(I.tilt, 0) + "°", "Hệ số bảo trì MF", vn(I.MF, 2)],
  ], { rh: 6.5, fs: 8.5 });
  y += 4.5;
  doc.setFontSize(7.8); doc.setTextColor(90, 100, 120);
  doc.text("Mặt đường: " + I.surface + "    ·    File IES: " + L.iesName.replace(/_IESNA2002$/i, "") + (d.autoSelect ? "  (app tự chọn)" : ""), M, y);
  doc.setTextColor(30, 30, 40); y += 6;

  // Bảng đánh giá
  doc.setFontSize(10.5); doc.text("Kết quả đánh giá", M, y); y += 2;
  const crows = [[{ t: "Chỉ tiêu", a: "left" }, { t: "Tính toán", a: "right" }, { t: "Yêu cầu", a: "right" }, { t: "Đạt", a: "center" }]];
  const op = { "Lav (Ltb)": "≥", "Uo": "≥", "Ul": "≥", "TI": "≤", "SR": "≥" };
  for (const r of d.checks) crows.push([
    r.sym,
    vn(r.calc, r.sym === "TI" ? 0 : 2) + (r.unit ? " " + r.unit : ""),
    (op[r.sym] || "") + " " + vn(r.target, r.sym === "TI" ? 0 : 2) + (r.unit ? " " + r.unit : ""),
    { t: r.ok ? "✓" : "✗", a: "center", c: r.ok ? [31, 138, 76] : [192, 57, 43] },
  ]);
  y = drawTable(doc, M, y, [45, 48, 48, 24], crows, { header: true, rh: 7, fs: 9 });
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
  doc.text("© 2026 maivulam · WebDialux-CS v1.0 · engine CIE 140 · bảng R3 CIE · TI theo Stiles-Holladay (xấp xỉ)", M, 290);
  return doc;
}

/** Báo cáo 1 trang cho 1 tuyến. */
export function buildRoadPdf({ jsPDF, input, result, ph, meta, makeIntensity, font }) {
  const doc = makeDoc({ jsPDF, font });
  renderRoadPage(doc, { input, result, ph, meta, makeIntensity });
  return doc;
}
