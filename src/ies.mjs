// Parser IESNA LM-63 (-1995/-2002) cho bộ đèn đường (Type C).
// Trả về object trắc quang + hàm nội suy cường độ intensity(C, gamma).

function tokenizeNumbers(str) {
  return str.trim().split(/[\s,]+/).filter((s) => s.length > 0).map(Number);
}

/**
 * Parse nội dung text của 1 file IES.
 * @param {string} text
 * @returns {object} photometry
 */
export function parseIES(text) {
  // Chuẩn hoá xuống dòng
  const raw = text.replace(/\r\n?/g, "\n").split("\n");

  // Tìm dòng TILT
  let tiltIdx = -1;
  for (let i = 0; i < raw.length; i++) {
    if (/^\s*TILT\s*=/i.test(raw[i])) { tiltIdx = i; break; }
  }
  if (tiltIdx === -1) throw new Error("IES không hợp lệ: thiếu dòng TILT=");

  // Keyword header IESNA: [MANUFAC], [LUMCAT], [LUMINAIRE]... (trước dòng TILT)
  const keywords = {};
  for (let i = 0; i < tiltIdx; i++) {
    const m = raw[i].match(/^\s*\[([^\]]+)\]\s*(.*)$/);
    if (m) keywords[m[1].toUpperCase().trim()] = m[2].trim();
  }

  const tiltSpec = raw[tiltIdx].split("=")[1].trim().toUpperCase();
  let cursor = tiltIdx + 1;
  if (tiltSpec !== "NONE") {
    // TILT=<file> hoặc INCLUDE: bỏ qua khối tilt (1 dòng hệ số + 3 dòng dữ liệu)
    // Theo chuẩn: 1 dòng lamp-to-luminaire geometry, 1 dòng số cặp, rồi angles & factors.
    // Để đơn giản & an toàn, bỏ qua các dòng tới khi gặp dòng 10 số đầu tiên.
    while (cursor < raw.length && tokenizeNumbers(raw[cursor]).length < 10) cursor++;
  }

  // Gom toàn bộ số từ cursor trở đi thành 1 luồng token (IES cho phép ngắt dòng tuỳ ý)
  let nums = [];
  for (let i = cursor; i < raw.length; i++) {
    const line = raw[i];
    if (line.trim() === "") continue;
    nums = nums.concat(tokenizeNumbers(line));
  }

  let p = 0;
  const numLamps = nums[p++];
  const lumensPerLamp = nums[p++];
  const candelaMultiplier = nums[p++];
  const nV = nums[p++]; // số góc dọc (vertical)
  const nH = nums[p++]; // số góc ngang (horizontal)
  const photometricType = nums[p++]; // 1=C, 2=B, 3=A
  const unitsType = nums[p++]; // 1=feet, 2=meters
  const width = nums[p++];
  const length = nums[p++];
  const height = nums[p++];
  const ballastFactor = nums[p++];
  const futureUse = nums[p++]; // (file-generation type / future use)
  const inputWatts = nums[p++];

  const vAngles = [];
  for (let i = 0; i < nV; i++) vAngles.push(nums[p++]);
  const hAngles = [];
  for (let i = 0; i < nH; i++) hAngles.push(nums[p++]);

  // Ma trận candela: thứ tự theo chuẩn là [mỗi góc ngang H] x [mỗi góc dọc V]
  const factor = candelaMultiplier * (ballastFactor || 1);
  const candela = [];
  for (let h = 0; h < nH; h++) {
    const row = [];
    for (let v = 0; v < nV; v++) row.push(nums[p++] * factor);
    candela.push(row);
  }

  const needed = 13 + nV + nH + nH * nV;
  if (nums.length < needed) {
    throw new Error(`IES hỏng: cần ${needed} số, chỉ có ${nums.length}`);
  }

  return {
    numLamps, lumensPerLamp, candelaMultiplier, ballastFactor,
    inputWatts, photometricType, unitsType,
    width, length, height,
    nV, nH, vAngles, hAngles, candela,
    totalLumens: (lumensPerLamp > 0 ? lumensPerLamp * numLamps : null),
    keywords,
    manufac: keywords.MANUFAC || keywords.MANUFACTURER || null,
    lumcat: keywords.LUMCAT || null,
    lampCode: (keywords.LAMP || "").replace(/\s*\([^)]*\)\s*$/, "").trim() || null,
    luminaireName: keywords.LUMINAIRE || null,
    cct: findKeyword(keywords, ["CCT", "COLORTEMP", "COLOURTEMP", "KELVIN", "TC"], /(\d{3,5})\s*K/i),
    cri: findKeyword(keywords, ["CRI", "RA", "COLORRENDER", "COLOURRENDER"], /(?:CRI|RA)\s*[:=]?\s*(\d{2,3})/i),
  };
}

