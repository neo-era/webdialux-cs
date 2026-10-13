// Hình vẽ chế độ Cầu (canvas 2D, dùng chung màn hình + PDF): mặt cắt ngang, trắc dọc (kèm Ltb từng ô), mặt bằng màu độ rọi,
// phối cảnh 3D ban đêm (vẽ theo lớp, mặt cầu tô theo lưới độ rọi đã tính).
import { bridgeGeometry, makeProfile, polePositions } from "./bridge.mjs";
import { heatColor } from "./areaDraw.mjs";
import { makeProjector } from "./areaView3D.mjs";
import { drawLuminaire3D } from "./lampGlyph.mjs";

const vn = (x, d = 1) => (x == null || !isFinite(x) ? "—" : Number(x).toFixed(d).replace(".", ","));
const NIGHT = { sky0: "#0b1726", sky1: "#132a42", water: "#0d2438", deck: "#5c6573", girder: "#3f4753", walk: "#9aa3af", guard: "#c9d0d9",
  road: "#2b3038", rail: "#cfd6df", pole: "#dfe4ea", lamp: "#ffd36b", dim: "#cfe2ff", mark: "#f4f6f8" };

/** Mặt cắt ngang có kích thước. opts.px: hệ số điểm ảnh. */
export function drawCrossSection(ctx, Wpx, Hpx, b, opts = {}) {
  const k = opts.px || 1, G = bridgeGeometry(b), C = NIGHT;
  const mW = G.kind === "center" ? G.medianW : (G.medianW || 0);
  const half = G.W / 2, outer = G.walk + G.guard + 0.5;
  const span = G.W + mW + 2 * outer + 1, sc = Math.min((Wpx - 30 * k) / span, (Hpx * 0.66) / (G.H + 2.4));
  const deckY = Hpx * 0.70, X = (y) => Wpx / 2 + (y - (G.W + mW) / 2) * sc;     // y thế giới (mặt cắt) → px; median chen vào giữa
  const yv = (y) => (y <= half ? y : y + mW);                                     // toạ độ lòng đường → toạ độ vẽ (cộng dải phân cách)
  const Z = (z) => deckY - z * sc;
  const g = ctx.createLinearGradient(0, 0, 0, Hpx); g.addColorStop(0, C.sky0); g.addColorStop(1, C.sky1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, Wpx, Hpx);
  ctx.fillStyle = C.water; ctx.fillRect(0, deckY + 2.6 * sc, Wpx, Hpx);
  // dầm
  const xl = X(-outer + 0.3), xr = X(G.W + mW + outer - 0.3);
  ctx.fillStyle = C.girder; ctx.beginPath(); ctx.moveTo(xl, Z(-0.2)); ctx.lineTo(xr, Z(-0.2)); ctx.lineTo(xr - 1.2 * sc, Z(-1.8)); ctx.lineTo(xl + 1.2 * sc, Z(-1.8)); ctx.closePath(); ctx.fill();
  // lòng đường + làn
  ctx.fillStyle = C.road; ctx.fillRect(X(0), Z(0.05), G.W * sc + mW * sc, 0.25 * sc);
  if (mW > 0) { ctx.fillStyle = C.guard; ctx.fillRect(X(half), Z(0.25), mW * sc, 0.45 * sc); }
  ctx.strokeStyle = C.mark; ctx.lineWidth = 1 * k; ctx.setLineDash([3 * k, 3 * k]);
  for (let l = 1; l < G.lanes; l++) { const y = yv(l * G.W / G.lanes); if (mW > 0 && Math.abs(l * G.W / G.lanes - half) < 1e-6) continue; ctx.beginPath(); ctx.moveTo(X(y), Z(0.05)); ctx.lineTo(X(y), Z(-0.2)); ctx.stroke(); }
  ctx.setLineDash([]);
  // lề bộ hành + gờ chắn + lan can hai bên
  for (const s of [-1, 1]) {
    const e = s < 0 ? 0 : G.W + mW;
    const gx0 = s < 0 ? e - G.guard : e, wx0 = s < 0 ? e - G.guard - G.walk : e + G.guard;
    if (G.guard > 0) { ctx.fillStyle = C.guard; ctx.fillRect(X(gx0), Z(0.3), G.guard * sc, 0.5 * sc); }
    if (G.walk > 0) { ctx.fillStyle = C.walk; ctx.fillRect(X(wx0), Z(0.2), G.walk * sc, 0.4 * sc); }
    const rx = s < 0 ? wx0 - 0.15 : wx0 + G.walk + 0.0;
    ctx.fillStyle = C.rail; ctx.fillRect(X(rx), Z((b.parapetH ?? 1.1) + 0.2), 0.15 * sc, ((b.parapetH ?? 1.1) + 0.4) * sc);
  }
  // trụ + cần + đèn + chùm sáng
  const poleAt = (y, dir) => {           // y toạ độ vẽ; dir = hướng vươn (+1 sang phải)
    const top = Z(G.H + 0.2), base = Z(0.2), lampX = X(y + dir * G.arm), lampY = Z(G.H);
    const gl = ctx.createLinearGradient(lampX, lampY, lampX, Z(0));
    gl.addColorStop(0, "rgba(255,211,107,0.42)"); gl.addColorStop(1, "rgba(255,211,107,0.04)");
    const reach = Math.max(2, G.H * Math.tan(Math.min(70, 35 + (G.tilt || 0)) * Math.PI / 180));
    ctx.fillStyle = gl; ctx.beginPath(); ctx.moveTo(lampX, lampY); ctx.lineTo(X(y + dir * (G.arm - 0.4 * reach)), Z(0.05)); ctx.lineTo(X(y + dir * (G.arm + reach)), Z(0.05)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = C.pole; ctx.lineWidth = 3 * k; ctx.beginPath(); ctx.moveTo(X(y), base); ctx.lineTo(X(y), top); ctx.quadraticCurveTo(X(y), Z(G.H + 0.7), lampX, lampY - 2 * k); ctx.stroke();
    ctx.fillStyle = C.lamp; ctx.fillRect(lampX - 6 * k, lampY - 3 * k, 12 * k, 4 * k);
  };
  if (G.kind === "center") { poleAt(half + mW / 2, -1); poleAt(half + mW / 2, +1); }
  else { poleAt(-G.setback, +1); if (G.kind !== "single") poleAt(G.W + mW + G.setback, -1); }
  // kích thước
  ctx.fillStyle = C.dim; ctx.font = `${11 * k}px ui-monospace,monospace`; ctx.textAlign = "center";
  const dimY = Z(-1.2);
  // nhãn kích thước: chọn chữ dài nhất vừa đoạn, không vừa thì bỏ (tránh chồng chữ ở màn hình hẹp)
  const dim = (y0, y1, ...opts) => { if (!(y1 > y0)) return; const w = X(y1) - X(y0) - 4 * k;
    const t = opts.find((o) => ctx.measureText(o).width <= w); if (t) ctx.fillText(t, (X(y0) + X(y1)) / 2, dimY); };
  if (G.walk > 0) { dim(-G.guard - G.walk, -G.guard, `lề ${vn(G.walk)}`, vn(G.walk)); dim(G.W + mW + G.guard, G.W + mW + G.guard + G.walk, `lề ${vn(G.walk)}`, vn(G.walk)); }
  if (mW > 0) { dim(0, half, `${vn(half)} m`, vn(half)); dim(half + mW, G.W + mW, `${vn(half)} m`, vn(half)); dim(half, half + mW, `dpc ${vn(mW)}`, vn(mW)); }
  else dim(0, G.W, `lòng đường ${vn(G.W)} m · ${G.lanes} làn`, `${vn(G.W)} m · ${G.lanes} làn`, `${vn(G.W)} m`);
  ctx.textAlign = "left";
  const py = G.kind === "center" ? half + mW / 2 : -G.setback;
  ctx.fillText(`H ${vn(G.H)} m`, X(py) + 6 * k, Z(G.H * 0.55));
  if (G.arm) ctx.fillText(`vươn ${vn(G.arm)}`, X(py) + 4 * k, Z(G.H + 1.1));
  return { sc };
}

/** Trắc dọc (phóng đại đứng) + vị trí trụ + dải Ltb từng ô dọc cầu (xanh = đạt, đỏ = không đạt). */
export function drawProfile(ctx, Wpx, Hpx, b, result = null, opts = {}) {
  const k = opts.px || 1, G = bridgeGeometry(b), C = NIGHT;
  const P = makeProfile({ length: G.L, grade: +b.grade || 0, Rv: +b.Rv || 0 });
  const pad = 0.08 * G.L, x0 = -pad, x1 = G.L + pad, band = result ? 34 * k : 0;
  const sx = (Wpx - 20 * k) / (x1 - x0), X = (x) => 10 * k + (x - x0) * sx;
  const zTop = Math.max(P.crest + G.H, G.H + 1), zBot = P.z(x0) - 3;
  const sz = (Hpx - band - 34 * k) / (zTop - zBot), Z = (z) => 26 * k + (zTop - z) * sz;
  const g = ctx.createLinearGradient(0, 0, 0, Hpx); g.addColorStop(0, C.sky0); g.addColorStop(1, C.sky1);
  ctx.fillStyle = g; ctx.fillRect(0, 0, Wpx, Hpx);
  ctx.fillStyle = C.water; ctx.fillRect(0, Z(-1.5), Wpx, Hpx - band - Z(-1.5));
  // mố + trụ cầu minh hoạ
  ctx.fillStyle = C.girder;
  for (const x of [0, G.L]) { ctx.beginPath(); ctx.moveTo(X(x) - 6 * k, Z(P.z(x) - 0.3)); ctx.lineTo(X(x) + 6 * k, Z(P.z(x) - 0.3)); ctx.lineTo(X(x) + 14 * k * (x ? 1 : -1), Z(-1.5)); ctx.lineTo(X(x), Z(-1.5)); ctx.closePath(); ctx.fill(); }
  const nSp = Math.max(1, Math.round(G.L / 40));
  for (let i = 1; i < nSp; i++) { const x = G.L * i / nSp; ctx.fillRect(X(x) - 3 * k, Z(P.z(x) - 0.4), 6 * k, Z(-1.5) - Z(P.z(x) - 0.4)); }
  // mặt cầu + đường dẫn
  ctx.strokeStyle = "#b9c0cb"; ctx.lineWidth = 4 * k; ctx.beginPath();
  for (let i = 0; i <= 300; i++) { const x = x0 + (x1 - x0) * i / 300; i ? ctx.lineTo(X(x), Z(P.z(x))) : ctx.moveTo(X(x), Z(P.z(x))); } ctx.stroke();
  // trụ đèn
  for (const p of polePositions(b)) {
    const z = P.z(p.x);
    ctx.strokeStyle = p.side === "far" ? "rgba(223,228,234,.55)" : C.pole; ctx.lineWidth = 1.6 * k;
    ctx.beginPath(); ctx.moveTo(X(p.x), Z(z)); ctx.lineTo(X(p.x), Z(z + G.H)); ctx.stroke();
    ctx.fillStyle = C.lamp; ctx.beginPath(); ctx.arc(X(p.x), Z(z + G.H), 3 * k, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.fillStyle = C.dim; ctx.font = `${11 * k}px ui-monospace,monospace`; ctx.textAlign = "left";
  const t = P.flat ? `Cầu phẳng · dài ${vn(G.L, 0)} m` : `Dốc ${vn(P.grade, 1)}% · ${b.Rv > 0 ? `R cong đứng ${vn(+b.Rv, 0)} m (dài ${vn(P.curveLen, 0)} m)` : "đỉnh gãy"} · đỉnh +${vn(P.crest, 2)} m · dài ${vn(G.L, 0)} m`;
  const tt = t + ` · trụ cách ${vn(G.S, 0)} m (${b.arrangement})`;
  for (let fs = 11; fs >= 7; fs -= 0.5) { ctx.font = `${fs * k}px ui-monospace,monospace`; if (ctx.measureText(tt).width <= Wpx - 20 * k) break; }
  ctx.fillText(tt, 10 * k, 15 * k);
  if (P.crest > 0) { ctx.fillStyle = "rgba(207,226,255,.6)"; ctx.fillText(`(phóng đại đứng ×${vn(sz / sx, 1)})`, 10 * k, 28 * k + 0); }
  // dải Ltb từng ô
  if (result && result.fields) {
    const y0 = Hpx - band + 4 * k, req = result.req.Ltb;
    ctx.fillStyle = "#0b1320"; ctx.fillRect(0, Hpx - band, Wpx, band);
    const mx = Math.max(...result.fields.map((f) => f.Lav), req) * 1.1;
    for (const f of result.fields) {
      const ok = Math.round(f.Lav * 100) / 100 >= req, h = (band - 14 * k) * f.Lav / mx;
      ctx.fillStyle = ok ? "rgba(73,192,125,.85)" : "rgba(240,115,103,.9)";
      ctx.fillRect(X(f.x0) + 1, y0 + (band - 14 * k) - h, Math.max(1, X(f.x1) - X(f.x0) - 2), h);
    }
    const ry = y0 + (band - 14 * k) * (1 - req / mx);
    ctx.strokeStyle = "#ffd36b"; ctx.setLineDash([4 * k, 3 * k]); ctx.lineWidth = 1 * k; ctx.beginPath(); ctx.moveTo(X(0), ry); ctx.lineTo(X(G.L), ry); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = C.dim; ctx.font = `${10 * k}px ui-monospace,monospace`;
    ctx.fillStyle = "rgba(11,19,32,.75)"; ctx.fillRect(6 * k, Hpx - 14 * k, ctx.measureText(`Ltb từng ô (cd/m²) · yêu cầu ≥ ${vn(req, 2)}`).width + 8 * k, 13 * k);
    ctx.fillStyle = C.dim; ctx.fillText(`Ltb từng ô (cd/m²) · yêu cầu ≥ ${vn(req, 2)}`, 10 * k, Hpx - 4 * k);
  }
}

/** Mặt bằng: lưới độ rọi mặt cầu (cả lề bộ hành), vạch làn, trụ, ô xấu nhất. Trả {lo, hi}. */
export function drawPlan(ctx, Wpx, Hpx, b, result, opts = {}) {
  const k = opts.px || 1, G = bridgeGeometry(b), pl = result && result.plan, dark = opts.dark !== false;
  ctx.fillStyle = dark ? "#121a24" : "#eef1f6"; ctx.fillRect(0, 0, Wpx, Hpx);
  const y0 = pl ? pl.y0 : -G.walk, y1 = pl ? pl.y1 : G.W + G.walk;
  const m = 30 * k, sx = (Wpx - 2 * m) / G.L, sy = Math.min((Hpx - 2 * m) / (y1 - y0 + 4), sx * (Wpx < 900 * k ? 7 : 3));
  const oy = Hpx / 2 + ((y0 + y1) / 2) * sy;
  const X = (x) => m + x * sx, Y = (y) => oy - y * sy;
  let lo = 0, hi = 1;
  if (pl) {
    let s = [...pl.E].sort((a, c) => a - c); lo = s[0]; hi = s[Math.floor(s.length * 0.99)] || s[s.length - 1];
    const span = Math.max(1e-6, hi - lo), dy = (pl.y1 - pl.y0) / pl.ny;
    for (let j = 0; j < pl.ny; j++) for (let i = 0; i < pl.nx; i++) {
      const c = heatColor((pl.E[j * pl.nx + i] - lo) / span);
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      const yc = pl.ys[j];
      ctx.fillRect(X(i * pl.dx), Y(yc + dy / 2), sx * pl.dx + 0.7, sy * dy + 0.7);
    }
  }
  // mép lòng đường, lề bộ hành, vạch làn
  ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.2 * k;
  for (const y of [0, G.W]) { ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(G.L), Y(y)); ctx.stroke(); }
  ctx.setLineDash([6 * k, 6 * k]); ctx.strokeStyle = "rgba(255,255,255,.55)";
  for (let l = 1; l < G.lanes; l++) { const y = l * G.W / G.lanes; ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(G.L), Y(y)); ctx.stroke(); }
  ctx.setLineDash([]);
  if (G.walk > 0) { ctx.fillStyle = "rgba(255,255,255,.10)"; ctx.fillRect(X(0), Y(-G.guard), G.L * sx, G.walk * sy); ctx.fillRect(X(0), Y(G.W + G.guard + G.walk), G.L * sx, G.walk * sy); }
  // ô xấu nhất (Ltb)
  if (result && result.fields && result.fields.length > 1) {
    const f = result.fields[result.road.worstField.Lav];
    ctx.strokeStyle = "#ffd36b"; ctx.lineWidth = 2 * k; ctx.setLineDash([5 * k, 3 * k]);
    ctx.strokeRect(X(f.x0), Y(G.W), (f.x1 - f.x0) * sx, G.W * sy); ctx.setLineDash([]);
  }
  // trụ
  const yPole = { near: -G.setback, far: G.W + G.setback, mid: G.W / 2 };
  for (const p of polePositions(b)) {
    const y = yPole[p.side];
    ctx.fillStyle = dark ? "#f4f6f8" : "#1c2430"; ctx.strokeStyle = dark ? "#121a24" : "#fff"; ctx.lineWidth = 1.5 * k;
    ctx.beginPath(); ctx.arc(X(p.x), Y(y), 4 * k, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  // thước
  const bar = [5, 10, 20, 50, 100].find((v) => v * sx > 70 * k) || 100;
  ctx.strokeStyle = dark ? "#cfe2ff" : "#1c2430"; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.moveTo(m, Hpx - 10 * k); ctx.lineTo(m + bar * sx, Hpx - 10 * k); ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle; ctx.font = `${10.5 * k}px sans-serif`; ctx.textAlign = "left"; ctx.fillText(`${bar} m`, m + bar * sx + 5 * k, Hpx - 6 * k);
  ctx.fillText("← chiều xe chạy của người quan sát →", Wpx / 2 - 90 * k, 14 * k);
  return { lo, hi };
}

// ------------------------------------------------------------------ 3D
export function defaultBridgeCamera(b) {
  const G = bridgeGeometry(b), P = makeProfile({ length: G.L, grade: +b.grade || 0, Rv: +b.Rv || 0 });
  return { tx: G.L * 0.56, ty: G.W / 2, tz: P.crest * 0.7, az: -24, el: 13, dist: Math.max(55, G.L * 0.5) };
}

/** Phối cảnh 3D ban đêm: mặt nước, trụ cầu, dầm, mặt cầu tô theo độ rọi, lan can, trụ đèn & quầng sáng. */
export function drawBridge3D(ctx, Wpx, Hpx, b, result, opts = {}) {
  const k = opts.px || 1, G = bridgeGeometry(b), P = makeProfile({ length: G.L, grade: +b.grade || 0, Rv: +b.Rv || 0 });
  const cam = opts.cam || defaultBridgeCamera(b);
  const pr = makeProjector({ ...cam, tx: cam.tx, ty: cam.ty }, Wpx, Hpx);
  const tz = cam.tz || 0, Pz = (x, y, z) => pr.P(x, y, z - tz);
  const poly = (pts) => pr.poly(pts.map(([x, y, z]) => [x, y, z - tz]));
  const sky = ctx.createLinearGradient(0, 0, 0, Hpx); sky.addColorStop(0, "#050a12"); sky.addColorStop(0.55, "#0e1f33"); sky.addColorStop(1, "#0a1522");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, Wpx, Hpx);
  // vẽ theo lớp (camera luôn ở trên mặt cầu): nước → trụ cầu, dầm → lan can phía xa → mặt cầu → lan can phía gần
  const layer = () => { const L = []; return { add: (pts, fill) => { const q = poly(pts); if (q && q.length >= 3) L.push({ q, d: q.reduce((s, p) => s + p[2], 0) / q.length, fill }); },
    draw: (seam = false) => { L.sort((a, c) => c.d - a.d); for (const f of L) { ctx.fillStyle = f.fill; ctx.beginPath(); f.q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
      if (seam) { ctx.strokeStyle = f.fill; ctx.lineWidth = 0.8; ctx.stroke(); } } } }; };
  const under = layer(), farL = layer(), deck = layer(), nearL = layer();
  const wl = -9;                                                               // mặt nước (m, dưới cao độ mố)
  const ext = G.L * 3 + 600;
  { const q = poly([[-ext, -ext, wl], [G.L + ext, -ext, wl], [G.L + ext, G.W + ext, wl], [-ext, G.W + ext, wl]]);
    if (q) { const gw = ctx.createLinearGradient(0, Hpx * 0.35, 0, Hpx); gw.addColorStop(0, "#0a1b2e"); gw.addColorStop(1, "#06111d");
      ctx.fillStyle = gw; ctx.beginPath(); q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); } }
  const pl = result && result.plan;
  let hi = 30;
  if (pl) { const s = [...pl.E].sort((a, c) => a - c); hi = Math.max(1, s[Math.floor(s.length * 0.97)] || 1); }
  const tone = (E, rho) => { const v = Math.pow(Math.max(0, E) / hi, 0.95) * rho; const a = Math.min(1, v);
    return `rgb(${Math.round(16 + 224 * a)},${Math.round(17 + 200 * a)},${Math.round(22 + 160 * a)})`; };
  const y0 = -G.walk - G.guard, y1 = G.W + G.walk + G.guard;
  const camY = pr.C[1] + 0, nearY = camY < G.W / 2 ? y0 : y1;
  const step = opts.fast ? 3 : 1;
  if (pl) {
    const dy = (pl.y1 - pl.y0) / pl.ny;
    for (let i = 0; i < pl.nx; i += step) for (let j = 0; j < pl.ny; j += step) {
      const xa = i * pl.dx, xb = Math.min(G.L, (i + step) * pl.dx), ya = pl.y0 + j * dy, yb = Math.min(pl.y1, pl.y0 + (j + step) * dy);
      const onRoad = pl.ys[j] >= 0 && pl.ys[j] <= G.W;
      deck.add([[xa, ya, P.z(xa)], [xb, ya, P.z(xb)], [xb, yb, P.z(xb)], [xa, yb, P.z(xa)]], tone(pl.E[j * pl.nx + i], onRoad ? 0.72 : 0.95));
    }
  } else {
    const n = 40; for (let i = 0; i < n; i++) { const xa = G.L * i / n, xb = G.L * (i + 1) / n; deck.add([[xa, y0, P.z(xa)], [xb, y0, P.z(xb)], [xb, y1, P.z(xb)], [xa, y1, P.z(xa)]], "#2a2f36"); }
  }
  const nSeg = 60, hp = b.parapetH ?? 1.1;
  for (let i = 0; i < nSeg; i++) {
    const xa = G.L * i / nSeg, xb = G.L * (i + 1) / nSeg, za = P.z(xa), zb = P.z(xb);
    for (const yy of [y0, y1]) {
      (yy === nearY ? nearL : farL).add([[xa, yy, za], [xb, yy, zb], [xb, yy, zb + hp], [xa, yy, za + hp]], "rgba(150,160,175,0.8)");
      under.add([[xa, yy, za - 0.05], [xb, yy, zb - 0.05], [xb, yy, zb - 2.2], [xa, yy, za - 2.2]], "#262c35");
    }
  }
  const nSp = Math.max(1, Math.round(G.L / 40));
  for (let i = 1; i < nSp; i++) {
    const x = G.L * i / nSp, z = P.z(x) - 2.2;
    for (const [ya, yb] of [[y0 + 1.5, y0 + 3], [y1 - 3, y1 - 1.5]]) {
      under.add([[x - 0.8, nearY === y0 ? ya : yb, wl], [x + 0.8, nearY === y0 ? ya : yb, wl], [x + 0.8, nearY === y0 ? ya : yb, z], [x - 0.8, nearY === y0 ? ya : yb, z]], "#1d232c");
    }
  }
  for (const [xa, xb] of [[-60, 0], [G.L, G.L + 60]]) under.add([[xa, 0, P.z(xa)], [xb, 0, P.z(xb)], [xb, G.W, P.z(xb)], [xa, G.W, P.z(xa)]], G.approachLit ? "#4a4436" : "#1c1f24");
  under.draw(); farL.draw(); deck.draw(true); nearL.draw();
  // vạch làn
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1 * k;
  for (let l = 1; l < G.lanes; l++) { const y = l * G.W / G.lanes; ctx.setLineDash([6 * k, 9 * k]); ctx.beginPath(); let st = false;
    for (let i = 0; i <= 80; i++) { const x = G.L * i / 80, q = Pz(x, y, P.z(x) + 0.02); if (!q) { st = false; continue; } st ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); st = true; } ctx.stroke(); }
  ctx.setLineDash([]);
  // trụ đèn + bộ đèn (vẽ sau cùng, xa trước) — đèn LED cắt sáng hoàn toàn: ánh sáng chỉ toả xuống, không quầng hắt lên trời
  const yPole = { near: -G.setback, far: G.W + G.setback, mid: G.W / 2 };
  const items = [];
  for (const p of polePositions(b)) {
    const y = yPole[p.side], z = P.z(p.x), dir = p.side === "near" ? 1 : p.side === "far" ? -1 : 0;
    const base = Pz(p.x, y, z), top = Pz(p.x, y, z + G.H);
    if (!base || !top) continue;
    const lamps = dir ? [[y + dir * G.arm, dir > 0 ? 90 : -90]] : [[y - G.arm, -90], [y + G.arm, 90]];
    items.push({ d: base[2], base, top, x: p.x, z, lamps: lamps.map(([ly, aim]) => ({ y: ly, aim, s: Pz(p.x, ly, z + G.H) })).filter((l) => l.s) });
  }
  items.sort((a, c) => c.d - a.d);
  const camZ = pr.C[2] + tz, Pw = (x, y, z) => Pz(x, y, z);
  for (const it of items) {
    const w = Math.max(1, 0.2 * pr.f / it.d);
    ctx.strokeStyle = "#8d96a3"; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(it.base[0], it.base[1]); ctx.lineTo(it.top[0], it.top[1]);
    for (const l of it.lamps) ctx.lineTo(l.s[0], l.s[1]);
    ctx.stroke(); ctx.lineCap = "butt";
    for (const l of it.lamps) drawLuminaire3D(ctx, Pw, { x: it.x, y: l.y, z: it.z + G.H, aim: l.aim, tilt: G.tilt }, { k, f: pr.f, style: opts.lampStyle || "beam", reach: G.H, camZ });
  }
  return { cam, hi };
}
