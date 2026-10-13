// Báo cáo PDF chế độ "Khu vực tự do": mặt bằng false-color + trụ, bảng kết quả theo yêu cầu, bảng trụ, bộ đèn, lưới giá trị.
import { drawAreaPlan, heatColor } from "./areaDraw.mjs";
import { vn, fitText, drawTable } from "./report.mjs";
import { luminaireLabel } from "./mapping.mjs";

const OK = [31, 138, 76], BAD = [192, 57, 43];

function header(doc, title) {
  doc.setFontSize(7.8); doc.setTextColor(120, 130, 145);
  doc.text(fitText(doc, title + "  ·  Báo cáo tính toán chiếu sáng khu vực", 182), 14, 10);
  doc.setTextColor(30, 30, 40);
  return 16;
}

/** Ảnh mặt bằng (PNG dataURL) cho PDF. */
export function areaPlanDataURL(state, result, doc = globalThis.document, W = 1400, H = 900) {
  const cv = doc.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  const v = drawAreaPlan(ctx, W, H, { poles: state.poles, areas: state.areas, result }, { labels: true, px: 2 });
  return { url: cv.toDataURL("image/png"), range: v.range };
}

/** Vẽ toàn bộ báo cáo khu vực vào doc (jsPDF, đã nạp font). */
export function renderAreaPdf(doc, { state, result, projectName = "", date = new Date() }) {
  const M = 14, title = projectName || "Khu vực";
  let y = 18;
  doc.setFontSize(15); doc.text(fitText(doc, title, 182), M, y); y += 6;
  doc.setFontSize(9.5); doc.setTextColor(90, 100, 115);
  doc.text("BÁO CÁO TÍNH TOÁN CHIẾU SÁNG KHU VỰC — độ rọi ngang duy trì (TCVN 13608:2023 / EN 12193)", M, y); y += 5;
  doc.text(`Ngày tính ${date.toLocaleDateString("vi-VN")} · ${result.nPoles} trụ · tổng công suất ${vn(result.power / 1000, 2)} kW`, M, y); y += 6;
  doc.setTextColor(30, 30, 40);

  // Kết quả theo vùng
  doc.setFontSize(11); doc.text("Kết quả đánh giá", M, y); y += 2;
  const rows = [["Vùng", "Eav (lx)", "Emin", "Emax", "Uo", "Ud", "Yêu cầu", "Đạt"]];
  for (const a of result.areas) rows.push([a.name, vn(a.Eav, 1), vn(a.Emin, 1), vn(a.Emax, 1), vn(a.Uo, 2), vn(a.Ud, 2),
    a.req ? `Eav ≥ ${a.req.Eav ?? "—"}${a.req.Uo != null ? ", Uo ≥ " + vn(a.req.Uo, 2) : ""}` : "—",
    a.req ? { t: a.pass ? "ĐẠT" : "KHÔNG ĐẠT", c: a.pass ? OK : BAD } : "—"]);
  y = drawTable(doc, M, y, [38, 18, 15, 15, 13, 13, 50, 20], rows, { header: true, rh: 6.4, fs: 8.4 }) + 4;
  doc.setFontSize(7.6); doc.setTextColor(110, 120, 135);
  for (const a of result.areas) if (a.req && a.req.label) { doc.text(fitText(doc, `${a.name}: ${a.req.label}`, 182), M, y); y += 3.6; }
  doc.text(`Uo = Emin/Eav; Ud = Emin/Emax. MF: ${[...new Set(result.areas.map((a) => vn(a.MF, 2)))].join(", ")}.`, M, y); y += 8;
  doc.setTextColor(30, 30, 40);

  // Mặt bằng
  doc.setFontSize(11); doc.text("Mặt bằng bố trí và độ rọi ngang [lx]", M, y); y += 2;
  const pw = 182, ph = pw * 900 / 1400;
  const { url, range } = areaPlanDataURL(state, result);
  doc.addImage(url, "PNG", M, y, pw, ph); y += ph + 2;
  // thang màu
  for (let k = 0; k < 40; k++) { const c = heatColor(k / 39); doc.setFillColor(c[0], c[1], c[2]); doc.rect(M + k * 2, y, 2.05, 3, "F"); }
  doc.setFontSize(7.6); doc.setTextColor(90, 100, 115);
  doc.text(`${vn(range[0], 0)} lx`, M, y + 6.5); doc.text(`${vn((range[0] + range[1]) / 2, 0)}`, M + 38, y + 6.5); doc.text(`${vn(range[1], 0)} lx`, M + 72, y + 6.5);
  doc.text("Chấm đỏ = trụ chưa có file IES. Đoạn nét đứt = hướng chiếu.", M + 95, y + 2.5);
  doc.setTextColor(30, 30, 40);

  // Trang 2: trụ + bộ đèn
  doc.addPage(); y = header(doc, title);
  doc.setFontSize(11); doc.text("Vị trí trụ đèn", M, y); y += 2;
  const prow = [["Trụ", "x (m)", "y (m)", "H (m)", "Hướng", "Nghiêng", "Số đèn", "Bộ đèn"]];
  for (const p of state.poles) prow.push([p.id, vn(p.x, 2), vn(p.y, 2), vn(p.H, 1), vn(p.aim, 0) + "°", vn(p.tilt, 0) + "°", String(p.n),
    p.ies ? luminaireLabel(p.ies.name) : { t: p.iesWant || "thiếu IES", c: BAD }]);
  y = drawTable(doc, M, y, [14, 17, 17, 14, 16, 16, 14, 74], prow, { header: true, rh: 6, fs: 8.2 }) + 6;

  const lum = new Map();
  for (const p of state.poles) if (p.ies) { const k = p.ies.name; const g = lum.get(k) || { ies: p.ies, n: 0 }; g.n += p.n; lum.set(k, g); }
  if (y > 240) { doc.addPage(); y = header(doc, title); }
  doc.setFontSize(11); doc.text("Bộ đèn sử dụng", M, y); y += 2;
  const lrow = [["Bộ đèn (tên file IES)", "Nhà SX", "P (W)", "Φ (lm)", "lm/W", "Số bộ", "Tổng (kW)"]];
  for (const g of lum.values()) {
    const ph2 = g.ies.ph, P = ph2.inputWatts || g.ies.power || 0, F = ph2.totalLumens || 0;
    lrow.push([luminaireLabel(g.ies.name), ph2.manufac || "—", vn(P, 1), vn(F, 0), P ? vn(F / P, 1) : "—", String(g.n), vn(g.n * P / 1000, 2)]);
  }
  y = drawTable(doc, M, y, [64, 30, 16, 18, 14, 14, 26], lrow, { header: true, rh: 6, fs: 8.2 }) + 6;

  // Lưới giá trị (vùng vừa trang)
  for (const a of result.areas) {
    const g = a.grid;
    if (a.empty) continue;
    if (g.nx > 16 || g.ny > 40) {
      if (y > 270) { doc.addPage(); y = header(doc, title); }
      doc.setFontSize(8); doc.setTextColor(110, 120, 135);
      doc.text(fitText(doc, `${a.name}: lưới ${g.nx} × ${g.ny} điểm (bước ${vn(g.dx, 2)} × ${vn(g.dy, 2)} m) — xem đầy đủ trong file Excel kết quả (sheet LUOI E).`, 182), M, y); y += 5;
      doc.setTextColor(30, 30, 40); continue;
    }
    const need = 8 + (g.ny + 1) * 5;
    if (y + need > 284) { doc.addPage(); y = header(doc, title); }
    doc.setFontSize(11); doc.text(`Lưới giá trị độ rọi — ${a.name} [lx]`, M, y); y += 2;
    const head = ["y \\ x"]; for (let i = 0; i < g.nx; i++) head.push(vn(g.x0 + g.dx * (i + 0.5), 1));
    const tr = [head];
    for (let j = g.ny - 1; j >= 0; j--) {
      const r = [vn(g.y0 + g.dy * (j + 0.5), 1)];
      for (let i = 0; i < g.nx; i++) { const k = g.cell[j * g.nx + i]; r.push(k >= 0 ? vn(a.E[k], 0) : ""); }
      tr.push(r);
    }
    const cw = Math.min(14, 168 / g.nx);
    y = drawTable(doc, M, y, [14, ...Array(g.nx).fill(cw)], tr, { header: true, rh: 5, fs: 7 }) + 5;
  }
}
