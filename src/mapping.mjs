// Ánh xạ dòng Excel (file phẳng DU LIEU TUYEN) -> input hình học cho engine,
// và so khớp bộ đèn với file IES trong thư mục.

export const COLS = {
  stt: "STT", tuyen: "Tuyến đường",
  H: "Độ cao bộ đèn (m)", vuon: "Độ vươn cần đèn (m)",
  setback: "Khoảng cách trụ đến mép đường (m)", width: "Độ rộng lòng đường (m)",
  spacing: "Khoảng cách trụ TB (m)", lanes: "Số làn xe", tilt: "Góc nghiêng bộ đèn (độ)",
  arrangement: "Cách bố trí trụ", roadClass: "Cấp đường",
  model: "Loại đèn", fitting: "Fitting", power: "Công suất LED (W)", ncc: "Nhà cung cấp",
};

const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };

/** Dòng Excel -> input hình học engine (chưa gồm ies). Trả {input, warnings[]}. */
export function rowToGeometry(row) {
  const w = [];
  const H = num(row[COLS.H]);
  const vuon = num(row[COLS.vuon]) ?? 0;
  const setback = num(row[COLS.setback]) ?? 0;
  const width = num(row[COLS.width]);
  const spacing = num(row[COLS.spacing]);
  let lanes = num(row[COLS.lanes]);
  const tilt = num(row[COLS.tilt]) ?? 0;
  const arrangement = (row[COLS.arrangement] || "1 bên").toString().trim();
  const roadClass = (row[COLS.roadClass] || "").toString().trim().toUpperCase();

  if (H == null) w.push("thiếu Độ cao H");
  if (width == null) w.push("thiếu Độ rộng lòng đường");
  if (spacing == null) w.push("thiếu Khoảng cách trụ");
  if (!lanes || lanes < 1) { lanes = Math.max(1, Math.round((width || 7) / 3.5)); w.push("thiếu Số làn — ước lượng"); }
  if (!/^(A|B1|B2|C1|C2|D1|D2|E)$/.test(roadClass)) w.push("Cấp đường lạ: " + roadClass);

  const overhang = vuon - setback; // net light-point so với mép gần
  return {
    input: { H, overhang, spacing, width, lanes, tilt, arrangement, roadClass: roadClass || "D1" },
    warnings: w,
    meta: {
      stt: row[COLS.stt], tuyen: row[COLS.tuyen],
      model: (row[COLS.model] || "").toString().trim(),
      fitting: (row[COLS.fitting] || "").toString().trim(),
      power: num(row[COLS.power]), ncc: row[COLS.ncc],
    },
  };
}

// ---- So khớp IES ----
export function normKey(s) {
  return String(s || "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]/g, "");
}
// các từ khoá model chính
const MODELS = ["MAGNOLIA", "CARINA", "TEMBINC", "TEMBIN", "SIGMA", "LIME", "HELIOS", "HAZEL", "HORUS", "NHB"];

export function modelKeyword(s) {
  const k = normKey(s);
  for (const m of MODELS) if (k.includes(m)) return m;
  return null;
}
/** Lấy công suất (W) từ tên file hoặc ph.inputWatts (làm tròn). */
export function powerFromName(name) {
  const m = String(name).match(/(\d{2,3})\s*W/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Lập chỉ mục IES: [{name, model, power, ph}]. So khớp 1 dòng -> IES tốt nhất.
 * Ưu tiên: cùng model + đúng công suất; rồi cùng model gần công suất nhất.
 */
export function matchIES(meta, iesIndex) {
  const mk = modelKeyword(meta.model) || modelKeyword(meta.fitting);
  const pw = meta.power;
  let cand = iesIndex.filter((e) => e.model && mk && e.model === mk);
  if (cand.length === 0) return { ies: null, reason: "không có IES cùng model " + (mk || "?") };
  if (pw != null) {
    const exact = cand.filter((e) => e.power === pw);
    if (exact.length) return { ies: exact[0], reason: "khớp model+CS" };
    cand = cand.slice().sort((a, b) => Math.abs((a.power ?? 1e9) - pw) - Math.abs((b.power ?? 1e9) - pw));
    return { ies: cand[0], reason: `cùng model, CS gần nhất (${cand[0].power}W vs ${pw}W)` };
  }
  return { ies: cand[0], reason: "cùng model" };
}
