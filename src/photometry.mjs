// Độ rọi E, độ chói L (theo observer), độ chói màn chắn Lv & TI.
import { angleLumToPoint, azimuthHoriz } from "./geometry.mjs";

const DEG = Math.PI / 180;

/** Độ rọi ngang tại 1 điểm (lux) = Σ I(C,γ)·H/d³·MF. */
export function illuminanceAtPoint(P, lums, I, MF) {
  let E = 0;
  for (const L of lums) {
    const { C, gamma, dist } = angleLumToPoint(L, P);
    if (gamma >= 90) continue;
    const Iv = I(C, gamma);
    if (Iv <= 0) continue;
    E += Iv * L.H / (dist * dist * dist);
  }
  return E * MF;
}

/** Độ chói tại 1 điểm theo 1 observer (cd/m²). */
export function luminanceAtPoint(P, lums, I, rfn, observer, MF) {
  let Lsum = 0;
  // Hướng quan sát = chiều nhìn observer->P (cùng chiều xe chạy). β đo so với hướng này.
  const obsAz = azimuthHoriz(observer, P);
  for (const L of lums) {
    const { C, gamma, dist } = angleLumToPoint(L, P);
    if (gamma >= 90) continue;
    const Iv = I(C, gamma);
    if (Iv <= 0) continue;
    const horiz = Math.sqrt(Math.max(0, dist * dist - L.H * L.H));
    const tanEps = horiz / L.H;
    const lumAz = azimuthHoriz(P, L); // phương vị hướng tới đèn
    let beta = Math.abs(lumAz - obsAz);
    if (beta > 180) beta = 360 - beta;
    const rVal = rfn(beta, tanEps); // r*10^4
    Lsum += Iv * rVal / (L.H * L.H);
  }
  return Lsum * 1e-4 * MF;
}

/**
 * Độ chói màn chắn Lv tại mắt observer & TI.
 * Lv = 10·Σ Eeye,k/θ_k²  (θ: độ, 1.5°–60°); Eeye xấp xỉ I_toward_eye/dist².
 */
export function thresholdIncrement(lums, I, observer, Lav, MF) {
  const eye = { x: observer.x, y: observer.y, z: observer.z };
  // hướng nhìn: tới trước (+X), cúi 1°
  const look = { x: Math.cos(1 * DEG), y: 0, z: -Math.sin(1 * DEG) };
  let Lv = 0;
  for (const L of lums) {
    const dx = L.x - eye.x, dy = (L.y - eye.y), dz = L.H - eye.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // góc θ giữa hướng nhìn và hướng tới đèn
    const dot = (dx * look.x + dy * look.y + dz * look.z) / d;
    const theta = Math.acos(Math.max(-1, Math.min(1, dot))) / DEG;
    if (theta < 1.5 || theta > 60) continue;
    // cường độ về phía mắt: (C,γ) của tia đèn->mắt
    const { C, gamma } = angleLumToPoint(L, eye);
    if (gamma >= 90) continue;
    const Iv = I(C, gamma) * MF;
    const Eeye = Iv / (d * d); // độ rọi tại mắt (xấp xỉ vuông góc)
    Lv += 10 * Eeye / (theta * theta);
  }
  let TI = 0;
  if (Lav >= 0.05 && Lav <= 5) TI = 65 * Lv / Math.pow(Lav, 0.8);
  else if (Lav > 5) TI = 95 * Lv / Math.pow(Lav, 1.05);
  return { Lv, TI };
}

/**
 * TI theo EN 13201-3 / CIE 140 như DIALux: tính với trạng thái BAN ĐẦU (Lv không nhân MF, Lav ban đầu = Lav duy trì / MF),
 * độ rọi trên mặt phẳng vuông góc hướng nhìn (× cosθ), đèn phía trước tới ~500 m, người quan sát dời dọc
 * trong một khoảng cột (bước = lưới dọc) và lấy TI lớn nhất. Đối chiếu 16 observer DIALux: 15/16 khớp số nguyên.
 */
export function thresholdIncrementMoving(lums, I, observer, LavMaint, MF, spacing, steps = 12) {
  const look = { x: Math.cos(1 * DEG), z: -Math.sin(1 * DEG) };
  const Lav = LavMaint / (MF || 1);
  let best = { Lv: 0, TI: 0 };
  for (let s = 0; s < steps; s++) {
    const eye = { x: observer.x + s * spacing / steps, y: observer.y, z: observer.z };
    let Lv = 0;
    for (const L of lums) {
      const dx = L.x - eye.x, dy = L.y - eye.y, dz = L.H - eye.z;
      if (dx <= 0) continue;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const cos = (dx * look.x + dz * look.z) / d;
      const theta = Math.acos(Math.max(-1, Math.min(1, cos))) / DEG;
      if (theta < 1.5 || theta > 60) continue;
      const { C, gamma } = angleLumToPoint(L, eye);
      if (gamma >= 90) continue;
      Lv += 10 * (I(C, gamma) * cos / (d * d)) / (theta * theta);
    }
    let TI = 0;
    if (Lav >= 0.05 && Lav <= 5) TI = 65 * Lv / Math.pow(Lav, 0.8);
    else if (Lav > 5) TI = 95 * Lv / Math.pow(Lav, 1.05);
    if (TI > best.TI) best = { Lv, TI };
  }
  return best;
}