/**
 * Tìm trị số CCT/CRI trong keyword IES: ưu tiên key tên khớp danh sách;
 * nếu không có, dò số theo regex trong mọi giá trị keyword ([OTHER], [LAMP]...).
 */
function findKeyword(kw, names, rx) {
  for (const n of names) {
    for (const k of Object.keys(kw)) {
      if (k.replace(/[^A-Z0-9]/gi, "").toUpperCase() === n) {
        const m = String(kw[k]).match(/(\d{2,5})/);
        if (m) return m[1];
      }
    }
  }
  for (const k of Object.keys(kw)) {
    const m = String(kw[k]).match(rx);
    if (m) return m[1];
  }
  return null;
}

// ---- Nội suy cường độ theo hướng (C ngang, gamma dọc), đơn vị độ ----
function lerp(a, b, t) { return a + (b - a) * t; }

function findSpan(arr, x) {
  // trả về [i, t]: arr[i] <= x <= arr[i+1], t tỉ lệ
  if (x <= arr[0]) return [0, 0];
  const n = arr.length;
  if (x >= arr[n - 1]) return [n - 2, 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= x) lo = mid; else hi = mid;
  }
  const t = (x - arr[lo]) / (arr[lo + 1] - arr[lo]);
  return [lo, t];
}

// Map góc ngang C về miền dữ liệu có sẵn, xét đối xứng.
function mapHorizontalAngle(hAngles, C) {
  const hmax = hAngles[hAngles.length - 1];
  let c = ((C % 360) + 360) % 360;
  if (hmax <= 0.5) return 0; // đối xứng tròn: chỉ 1 mặt
  if (Math.abs(hmax - 90) < 1e-6) {
    // đối xứng 4 phần (0..90): gập về 0..90
    if (c > 180) c = 360 - c;      // 0..180
    if (c > 90) c = 180 - c;       // 0..90
  } else if (Math.abs(hmax - 180) < 1e-6) {
    // đối xứng 2 phần (0..180): gập về 0..180
    if (c > 180) c = 360 - c;
  }
  // hmax == 360: dùng trực tiếp
  return c;
}

/**
 * Tạo hàm nội suy cường độ (cd) theo hướng.
 * @param {object} ph kết quả parseIES
 * @returns {(C:number, gamma:number)=>number}
 */
export function makeIntensity(ph) {
  const { vAngles, hAngles, candela } = ph;
  return function intensity(C, gamma) {
    if (gamma < vAngles[0] || gamma > vAngles[vAngles.length - 1]) {
      // ngoài miền góc dọc (vd > 90°): không có số liệu → 0
      if (gamma > vAngles[vAngles.length - 1]) return 0;
    }
    const [vi, vt] = findSpan(vAngles, gamma);
    if (hAngles.length === 1) {
      // Đối xứng tròn hoàn toàn: chỉ 1 mặt, nội suy theo V
      return candela[0][vi] + (candela[0][vi + 1] - candela[0][vi]) * vt;
    }
    const c = mapHorizontalAngle(hAngles, C);
    const [hi, ht] = findSpan(hAngles, c);
    const c00 = candela[hi][vi];
    const c01 = candela[hi][vi + 1];
    const c10 = candela[hi + 1][vi];
    const c11 = candela[hi + 1][vi + 1];
    const cLo = lerp(c00, c01, vt);
    const cHi = lerp(c10, c11, vt);
    return lerp(cLo, cHi, ht);
  };
}

/**
 * Tích phân phân bố candela ra quang thông (lumen) để kiểm chứng parser.
 * Φ = ∫∫ I(C,γ) sinγ dγ dC . Dùng để so với totalLumens.
 */
export function integrateFlux(ph) {
  const I = makeIntensity(ph);
  const dC = 2, dG = 1; // độ
  let flux = 0;
  for (let C = 0; C < 360; C += dC) {
    for (let g = 0; g < 180; g += dG) {
      const gammaMid = g + dG / 2;
      if (gammaMid > ph.vAngles[ph.vAngles.length - 1]) continue;
      const Imid = I(C + dC / 2, gammaMid);
      const sin = Math.sin((gammaMid * Math.PI) / 180);
      flux += Imid * sin * (dG * Math.PI / 180) * (dC * Math.PI / 180);
    }
  }
  return flux;
}
