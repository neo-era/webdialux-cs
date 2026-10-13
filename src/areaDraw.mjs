// Vẽ mặt bằng chế độ "Khu vực tự do" lên canvas 2D — dùng chung cho màn hình (kéo/chọn trụ) và PDF.
// Toạ độ thế giới: x phải, y lên. Trả về phép biến đổi để trang web dò điểm bấm (toWorld/toScreen).

import { poleLamps } from "./area.mjs";

/** Điểm đầu mũi tên hướng chiếu của một đèn (m): từ vị trí đèn, dài ∝ H·tan(nghiêng), tối thiểu 3 m. */
export function lampHandle(p, l) {
  const a = (l.aim || 0) * Math.PI / 180, arm = l.arm || 0, H = l.H ?? p.H;
  const reach = Math.max(3, Math.min(40, H * Math.tan(Math.min(75, l.tilt || 0) * Math.PI / 180)));
  return [p.x + (arm + reach) * Math.cos(a), p.y + (arm + reach) * Math.sin(a)];
}

const STOPS = [[0, [34, 58, 140]], [0.28, [30, 150, 190]], [0.52, [90, 190, 90]], [0.76, [245, 200, 60]], [1, [230, 90, 50]]];
export function heatColor(t) {
  t = Math.max(0, Math.min(1, t));
  for (let k = 0; k < STOPS.length - 1; k++) if (t <= STOPS[k + 1][0]) {
    const u = (t - STOPS[k][0]) / (STOPS[k + 1][0] - STOPS[k][0]), A = STOPS[k][1], B = STOPS[k + 1][1];
    return [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * u));
  }
  return STOPS[STOPS.length - 1][1];
}

/** Khung bao (m) của trụ + vùng, thêm lề. */
export function worldBounds(poles, areas, pad = 3, objects = []) {
  const xs = [], ys = [];
  for (const o of objects || []) for (const [x, y] of o.pts || []) { const r = o.type === "tree" ? (o.crownR || 2) : 0; xs.push(x - r, x + r); ys.push(y - r, y + r); }
  for (const p of poles) { xs.push(p.x); ys.push(p.y); }
  for (const a of areas) {
    if (a.poly) for (const [x, y] of a.poly) { xs.push(x); ys.push(y); }
    else if (a.L > 0 && a.W > 0) { xs.push(a.x0 || 0, (a.x0 || 0) + a.L); ys.push(a.y0 || 0, (a.y0 || 0) + a.W); }
  }
  if (!xs.length) return { x0: -10, y0: -10, x1: 10, y1: 10 };
  return { x0: Math.min(...xs) - pad, y0: Math.min(...ys) - pad, x1: Math.max(...xs) + pad, y1: Math.max(...ys) + pad };
}

/**
 * Vẽ mặt bằng. opts: {sel (id trụ đang chọn), scaleE: [Emin, Emax] cho thang màu, dark (nền tối), grid (lưới 5 m), labels}
 * result: kết quả calcArea (có thể null — chỉ vẽ hình học).
 */
