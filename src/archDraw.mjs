// Xem "Mặt đứng trải phẳng": các mặt đứng (tòa nhà, tường) và tán cây (trải kinh–vĩ độ) vẽ cạnh nhau, cùng tỉ lệ,
// tô màu theo độ rọi đã tính. Dùng chung cho màn hình và PDF.
import { heatColor } from "./areaDraw.mjs";

/** Vẽ các bề mặt của 1 vật thể (objId) hoặc tất cả. Trả {range:[lo,hi], n}. */
export function drawFacades(ctx, Wpx, Hpx, arch, opts = {}) {
  const k = opts.px || 1;
  const S = (arch ? arch.surfaces : []).filter((s) => !opts.objId || s.objId === opts.objId);
  const C = opts.colors || { bg: "#ffffff", fg: "#1c2430", muted: "#5b6676", line: "#d8dee8" };
  ctx.save(); ctx.fillStyle = C.bg; ctx.fillRect(0, 0, Wpx, Hpx);
  if (!S.length) { ctx.fillStyle = C.muted; ctx.font = `${13 * k}px sans-serif`; ctx.textAlign = "center";
    ctx.fillText(arch ? "Chọn một vật thể có bề mặt để xem" : "Chưa có vật thể (tòa nhà, tường rào, cây)", Wpx / 2, Hpx / 2); ctx.restore(); return { range: [0, 0], n: 0 }; }
  // thang màu: Emin → phân vị 95% (vài điểm sát chân đèn không làm tối cả hình); giá trị cao hơn tô màu trên cùng
  let lo = Infinity; const all = [];
  for (const s of S) { lo = Math.min(lo, s.Emin); for (const e of s.E) all.push(e); }
  all.sort((x, y) => x - y);
  const hi = Math.max(lo + 1e-6, all[Math.min(all.length - 1, Math.floor(all.length * 0.95))]);
  const span = Math.max(1e-6, hi - lo);
  // kích thước thật (m) từng ô: mặt đứng = rộng × cao; tán cây = chu vi × nửa chu vi
  const dims = S.map((s) => s.kind === "face" ? [s.width, s.height] : [2 * Math.PI * s.R, Math.PI * s.R]);
  // xếp theo hàng (thuật toán đơn giản: chọn tỉ lệ lớn nhất để vừa khung)
  const pad = 14 * k, lab = 30 * k;
  let best = null;
  for (let sc = 200; sc > 0.5; sc *= 0.93) {
    let x = pad, y = pad, rowH = 0, ok = true; const pos = [];
    for (const [w, h] of dims) {
      const W2 = w * sc, H2 = h * sc;
      if (x + W2 > Wpx - pad && x > pad) { x = pad; y += rowH + lab + pad; rowH = 0; }
      if (x + W2 > Wpx - pad) { ok = false; break; }
      pos.push([x, y + lab, W2, H2]); x += W2 + pad; rowH = Math.max(rowH, H2);
    }
    if (ok && y + rowH + lab + pad <= Hpx) { best = { sc, pos }; break; }
  }
  if (!best) best = { sc: 1, pos: dims.map(() => [0, 0, 0, 0]) };
  S.forEach((s, n) => {
    const [x0, y0, W2, H2] = best.pos[n];
    if (s.kind === "face") {
      const cw = W2 / s.nu, ch = H2 / s.nv;
      for (let j = 0; j < s.nv; j++) for (let i = 0; i < s.nu; i++) {
        const c = heatColor((s.E[j * s.nu + i] - lo) / span); ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(x0 + i * cw, y0 + H2 - (j + 1) * ch, cw + 0.6, ch + 0.6);           // z tăng lên trên
      }
    } else {                                                                                 // tán cây: dòng = vĩ độ (đỉnh ở trên), cột = kinh độ
      const rows = new Map(); s.points.forEach((p, i) => { if (!rows.has(p.lat)) rows.set(p.lat, []); rows.get(p.lat).push([p, s.E[i]]); });
      const ch = H2 / s.nLat;
      for (const [lat, arr] of rows) { const cw = W2 / arr.length;
        arr.forEach(([p, e], i) => { const c = heatColor((e - lo) / span); ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.fillRect(x0 + i * cw, y0 + lat * ch, cw + 0.6, ch + 0.6); }); }
    }
    ctx.strokeStyle = C.fg; ctx.lineWidth = 1 * k; ctx.strokeRect(x0, y0, W2, H2);
    ctx.fillStyle = C.fg; ctx.font = `600 ${11 * k}px sans-serif`; ctx.textAlign = "left";
    const fit = (t, w) => { let u = t; while (u.length > 4 && ctx.measureText(u).width > w) u = u.slice(0, -2); return u === t ? t : u + "…"; };
    ctx.fillText(fit(s.name, Math.max(60 * k, W2)), x0, y0 - 17 * k);
    ctx.fillStyle = s.req ? (s.pass ? "#1f8a4c" : "#c0392b") : C.muted; ctx.font = `${10.5 * k}px sans-serif`;
    ctx.fillText(fit(`Eav ${s.Eav.toFixed(1)} lx · L ${s.Lav.toFixed(2)} cd/m²${s.req ? (s.pass ? " ✓" : " ✗") : ""}`, Math.max(60 * k, W2)), x0, y0 - 4 * k);
  });
  // thước tỉ lệ
  const bar = [1, 2, 5, 10, 20, 50].find((v) => v * best.sc > 50 * k) || 50;
  ctx.strokeStyle = C.fg; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.moveTo(pad, Hpx - 10 * k); ctx.lineTo(pad + bar * best.sc, Hpx - 10 * k); ctx.stroke();
  ctx.fillStyle = C.muted; ctx.font = `${10.5 * k}px sans-serif`; ctx.fillText(`${bar} m`, pad + bar * best.sc + 5 * k, Hpx - 6 * k);
  ctx.restore();
  return { range: [lo, hi], n: S.length };
}
