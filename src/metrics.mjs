// Thống kê chỉ tiêu từ lưới giá trị.
export function stats(values) {
  let min = Infinity, max = -Infinity, sum = 0;
  for (const v of values) { if (v < min) min = v; if (v > max) max = v; sum += v; }
  const avg = sum / values.length;
  return { avg, min, max, g1: min / avg, g2: min / max };
}

/** Độ đồng đều dọc Ul: với mỗi làn lấy đường tâm làn (theo dọc X), Ul=min/max; trả min qua các làn. */
export function longitudinalUniformity(Lgrid, grid) {
  // Lgrid: mảng 1 chiều theo thứ tự điểm (i dọc * nTrans + j ngang) như buildGrid
  const { nLong, nTrans, laneCenters, dT } = grid;
  const at = (i, j) => Lgrid[i * nTrans + j];
  let worst = Infinity;
  for (const yc of laneCenters) {
    let j = Math.round(yc / dT - 0.5);
    j = Math.max(0, Math.min(nTrans - 1, j));
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < nLong; i++) { const v = at(i, j); if (v < mn) mn = v; if (v > mx) mx = v; }
    const ul = mx > 0 ? mn / mx : 0;
    if (ul < worst) worst = ul;
  }
  return worst;
}
