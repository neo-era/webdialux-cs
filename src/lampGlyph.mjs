// Vẽ bộ đèn trong phối cảnh 3D ban đêm giống đèn LED thật (full cut-off): thân đèn tối, mặt phát sáng hướng xuống theo
// trục quang (đã nghiêng), ánh sáng chỉ toả về phía mặt chiếu — KHÔNG có quầng tròn hắt lên trời.
// Dùng chung cho 3D cầu, 3D khu vực, 3D đường trong PDF.
const DEG = Math.PI / 180;

/** Trục quang của đèn: hướng xuống (−z) nghiêng về phía `aim` (độ, trong mặt phẳng ngang) một góc `tilt` (0 = thẳng xuống, 90 = ngang, 180 = thẳng lên). */
export function opticalAxis(aimDeg, tiltDeg) {
  const a = aimDeg * DEG, t = (tiltDeg || 0) * DEG;
  return [Math.sin(t) * Math.cos(a), Math.sin(t) * Math.sin(a), -Math.cos(t)];
}

/**
 * Vẽ 1 bộ đèn. P(x,y,z) → [sx, sy, depth] | null (phép chiếu); L = {x, y, z, aim, tilt}; opts: {k (hệ số điểm ảnh), f (tiêu cự px),
 * style: "beam" (chùm sáng mờ xuống mặt chiếu) | "half" (quầng sáng nửa dưới), color [r,g,b], reach (m, tới mặt chiếu), camZ (cao độ camera)}.
 */
export function drawLuminaire3D(ctx, P, L, opts = {}) {
  const { k = 1, style = "beam", color = [255, 214, 140], reach = 10 } = opts;
  const a = (L.aim || 0) * DEG, u = [Math.cos(a), Math.sin(a), 0], v = [-Math.sin(a), Math.cos(a), 0];
  const n = opticalAxis(L.aim || 0, L.tilt || 0);
  const c = [L.x, L.y, L.z];
  const at = (p, du, dv, dz = 0) => [p[0] + u[0] * du + v[0] * dv, p[1] + u[1] * du + v[1] * dv, p[2] + dz];
  const ctr = P(...c); if (!ctr) return;
  const d = ctr[2], f = opts.f || 800, mpx = f / d;               // điểm ảnh trên 1 m tại độ sâu của đèn
  const [r0, g0, b0] = color, rgba = (al) => `rgba(${r0},${g0},${b0},${al})`;
  // 1) ánh sáng toả xuống (vẽ trước, nằm dưới thân đèn)
  if (style === "beam") {
    const tip = [c[0] + n[0] * reach, c[1] + n[1] * reach, c[2] + n[2] * reach];
    const R = reach * 0.85, ring = [];
    // vòng chân chùm sáng trên mặt vuông góc trục quang
    const e1 = Math.abs(n[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const w1 = norm(cross(n, e1)), w2 = cross(n, w1);
    for (let i = 0; i < 20; i++) { const t = (i / 20) * 2 * Math.PI; const q = P(tip[0] + (w1[0] * Math.cos(t) + w2[0] * Math.sin(t)) * R, tip[1] + (w1[1] * Math.cos(t) + w2[1] * Math.sin(t)) * R, tip[2] + (w1[2] * Math.cos(t) + w2[2] * Math.sin(t)) * R); if (q) ring.push(q); }
    if (ring.length > 8) {
      const hull = convexHull([[ctr[0], ctr[1]], ...ring.map((q) => [q[0], q[1]])]);
      const pt = P(...tip) || ring[0];
      const g = ctx.createLinearGradient(ctr[0], ctr[1], pt[0], pt[1]);
      g.addColorStop(0, rgba(0.16)); g.addColorStop(0.5, rgba(0.06)); g.addColorStop(1, rgba(0));
      ctx.fillStyle = g; ctx.beginPath(); hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
    }
  }
  // 2) quầng sáng sát mặt phát quang — chỉ nửa phía trục quang (cắt theo mặt phẳng đèn)
  const lensC = at(c, 0.05, 0, -0.07);
  const lc = P(...lensC), ln = P(lensC[0] + n[0] * 0.6, lensC[1] + n[1] * 0.6, lensC[2] + n[2] * 0.6);
  if (lc && ln) {
    const rad = Math.max(3 * k, (style === "half" ? 2.4 : 1.2) * mpx);
    let dx = ln[0] - lc[0], dy = ln[1] - lc[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    ctx.save(); ctx.beginPath();
    // nửa mặt phẳng màn hình về phía trục quang (đường biên vuông góc với hình chiếu trục quang, qua mặt đèn)
    const big = rad * 4, px = -dy, py = dx;
    ctx.moveTo(lc[0] + px * big, lc[1] + py * big); ctx.lineTo(lc[0] - px * big, lc[1] - py * big);
    ctx.lineTo(lc[0] - px * big + dx * big, lc[1] - py * big + dy * big); ctx.lineTo(lc[0] + px * big + dx * big, lc[1] + py * big + dy * big); ctx.closePath(); ctx.clip();
    const g = ctx.createRadialGradient(lc[0], lc[1], 0, lc[0], lc[1], rad);
    g.addColorStop(0, rgba(style === "half" ? 0.55 : 0.4)); g.addColorStop(0.35, rgba(style === "half" ? 0.2 : 0.12)); g.addColorStop(1, rgba(0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lc[0], lc[1], rad, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
  }
  // 3) thân đèn (hộp dẹt) + mặt phát quang sáng ở đáy
  const len = 0.36, wid = 0.16, th = 0.07;
  const top = [at(c, -len, -wid, th), at(c, len, -wid, th), at(c, len, wid, th), at(c, -len, wid, th)].map((p) => P(...p));
  const bot = [at(c, -len * 0.9, -wid * 0.85, -th), at(c, len * 0.9, -wid * 0.85, -th), at(c, len * 0.9, wid * 0.85, -th), at(c, -len * 0.9, wid * 0.85, -th)].map((p) => P(...p));
  const poly = (pts, fill) => { if (pts.some((q) => !q)) return; ctx.fillStyle = fill; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); };
  // mặt phát quang (đáy) chỉ thấy khi camera ở dưới mặt đèn; nhìn từ trên thấy viền sáng mảnh
  const camBelow = opts.camZ != null && opts.camZ < L.z;
  if (camBelow) { poly(top, "#3a4049"); poly(bot, "rgb(255,250,235)"); }
  else {
    poly(bot, "rgba(255,246,225,0.95)");
    if (top.every(Boolean)) { ctx.fillStyle = "#2d333b"; ctx.beginPath(); top.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(160,170,182,0.7)"; ctx.lineWidth = Math.max(0.6, 0.6 * k); ctx.stroke(); }
  }
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); }
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
