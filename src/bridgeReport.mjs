// Báo cáo PDF chế độ Cầu: mỗi cầu 3 trang — (1) thông số + mặt cắt + kết quả đánh giá, (2) trắc dọc + mặt bằng + bảng ô tính,
// (3) phối cảnh 3D + bộ đèn (biểu đồ cường độ). Ảnh vẽ bằng chính các hàm màn hình (bridgeDraw.mjs).
import { drawCrossSection, drawProfile, drawPlan, drawBridge3D } from "./bridgeDraw.mjs";
import { POLE_SITES } from "./bridge.mjs";
import { vn, fitText, drawTable, polarDataURL } from "./report.mjs";
import { makeIntensity } from "./ies.mjs";
import { arrangementLabel } from "./geometry.mjs";

const OK = [31, 138, 76], BAD = [192, 57, 43], MUT = [110, 120, 135];

function canvasURL(doc0, W, H, fn, type = "image/png", q) {
  const cv = doc0.createElement("canvas"); cv.width = W; cv.height = H; fn(cv.getContext("2d")); return cv.toDataURL(type, q);
}
function head(doc, b, page) {
  if (page) doc.addPage();
  doc.setFontSize(7.8); doc.setTextColor(...MUT);
  doc.text(fitText(doc, (b.name || "Cầu") + "  ·  Báo cáo tính toán chiếu sáng mặt cầu (QCVN 07-7:2023 · TCVN 13608:2023)", 182), 14, 10);
  doc.setTextColor(30, 30, 40);
  return 16;
}
const h2 = (doc, t, y) => { doc.setFontSize(11.5); doc.setTextColor(31, 78, 121); doc.text(t, 14, y + 4.5); doc.setTextColor(30, 30, 40); return y + 7; };

