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

/**
 * Tự chọn bộ đèn công suất NHỎ NHẤT vẫn Đạt chuẩn cho 1 hình học.
 * Dò lần lượt theo công suất tăng dần; dừng ở đèn đầu tiên Đạt.
 * Nếu không đèn nào Đạt, trả đèn công suất LỚN NHẤT (gần đạt nhất) để vẫn có số liệu.
 * @returns {ies, r, pass} | null
 */
export function selectLowestPassing(geomInput, iesIndex, { MF = 0.8, rfn, modelFilter = null } = {}) {
  const cands = iesIndex
    .filter((e) => e.power != null && (modelFilter ? e.model === modelFilter : true))
    .slice().sort((a, b) => a.power - b.power);
  if (cands.length === 0) return null;
  let fallback = null;
  for (const c of cands) {
    try {
      const r = calcRoad({ ies: c.ph, ...geomInput, MF, ...(rfn ? { rfn } : {}) });
      fallback = { ies: c, r, pass: r.pass }; // đèn công suất lớn nhất đã thử
      if (r.pass) return { ies: c, r, pass: true };
    } catch (_) { /* bỏ ứng viên lỗi */ }
  }
  return fallback; // không đèn nào Đạt -> đèn lớn nhất (pass=false)
}

/**
 * Chạy từng dòng phương án. Trả mảng kết quả — 1 phần tử / dòng.
 * - Nếu dòng có cột "Loại đèn": khớp IES theo model (+công suất) rồi tính.
 * - Nếu KHÔNG có model: TỰ CHỌN bộ đèn công suất nhỏ nhất vẫn Đạt (dữ liệu chỉ có hình học).
 */
export function runBatch(rows, iesIndex, opts = {}) {
  const { MF = 0.8, rfn } = opts;
  return rows.map((row) => {
    const g = rowToGeometry(row);
    const base = {
      stt: g.meta.stt, tuyen: g.meta.tuyen, model: g.meta.model, power: g.meta.power,
      warnings: g.warnings, autoClass: g.autoClass, classSource: g.classSource, roadClass: g.input.roadClass,
    };
    if (g.input.H == null || g.input.width == null || g.input.spacing == null) {
      return { ...base, status: "thiếu hình học", reason: g.warnings.join("; ") };
    }

    const mk = modelKeyword(g.meta.model) || modelKeyword(g.meta.fitting);
    let chosen = null, note = "";

    if (mk) {
      // Có chỉ định đèn: khớp đúng model (+CS gần nhất)
      const m = matchIES(g.meta, iesIndex);
      if (!m.ies) return { ...base, status: "thiếu IES", reason: m.reason, autoSelect: false };
      try {
        const r = calcRoad({ ies: m.ies.ph, ...g.input, MF, ...(rfn ? { rfn } : {}) });
        chosen = { ies: m.ies, r }; note = m.reason;
      } catch (e) {
        return { ...base, status: "lỗi tính", reason: String(e.message || e) };
      }
      return emit(base, chosen, { autoSelect: false, note });
    }

    // KHÔNG chỉ định đèn -> tự chọn nhỏ nhất vẫn Đạt
    const sel = selectLowestPassing(g.input, iesIndex, { MF, rfn });
    if (!sel) return { ...base, status: "thiếu IES", reason: "thư viện IES trống", autoSelect: true };
    note = sel.pass ? "tự chọn: công suất nhỏ nhất vẫn Đạt" : "tự chọn: không đèn nào Đạt — lấy công suất lớn nhất";
    return emit(base, { ies: sel.ies, r: sel.r }, { autoSelect: true, note });
  });
}

function emit(base, chosen, { autoSelect, note }) {
  const r = chosen.r;
  return {
    ...base, status: "ok", autoSelect,
    iesName: chosen.ies.name, iesNote: note,
    chon: chosen.ies.name, power: chosen.ies.power ?? base.power,
    Ltb: r.road.Lav, Uo: r.road.Uo, Ul: r.road.Ul, TI: r.road.TI, SR: r.road.SR,
    En: r.E.avg, pass: r.pass, checks: r.checks, req: r.req, roadClass: r.roadClass,
  };
}

/** Tự dò theo tuyến (gộp theo STT) — giữ tương thích CLI cũ. */
export function autoFind(rows, iesIndex, opts = {}) {
  const { MF = 0.8, rfn } = opts;
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
    const sel = selectLowestPassing(g.input, iesIndex, { MF, rfn, modelFilter: mk });
    if (!sel) return { stt: rd.stt, tuyen: rd.tuyen, status: "không có đèn Đạt" };
    const r = sel.r;
    return {
      stt: rd.stt, tuyen: rd.tuyen, status: "ok", chon: sel.ies.name, power: sel.ies.power,
      roadClass: g.input.roadClass, autoClass: g.autoClass,
      Ltb: r.road.Lav, Uo: r.road.Uo, Ul: r.road.Ul, TI: r.road.TI, SR: r.road.SR, pass: r.pass,
    };
  });
}
