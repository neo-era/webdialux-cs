// Hình học bố trí đèn + lưới điểm CIE 140 + hàm góc (C, gamma) và góc quan sát.
const DEG = Math.PI / 180;

/**
 * Sinh danh sách bộ đèn trong ±spanWindow nhịp quanh trường tính.
 * Trả về mỗi đèn: {x, y, H, tilt, c0dir} với c0dir = +1 (C0 hướng +Y) hoặc -1 (hướng -Y).
 * @param {object} g {H, overhang, spacing, width, arrangement, tilt, spanWindow}
 */
export function buildLuminaires(g) {
  const { H, overhang, spacing: S, width: W, arrangement, tilt = 0, spanWindow = 5 } = g;
  const lums = [];
  const near = (k) => ({ x: k * S, y: overhang, H, tilt, c0dir: +1 });
  const far = (k, off = 0) => ({ x: k * S + off, y: W - overhang, H, tilt, c0dir: -1 });
  for (let k = -spanWindow; k <= spanWindow + 1; k++) {
    lums.push(near(k));
    if (arrangement === "đối xứng" || arrangement === "doi xung" || arrangement === "two-sided") {
      lums.push(far(k));
    } else if (arrangement === "so le" || arrangement === "staggered") {
      lums.push(far(k, S / 2));
    }
    // "1 bên"/"giữa": vòng 1 chỉ một hàng gần (giữa xử lý sau)
  }
  return lums;
}

/**
 * Lưới điểm tính CIE 140 trong 1 nhịp [0,S] x [0,W].
 * @returns {{points: Array<{x,y,li}>, nLong, nTrans, laneCenters:number[], laneWidth, S, W}}
 */
export function buildGrid(g) {
  const { spacing: S, width: W, lanes = 2 } = g;
  const nLong = S <= 30 ? 10 : Math.ceil(S / 3);
  const nTrans = Math.max(3 * lanes, Math.ceil(W / 1.5));
  const dL = S / nLong, dT = W / nTrans;
  const points = [];
  for (let i = 0; i < nLong; i++) {
    const x = dL / 2 + i * dL;
    for (let j = 0; j < nTrans; j++) {
      const y = dT / 2 + j * dT;
      points.push({ x, y, li: j }); // li = chỉ số làn theo dải ngang
    }
  }
  const laneWidth = W / lanes;
  const laneCenters = [];
  for (let l = 0; l < lanes; l++) laneCenters.push((l + 0.5) * laneWidth);
  return { points, nLong, nTrans, laneCenters, laneWidth, S, W, dL, dT };
}

/** Quan sát viên: mỗi làn một observer tại x=-60, y=tâm làn, z=1.5 */
export function buildObservers(g, grid) {
  return grid.laneCenters.map((y) => ({ x: -60, y, z: 1.5 }));
}

/**
 * Tính (C, gamma) từ đèn tới điểm P, xét hướng C0 (c0dir) và tilt (xoay quanh trục X dọc đường).
 * @returns {{C:number, gamma:number, dist:number, cosGamma:number}}
 */
export function angleLumToPoint(lum, P) {
  // vector đèn -> điểm (toạ độ thế giới)
  let vx = P.x - lum.x;
  let vy = (P.y - lum.y);
  let vz = (P.z ?? 0) - lum.H;
  // Hướng C0 theo c0dir: nếu c0dir = -1 (đèn phía xa, C0 hướng -Y) thì lật trục Y
  vy *= lum.c0dir;
  // Áp tilt: xoay quanh trục X (dọc đường) 1 góc -tilt để đưa về hệ quang của đèn
  const t = -(lum.tilt || 0) * DEG;
  const cy = vy * Math.cos(t) - vz * Math.sin(t);
  const cz = vy * Math.sin(t) + vz * Math.cos(t);
  vy = cy; vz = cz;
  const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const cosGamma = -vz / dist;              // vz âm (xuống) -> cosGamma dương
  const gamma = Math.acos(Math.max(-1, Math.min(1, cosGamma))) / DEG;
  // C: phương vị hình chiếu ngang, C0 dọc +Y (ngang đường), tăng về +X (dọc đường)
  let C = Math.atan2(vx, vy) / DEG;
  C = ((C % 360) + 360) % 360;
  return { C, gamma, dist, cosGamma };
}

/** Phương vị ngang (độ) của hướng từ P tới điểm Q, trong mặt phẳng đường (atan2(dx,dy)). */
export function azimuthHoriz(P, Q) {
  return Math.atan2(Q.x - P.x, Q.y - P.y) / DEG;
}
