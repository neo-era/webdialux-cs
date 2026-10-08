// Ánh xạ dòng Excel (file phẳng DU LIEU TUYEN) -> input hình học cho engine,
// và so khớp bộ đèn với file IES trong thư mục.

export const COLS = {
  stt: "STT", tuyen: "Tuyến đường",
  H: "Độ cao bộ đèn (m)", vuon: "Độ vươn cần đèn (m)",
  setback: "Khoảng cách trụ đến mép đường (m)", width: "Độ rộng lòng đường (m)",
  spacing: "Khoảng cách trụ TB (m)", lanes: "Số làn xe", tilt: "Góc nghiêng bộ đèn (độ)",
  arrangement: "Cách bố trí trụ", roadClass: "Cấp đường", loaituyen: "Loại tuyến",
  dpc: "Dải phân cách giữa", luuluong: "Lưu lượng xe",
  model: "Loại đèn", fitting: "Fitting", power: "Công suất LED (W)", ncc: "Nhà cung cấp",
};

const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };

const VALID_CLASS = /^(A|B1|B2|C1|C2|D1|D2|E)$/;

/**
 * Tự phân cấp đường (QCVN 07-7:2023) từ hình học khi dữ liệu không ghi cấp.
 * Dựa vào bề rộng, số làn, dải phân cách. (Heuristic — người dùng có thể ghi đè bằng cột "Cấp đường".)
 */
export function classifyRoadClass({ width, lanes, median }) {
  const w = width || 0, L = lanes || 0;
  if (w >= 14 || L >= 4) return median ? "B1" : "B2";   // trục chính / liên khu vực
  if (w >= 10 || L >= 3) return median ? "C1" : "C2";   // cấp khu vực có buôn bán
  if (w >= 5) return "D1";                              // cấp khu vực
  return "E";                                           // nội bộ / hẻm nhỏ
}

/**
 * Quy đổi "Loại tuyến" (chữ người dùng ghi) -> cấp đường QCVN 07-7:2023.
 * Theo mô tả cấp trong tiêu chuẩn; B/C tách 1/2 theo có/không dải phân cách giữa.
 * Trả null nếu không nhận ra loại -> để lớp gọi lùi về phân theo hình học.
 */
export function classifyFromType(typeText, { median } = {}) {
  const s = String(typeText || "").toLowerCase().normalize("NFC").trim();
  if (!s) return null;
  const has = (...kw) => kw.some((k) => s.includes(k));
  // A — đường cao tốc đô thị
  if (has("cao tốc", "cao toc")) return "A";
  // E — nhóm nhà ở / nội bộ / ngõ, hẻm  (xét sớm: "nhóm nhà ở" không được rơi vào D)
  if (has("nhóm nhà ở", "nhom nha o", "nội bộ", "noi bo", "hẻm", "hem", "ngõ", "ngo", "nội khu", "noi khu", "đường nhỏ", "duong nho", "nhánh nhỏ", "nhanh nho"))
    return "E";
  // B — trục chính đô thị / chính đô thị / liên khu vực
  if (has("trục chính", "truc chinh", "chính đô thị", "chinh do thi", "liên khu vực", "lien khu vuc", "trục", "truc", "quốc lộ", "quoc lo", "đại lộ", "dai lo"))
    return median ? "B1" : "B2";
  // C — đường chính khu vực / khu vực có buôn bán, thương mại  (xét "chính khu vực" TRƯỚC "khu vực")
  if (has("chính khu vực", "chinh khu vuc", "buôn bán", "buon ban", "thương mại", "thuong mai", "chợ", "cho ", "mua sắm", "mua sam", "phố thương", "pho thuong", "thị tứ", "thi tu"))
    return median ? "C1" : "C2";
  // D — đường (cấp/phân) khu vực, khu dân cư (D1 hè sáng mặc định; D2 nếu ghi "hè tối")
  if (has("hè tối", "he toi", "ít người", "it nguoi", "vắng", "vang")) return "D2";
  if (has("phân khu vực", "phan khu vuc", "khu vực", "khu vuc", "khu dân cư", "khu dan cu", "dân cư", "dan cu", "khu ở", "khu o", "khu đô thị", "khu do thi"))
    return "D1";
  return null;
}

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

  if (H == null) w.push("thiếu Độ cao H");
  if (width == null) w.push("thiếu Độ rộng lòng đường");
  if (spacing == null) w.push("thiếu Khoảng cách trụ");
  if (!lanes || lanes < 1) { lanes = Math.max(1, Math.round((width || 7) / 3.5)); w.push("ước lượng số làn"); }

  // Cấp đường — thứ tự ưu tiên:
  //  (1) cột "Cấp đường" nếu hợp lệ  -> dùng thẳng (classSource="cột")
  //  (2) cột "Loại tuyến" quy đổi được -> dùng (classSource="loại tuyến")
  //  (3) đoán theo hình học           -> (classSource="hình học")
  let roadClass = (row[COLS.roadClass] || "").toString().trim().toUpperCase();
  let autoClass = false, classSource = "cột";
  if (!VALID_CLASS.test(roadClass)) {
    const dpc = String(row[COLS.dpc] || "").toLowerCase().trim();
    const noMedian = dpc === "" || dpc.includes("không") || dpc.includes("khong") || dpc === "0" || dpc === "no" || dpc === "false";
    const median = !noMedian && (dpc.includes("có") || dpc.includes("co") || dpc.includes("yes") || dpc.includes("true") || dpc === "1");
    const fromType = classifyFromType(row[COLS.loaituyen], { median });
    if (fromType) { roadClass = fromType; classSource = "loại tuyến"; }
    else { roadClass = classifyRoadClass({ width, lanes, median }); classSource = "hình học"; }
    autoClass = true;
  }

  const overhang = vuon - setback; // net light-point so với mép gần
  return {
    input: { H, overhang, spacing, width, lanes, tilt, arrangement, roadClass },
    warnings: w, autoClass, classSource,
    meta: {
      stt: row[COLS.stt], tuyen: row[COLS.tuyen],
      model: (row[COLS.model] || "").toString().trim(),
      fitting: (row[COLS.fitting] || "").toString().trim(),
      power: num(row[COLS.power]), ncc: row[COLS.ncc], autoClass, classSource,
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