export function drawAreaPlan(ctx, Wpx, Hpx, { poles, areas, result = null, objects = [] }, opts = {}) {
  const b = opts.bounds || worldBounds(poles, areas, 3, objects);          // giữ khung cố định khi đang kéo trụ
  const k = opts.px || 1;                                   // hệ số điểm ảnh (devicePixelRatio / độ phân giải PDF)
  const m = 34 * k, sc = Math.min((Wpx - 2 * m) / (b.x1 - b.x0), (Hpx - 2 * m) / (b.y1 - b.y0));
  const ox = (Wpx - sc * (b.x1 - b.x0)) / 2, oy = (Hpx - sc * (b.y1 - b.y0)) / 2;
  const S = (x, y) => [ox + (x - b.x0) * sc, Hpx - oy - (y - b.y0) * sc];
  const toWorld = (px, py) => [b.x0 + (px - ox) / sc, b.y0 + (Hpx - oy - py) / sc];
  const C = opts.colors || { bg: "#ffffff", line: "#d8dee8", fg: "#1c2430", muted: "#5b6676", pole: "#1c2430", sel: "#f59e0b" };
  ctx.save();
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, Wpx, Hpx);
  // lưới 5 m
  if (opts.grid !== false) {
    ctx.strokeStyle = C.line; ctx.lineWidth = 0.6 * k;
    for (let x = Math.ceil(b.x0 / 5) * 5; x <= b.x1; x += 5) { const [sx] = S(x, 0); ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, Hpx); ctx.stroke(); }
    for (let y = Math.ceil(b.y0 / 5) * 5; y <= b.y1; y += 5) { const [, sy] = S(0, y); ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(Wpx, sy); ctx.stroke(); }
  }
  // độ rọi từng vùng
  let lo = Infinity, hi = -Infinity;
  if (result) for (const a of result.areas) if (!a.empty) { lo = Math.min(lo, a.Emin); hi = Math.max(hi, a.Emax); }
  if (opts.scaleE) [lo, hi] = opts.scaleE;
  const span = Math.max(1e-6, hi - lo);
  if (result) for (const a of result.areas) {
    if (a.empty) continue;
    const g = a.grid;
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const k = g.cell[j * g.nx + i]; if (k < 0) continue;
      const c = heatColor((a.E[k] - lo) / span);
      const [x1, y1] = S(g.x0 + g.dx * i, g.y0 + g.dy * (j + 1)), [x2, y2] = S(g.x0 + g.dx * (i + 1), g.y0 + g.dy * j);
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(x1, y1, x2 - x1 + 0.6, y2 - y1 + 0.6);
    }
  }
  // viền vùng + tên
  ctx.lineWidth = 1.6 * k; ctx.font = `${12 * k}px sans-serif`;
  areas.forEach((a, n) => {
    const pts = a.poly || [[a.x0 || 0, a.y0 || 0], [(a.x0 || 0) + a.L, a.y0 || 0], [(a.x0 || 0) + a.L, (a.y0 || 0) + a.W], [a.x0 || 0, (a.y0 || 0) + a.W]];
    ctx.strokeStyle = result ? "rgba(255,255,255,.95)" : C.fg; ctx.beginPath();
    pts.forEach(([x, y], i) => { const [sx, sy] = S(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.closePath(); ctx.stroke();
    if (opts.labels !== false) {                                   // tên vùng: góc trên-trái, bên trong vùng
      const tx = Math.min(...pts.map((q) => q[0])), ty = Math.max(...pts.map((q) => q[1]));
      const [sx, sy] = S(tx, ty);
      ctx.font = `600 ${12 * k}px sans-serif`; ctx.textAlign = "left";
      const label = a.name || `Vùng ${n + 1}`, w = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(255,255,255,.82)"; ctx.fillRect(sx + 4 * k, sy + 4 * k, w + 8 * k, 17 * k);
      ctx.fillStyle = "#1c2430"; ctx.fillText(label, sx + 8 * k, sy + 17 * k);
    }
  });
  // vật thể: tòa nhà (đa giác), tường rào (đường dày), cây (vòng tán) + nét đang vẽ
  for (const o of objects || []) {
    const sel = o.id === opts.selObj;
    ctx.setLineDash([]);
    if (o.type === "building") {
      ctx.beginPath(); o.pts.forEach(([x, y], i) => { const [sx, sy] = S(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); }); ctx.closePath();
      ctx.fillStyle = sel ? "rgba(245,158,11,0.35)" : "rgba(92,104,122,0.55)"; ctx.fill();
      ctx.strokeStyle = sel ? "#f59e0b" : "#3b4554"; ctx.lineWidth = (sel ? 2.6 : 1.6) * k; ctx.stroke();
      if (opts.labels !== false) { o.pts.forEach(([x, y], i) => { const [x2, y2] = o.pts[(i + 1) % o.pts.length], [sx, sy] = S((x + x2) / 2, (y + y2) / 2);
        ctx.fillStyle = "#fff"; ctx.font = `600 ${9.5 * k}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(String(i + 1), sx, sy + 3 * k); }); }
    } else if (o.type === "wall") {
      ctx.beginPath(); o.pts.forEach(([x, y], i) => { const [sx, sy] = S(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
      ctx.strokeStyle = sel ? "#f59e0b" : "#8a5a12"; ctx.lineWidth = Math.max(3 * k, 0.25 * sc); ctx.lineCap = "round"; ctx.stroke(); ctx.lineCap = "butt";
    } else if (o.type === "tree") {
      const [sx, sy] = S(o.pts[0][0], o.pts[0][1]), r = Math.max(4 * k, (o.crownR || 2) * sc);
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, 2 * Math.PI); ctx.fillStyle = sel ? "rgba(245,158,11,0.35)" : "rgba(64,140,72,0.45)"; ctx.fill();
      ctx.strokeStyle = sel ? "#f59e0b" : "#2f6b36"; ctx.lineWidth = (sel ? 2.4 : 1.4) * k; ctx.stroke();
      ctx.fillStyle = "#4a3a2a"; ctx.beginPath(); ctx.arc(sx, sy, 2.5 * k, 0, 2 * Math.PI); ctx.fill();
    }
    if (opts.labels !== false) { const [cx, cy] = o.pts.reduce((a, p) => [a[0] + p[0] / o.pts.length, a[1] + p[1] / o.pts.length], [0, 0]), [sx, sy] = S(cx, cy);
      ctx.font = `bold ${10.5 * k}px sans-serif`; ctx.textAlign = "center"; const w = ctx.measureText(o.id).width;
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fillRect(sx - w / 2 - 3 * k, sy - 10 * k - (o.type === "tree" ? 0 : 4 * k), w + 6 * k, 13 * k);
      ctx.fillStyle = "#1c2430"; ctx.fillText(o.id, sx, sy - (o.type === "tree" ? 0 : 4 * k)); }
  }
  if (opts.draft && opts.draft.pts.length) {
    const d = opts.draft; ctx.setLineDash([6 * k, 4 * k]); ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 2 * k;
    ctx.beginPath(); [...d.pts, ...(d.hover ? [d.hover] : [])].forEach(([x, y], i) => { const [sx, sy] = S(x, y); i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    if (d.type === "building" && d.pts.length > 2) ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#f59e0b"; for (const [x, y] of d.pts) { const [sx, sy] = S(x, y); ctx.beginPath(); ctx.arc(sx, sy, 3.5 * k, 0, 2 * Math.PI); ctx.fill(); }
  }
  // trụ + hướng chiếu từng đèn (đoạn dài ∝ H·tan(nghiêng), tối thiểu 3 m); đèn chọn tô đậm
  for (const p of poles) {
    const sel = p.id === opts.sel, L = poleLamps(p);
    const [px, py] = S(p.x, p.y);
    L.forEach((l, i) => {
      const [ax, ay] = S(...lampHandle(p, l));
      const hot = sel && opts.selLamp === i;
      ctx.strokeStyle = !l.ies ? "#c0392b" : sel ? (hot ? "#c2410c" : C.sel) : (result ? "#ffffff" : C.fg);
      ctx.lineWidth = (hot ? 2.8 : 1.8) * k; ctx.setLineDash([5 * k, 4 * k]);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ax, ay); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(ax, ay, (hot ? 4.5 : 3) * k, 0, 2 * Math.PI); ctx.fill();
      if (sel && L.length > 1) { ctx.font = `bold ${10 * k}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(String(i + 1), ax, ay - 7 * k); }
    });
    const missing = !L.length || L.some((l) => !l.ies);
    ctx.fillStyle = sel ? C.sel : (missing ? "#c0392b" : C.pole); ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.arc(px, py, (sel ? 8 : 6.5) * k, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.fg; ctx.font = `bold ${11.5 * k}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText(p.id, px, py - 11 * k);
  }
  // thước tỉ lệ
  const bar = [1, 2, 5, 10, 20, 50, 100].find((v) => v * sc > 60 * k) || 100;
  const [bx, by] = [m * 0.6, Hpx - 12 * k];
  ctx.strokeStyle = C.fg; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bar * sc, by); ctx.stroke();
  ctx.fillStyle = C.muted; ctx.font = `${11 * k}px sans-serif`; ctx.textAlign = "left"; ctx.fillText(`${bar} m`, bx + bar * sc + 5 * k, by + 4 * k);
  ctx.restore();
  return { toScreen: S, toWorld, scale: sc, range: [lo, hi], bounds: b };
}
