// Chạy engine hàng loạt từ dữ liệu Excel + thư viện IES.
import { parseIES } from "./ies.mjs";
import { calcRoad } from "./engine.mjs";
import { rowToGeometry, matchIES, modelKeyword, powerFromName } from "./mapping.mjs";

/** files: [{name, text}] -> chỉ mục [{name, model, power, ph}] */
export function buildIesIndex(files) {
  const idx = [];
  for (const f of files) {
    try {
      const ph = parseIES(f.text);
      idx.push({
        name: f.name,
        model: modelKeyword(f.name),
        power: powerFromName(f.name) ?? (ph.inputWatts ? Math.round(ph.inputWatts) : null),
        ph,
      });
    } catch (e) { /* bỏ file IES hỏng */ }
  }
  return idx;
}

/** Chạy từng dòng phương án. Trả mảng kết quả. */
export function runBatch(rows, iesIndex, opts = {}) {
  const { MF = 0.8, rfn } = opts;
  return rows.map((row) => {
    const g = rowToGeometry(row);
    const base = { stt: g.meta.stt, tuyen: g.meta.tuyen, model: g.meta.model, power: g.meta.power, warnings: g.warnings };
    if (g.input.H == null || g.input.width == null || g.input.spacing == null) {
      return { ...base, status: "thiếu hình học", reason: g.warnings.join("; ") };
    }
    const m = matchIES(g.meta, iesIndex);
    if (!m.ies) return { ...base, status: "thiếu IES", reason: m.reason };
    try {
      const r = calcRoad({ ies: m.ies.ph, ...g.input, MF, ...(rfn ? { rfn } : {}) });
      return {
        ...base, status: "ok", iesName: m.ies.name, iesNote: m.reason,
        Ltb: r.road.Lav, Uo: r.road.Uo, Ul: r.road.Ul, TI: r.road.TI, SR: r.road.SR,
        En: r.E.avg, pass: r.pass, checks: r.checks, req: r.req, roadClass: r.roadClass,
      };
    } catch (e) {
      return { ...base, status: "lỗi tính", reason: String(e.message || e) };
    }
  });
}

/** Tự dò: mỗi tuyến (gộp theo STT) chọn IES cùng model, công suất NHỎ NHẤT vẫn Đạt. */
export function autoFind(rows, iesIndex, opts = {}) {
  const { MF = 0.8, rfn } = opts;
  // gộp theo tuyến: dòng có STT mở đầu
  const roads = [];
  let cur = null;
  for (const row of rows) {
    const g = rowToGeometry(row);
    if (g.meta.stt != null && g.meta.stt !== "") { cur = { stt: g.meta.stt, tuyen: g.meta.tuyen, g }; roads.push(cur); }
  }
  return roads.map((rd) => {
    const g = rd.g;
    if (g.input.H == null || g.input.width == null || g.input.spacing == null)
      return { stt: rd.stt, tuyen: rd.tuyen, status: "thiếu hình học" };
    const mk = modelKeyword(g.meta.model) || null;
    // ứng viên: cùng model (nếu biết) hoặc tất cả, sắp theo công suất tăng dần
    let cands = iesIndex.filter((e) => (mk ? e.model === mk : true) && e.power != null)
      .slice().sort((a, b) => a.power - b.power);
    let best = null;
    for (const c of cands) {
      try {
        const r = calcRoad({ ies: c.ph, ...g.input, MF, ...(rfn ? { rfn } : {}) });
        if (r.pass) { best = { ies: c, r }; break; }
      } catch (_) { /* bỏ ứng viên lỗi */ }
    }
    if (!best) return { stt: rd.stt, tuyen: rd.tuyen, status: "không có đèn Đạt" };
    const r = best.r;
    return {
      stt: rd.stt, tuyen: rd.tuyen, status: "ok", chon: best.ies.name, power: best.ies.power,
      Ltb: r.road.Lav, Uo: r.road.Uo, Ul: r.road.Ul, TI: r.road.TI, SR: r.road.SR, pass: r.pass,
    };
  });
}
