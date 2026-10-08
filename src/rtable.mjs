// R-table (hệ số độ chói rút gọn r) cho mặt đường.
// QUAN TRỌNG: bảng R3/R1/R2/R4 chuẩn nằm trong CIE 144/EN 13201 (có bản quyền).
// Module hỗ trợ NẠP bảng chuẩn dạng JSON {tanEps:[...], beta:[...], r:[[...]], q0}.
// Khi CHƯA nạp bảng chuẩn -> dùng MÔ HÌNH TẠM (khuếch tán) để engine chạy được,
// cờ provisional=true. KHÔNG dùng số độ chói tạm này cho hồ sơ chính thức.

const DEG = Math.PI / 180;
export const Q0 = { R1: 0.10, R2: 0.07, R3: 0.07, R4: 0.08 };

function interp1(arr, x) {
  if (x <= arr[0]) return [0, 0];
  const n = arr.length;
  if (x >= arr[n - 1]) return [n - 2, 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m] <= x) lo = m; else hi = m; }
  return [lo, (x - arr[lo]) / (arr[lo + 1] - arr[lo])];
}

/** Tạo hàm r(beta[deg], tanEps) từ bảng chuẩn đã nạp. */
export function makeRTableFromData(data) {
  const { tanEps, beta, r, q0 } = data;
  const fn = (betaDeg, tanE) => {
    let b = Math.abs(betaDeg); if (b > 180) b = 360 - b;
    const [bi, bt] = interp1(beta, b);
    const [ti, tt] = interp1(tanEps, tanE);
    const r00 = r[bi][ti], r01 = r[bi][ti + 1], r10 = r[bi + 1][ti], r11 = r[bi + 1][ti + 1];
    const rLo = r00 + (r01 - r00) * tt, rHi = r10 + (r11 - r10) * tt;
    return rLo + (rHi - rLo) * bt; // đơn vị: r*10^4
  };
  fn.provisional = false;
  fn.q0 = q0;
  return fn;
}

/**
 * MÔ HÌNH TẠM (khuếch tán Lambert gần đúng): r = q0 * cos^3(eps) * 1e4, bỏ qua phụ thuộc beta.
 * Cho độ chói đúng bậc độ lớn, KHÔNG phản ánh tính gương của mặt nhựa.
 * CHỈ dùng khi chưa có bảng chuẩn. Luôn kèm cờ provisional=true.
 */
export function makeProvisionalRTable(cls = "R3") {
  const q0 = Q0[cls] ?? 0.07;
  const fn = (betaDeg, tanE) => {
    const cos2 = 1 / (1 + tanE * tanE); // cos^2(eps)
    const cos3 = Math.pow(cos2, 1.5);   // cos^3(eps)
    return q0 * cos3 * 1e4;
  };
  fn.provisional = true;
  fn.q0 = q0;
  return fn;
}

/**
 * Bảng r HIỆU CHỈNH THEO DIALux (R3): mô hình khuếch tán với q0 hiệu chỉnh
 * q0_eff=0.0654 — fit để Lav khớp DIALux trên 14 báo cáo (|lệch| TB ~5.2%).
 * LƯU Ý: độ chói TRUNG BÌNH (Lav) khớp tốt; độ ĐỒNG ĐỀU (Uo/Ul) chỉ xấp xỉ
 * vì mô hình chưa có thành phần gương của mặt nhựa — Uo thường THẤP hơn DIALux
 * ở đường hẹp (thiên về an toàn). Muốn Uo/Ul khớp tuyệt đối cần bảng R3 CIE 144.
 */
export function makeCalibratedRTable(q0eff = 0.0654) {
  const fn = (betaDeg, tanE) => {
    const cos3 = Math.pow(1 / (1 + tanE * tanE), 1.5);
    return q0eff * cos3 * 1e4;
  };
  fn.provisional = false;
  fn.calibrated = true;
  fn.uniformityApprox = true;
  fn.q0 = q0eff;
  return fn;
}