/** Vẽ báo cáo 1 cầu từ trang hiện tại (trang đầu dùng trang đang mở nếu first=true). Trả số trang đầu. */
export function renderBridgePdf(doc, { b, r, ies, iesName, power, first = true, date = new Date(), dom = globalThis.document }) {
  const G = r.geometry, M = 14;
  let y = head(doc, b, !first);
  const firstPage = doc.getCurrentPageInfo().pageNumber;
  doc.setFontSize(15); doc.text(fitText(doc, b.name || "Cầu", 182), M, y + 2); y += 8;
  doc.setFontSize(9); doc.setTextColor(...MUT);
  doc.text(`Ngày tính ${date.toLocaleDateString("vi-VN")} · cấp đường ${r.roadClass} · bộ đèn ${iesName || "—"}${power ? ` (${power} W)` : ""} · MF ${vn(r.MF, 2)} · q0 ${vn(r.q0, 2)}`, M, y); y += 5;
  doc.setTextColor(30, 30, 40);
  // kết luận
  doc.setFillColor(...(r.pass ? [227, 244, 234] : [251, 231, 228])); doc.roundedRect(M, y, 182, 9, 2, 2, "F");
  doc.setFontSize(11); doc.setTextColor(...(r.pass ? OK : BAD));
  doc.text(r.pass ? "ĐẠT — lòng đường theo QCVN 07-7:2023, lề bộ hành theo TCVN 13608:2023" : "KHÔNG ĐẠT — xem các chỉ tiêu đánh dấu đỏ", M + 3, y + 6.2);
  doc.setTextColor(30, 30, 40); y += 13;
  // mặt cắt
  y = h2(doc, "Mặt cắt ngang", y);
  const xs = canvasURL(dom, 1800, 720, (c) => drawCrossSection(c, 1800, 720, b, { px: 2 }));
  doc.addImage(xs, "PNG", M, y, 182, 72.8, undefined, "FAST"); y += 76;
  // thông số
  y = h2(doc, "Thông số hình học & lắp đặt", y);
  const T = [["Thông số", "Giá trị", "Thông số", "Giá trị"],
    ["Chiều dài cầu", `${vn(G.L, 1)} m`, "Bố trí trụ", arrangementLabel(G.kind === "center" ? "giữa" : b.arrangement)],
    ["Lòng đường · số làn", `${vn(G.W, 2)} m · ${G.lanes} làn`, "Vị trí trụ", POLE_SITES[b.site] || "—"],
    ["Dải phân cách", G.medianW > 0 ? `${vn(G.medianW, 2)} m` : "không", "Khoảng cách trụ", `${vn(G.S, 1)} m (trụ đầu cách mố ${vn(G.poleStart, 1)} m)`],
    ["Lề bộ hành mỗi bên", G.walk > 0 ? `${vn(G.walk, 2)} m` : "không", "Độ cao đèn H · vươn", `${vn(G.H, 1)} m · ${vn(G.arm, 2)} m`],
    ["Gờ chắn · lan can", `${vn(G.guard, 2)} m · cao ${vn(b.parapetH ?? 1.1, 2)} m`, "Nghiêng · xoay · số đèn/trụ", `${vn(G.tilt, 0)}° · ${vn(G.rot, 0)}° · ${G.perPole}`],
    ["Dốc dọc · R cong đứng", r.profile.flat ? "0 % (phẳng)" : `${vn(r.profile.grade, 2)} % · ${b.Rv > 0 ? vn(+b.Rv, 0) + " m" : "đỉnh gãy"}`, "Trụ → mép đường · vươn ra", `${vn(G.setback, 2)} m · ${vn(G.overhang, 2)} m`],
    ["Đỉnh cầu · chiều dài cong", r.profile.flat ? "—" : `+${vn(r.profile.crest, 2)} m · ${vn(r.profile.curveLen, 0)} m`, "Đường dẫn có chiếu sáng", G.approachLit ? "có" : "không"]];
  y = drawTable(doc, M, y, [36, 52, 44, 50], T.map((row, i) => row.map((c, k) => (i ? { t: c, a: "left" } : c))), { header: true, rh: 6, fs: 8.2 }) + 5;
  // đánh giá
  y = h2(doc, "Kết quả đánh giá", y);
  const q = r.req, c = r.checks, mk = (v) => (v == null ? { t: "không xét", a: "center", c: MUT } : { t: v ? "✓ Đạt" : "✗ Không", a: "center", c: v ? OK : BAD });
  const rows = [["Chỉ tiêu", "Tính toán", "Yêu cầu", "Kiểm tra", "Ô xấu nhất"],
    ["Ltb — độ chói trung bình (cd/m²)", vn(r.road.Lav, 2), `≥ ${vn(q.Ltb, 2)}`, mk(c.Ltb), `ô ${r.road.worstField.Lav + 1}`],
    ["Uo — độ đồng đều chung", vn(r.road.Uo, 2), `≥ ${vn(q.Uo, 2)}`, mk(c.Uo), `ô ${r.road.worstField.Uo + 1}`],
    ["Ul — độ đồng đều dọc", vn(r.road.Ul, 2), `≥ ${vn(q.Ul, 2)}`, mk(c.Ul), `ô ${r.road.worstField.Ul + 1}`],
    ["TI — tăng ngưỡng chói loá (%)", vn(r.road.TI, 0), `≤ ${q.TI}`, mk(c.TI), `ô ${r.road.worstField.TI + 1}`],
    ["SR — tỉ số vùng lân cận", r.road.SR == null ? "—" : vn(r.road.SR, 2), r.road.SR == null ? "không có lề" : `≥ ${vn(q.SR, 2)}`, mk(c.SR), ""],
  ];
  if (r.walk) {
    const w = r.walk;
    rows.push([`Lề bộ hành Eav (lx) — trái / phải`, `${vn(w.left.Eav, 1)} / ${vn(w.right.Eav, 1)}`, `≥ ${w.req.Eav}`, mk(Math.round(w.Eav * 100) / 100 + 1e-9 >= w.req.Eav), ""]);
    rows.push([`Lề bộ hành Uo — trái / phải`, `${vn(w.left.Uo, 2)} / ${vn(w.right.Uo, 2)}`, w.req.Uo != null ? `≥ ${vn(w.req.Uo, 2)}` : "—", mk(w.req.Uo == null ? null : Math.round(w.Uo * 100) / 100 >= w.req.Uo), ""]);
  }
  y = drawTable(doc, M, y, [70, 30, 30, 26, 26], rows.map((row, i) => row.map((cc, k) => (i && k === 0 ? { t: cc, a: "left" } : cc))), { header: true, rh: 6.2, fs: 8.4 }) + 3;
  doc.setFontSize(7.4); doc.setTextColor(...MUT);
  const notes = [`Lòng đường tính trên ${r.fields.length} ô (mỗi ô một khoảng cột) dọc cầu, mỗi ô 3 điểm/làn theo EN 13201-3, người quan sát cách 60 m trên tim mỗi làn, bám cao độ mặt cầu; lấy ô xấu nhất.`,
    `Độ rọi, độ chói tính theo pháp tuyến mặt cầu tại từng điểm (bảng R3, q0 = ${vn(r.q0, 2)}); TI theo EN 13201-3 (giá trị ban đầu), hướng nhìn theo tiếp tuyến trắc dọc cúi 1°; tia bị đỉnh cầu che không tính.`,
    r.walk ? `Lề bộ hành: ${r.walk.req.label} (${r.walk.req.source}).` : "Không có lề bộ hành — không xét SR."];
  for (const t of [...notes, ...(r.warnings || []).map((w) => "⚠ " + w)]) { const L = doc.splitTextToSize(t, 182); doc.text(L, M, y + 2); y += 3.3 * L.length; }
  doc.setTextColor(30, 30, 40);

  // ---- trang 2: trắc dọc + mặt bằng + ô tính
  y = head(doc, b, true);
  y = h2(doc, "Trắc dọc & độ chói trung bình từng ô", y);
  const pf = canvasURL(dom, 2000, 640, (cx) => drawProfile(cx, 2000, 640, b, r, { px: 2 }));
  doc.addImage(pf, "PNG", M, y, 182, 58.2, undefined, "FAST"); y += 62;
  y = h2(doc, "Mặt bằng — độ rọi trên mặt cầu (lx)", y);
  let rng = null;
  const pl = canvasURL(dom, 2000, 600, (cx) => { rng = drawPlan(cx, 2000, 600, b, r, { px: 2 }); });
  doc.addImage(pl, "PNG", M, y, 182, 54.6, undefined, "FAST"); y += 57;
  doc.setFontSize(7.6); doc.setTextColor(...MUT);
  doc.text(`Thang màu ${vn(rng.lo, 1)} – ${vn(rng.hi, 1)} lx (xanh → đỏ). Khung vàng nét đứt: ô có Ltb thấp nhất. Chấm trắng: vị trí trụ.`, M, y + 1); y += 6;
  doc.setTextColor(30, 30, 40);
  y = h2(doc, "Kết quả từng ô dọc cầu", y);
  const fr = [["Ô", "Từ – đến x (m)", "Cao độ (m)", "Dốc (%)", "Ltb", "Uo", "Ul", "TI", "SR", "Eav (lx)", "Khuất"]];
  for (const f of r.fields) fr.push([String(f.f + 1), `${vn(f.x0, 1)} – ${vn(f.x1, 1)}`, vn(f.zMid, 2), vn(f.slopeMid * 100, 2),
    { t: vn(f.Lav, 2), c: Math.round(f.Lav * 100) / 100 >= r.req.Ltb ? [30, 30, 40] : BAD }, vn(f.Uo, 2), vn(f.Ul, 2), vn(f.TI, 0), f.SR == null ? "—" : vn(f.SR, 2), vn(f.E.avg, 1), f.hidden ? Math.round(f.hidden * 100) + " %" : "—"]);
  const widths = [9, 28, 18, 15, 16, 16, 16, 14, 16, 18, 16];
  let k = 0;
  while (k < fr.length - 1) {
    const room = Math.max(3, Math.floor((280 - y) / 5.4) - 1);
    const chunk = [fr[0], ...fr.slice(1 + k, 1 + k + room)];
    y = drawTable(doc, M, y, widths, chunk, { header: true, rh: 5.4, fs: 7.8, zebra: true }) + 3;
    k += room;
    if (k < fr.length - 1) y = head(doc, b, true);
  }

  // ---- trang 3: 3D + bộ đèn
  y = head(doc, b, true);
  y = h2(doc, "Phối cảnh 3D ban đêm", y);
  const v3 = canvasURL(dom, 2000, 1100, (cx) => drawBridge3D(cx, 2000, 1100, b, r, { px: 2.2, cam: b.cam || undefined }), "image/jpeg", 0.9);
  doc.addImage(v3, "JPEG", M, y, 182, 100.1, undefined, "FAST"); y += 104;
  doc.setFontSize(7.6); doc.setTextColor(...MUT); doc.text("Mặt cầu tô theo lưới độ rọi đã tính; trụ cầu, dầm chỉ minh hoạ.", M, y); y += 6; doc.setTextColor(30, 30, 40);
  if (ies) {
    y = h2(doc, "Bộ đèn", y);
    const L = [["Thông số", "Giá trị"], ["File IES", { t: iesName || "—", a: "left" }], ["Mô tả trong IES", { t: ies.luminaireName || (ies.keywords && ies.keywords.LUMINAIRE) || "—", a: "left" }],
      ["Công suất", power ? `${power} W` : "—"], ["Quang thông khai báo", ies.totalLumens ? `${vn(ies.totalLumens, 0)} lm` : "—"], ["Hệ số bảo trì MF", vn(r.MF, 2)]];
    drawTable(doc, M, y, [40, 72], L, { header: true, rh: 6.2, fs: 8.4 });
    try { const polar = polarDataURL(ies, makeIntensity, dom); doc.addImage(polar, "PNG", 132, y - 2, 64, 64, undefined, "FAST"); } catch { /* bỏ qua biểu đồ */ }
  }
  return firstPage;
}
