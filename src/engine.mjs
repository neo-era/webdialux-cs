// Engine: ghép hình học + photometry + metrics cho 1 tuyến/phương án.
import { makeIntensity } from "./ies.mjs";
import { buildLuminaires, buildGrid, buildObservers, angleLumToPoint } from "./geometry.mjs";
import { illuminanceAtPoint, luminanceAtPoint, thresholdIncrement } from "./photometry.mjs";
import { stats, longitudinalUniformity } from "./metrics.mjs";
import { makeRTableFromData, scaleRTable } from "./rtable.mjs";
import R3DATA from "./r3data.mjs";

const R3 = makeRTableFromData(R3DATA); // bảng R3 CIE thật (từ DIALux), q0=0,07

// Ngưỡng QCVN 07-7:2023
export const QCVN = {
  A:  { Ltb: 2.0, Uo: 0.4, Ul: 0.7, TI: 10, SR: 0.5 },
  B1: { Ltb: 1.5, Uo: 0.4, Ul: 0.7, TI: 10, SR: 0.5 },
  B2: { Ltb: 2.0, Uo: 0.4, Ul: 0.7, TI: 10, SR: 0.5 },
  C1: { Ltb: 1.0, Uo: 0.4, Ul: 0.6, TI: 15, SR: 0.5 },
  C2: { Ltb: 1.5, Uo: 0.4, Ul: 0.6, TI: 15, SR: 0.5 },
  D1: { Ltb: 0.7, Uo: 0.3, Ul: 0.4, TI: 20, SR: 0.5 },
  D2: { Ltb: 0.5, Uo: 0.3, Ul: 0.4, TI: 20, SR: 0.5 },
  E:  { Ltb: 0.3, Uo: 0.3, Ul: 0.4, TI: 20, SR: 0.5 },
};

function avgE(points, lums, I, MF) {
  let s = 0; for (const P of points) s += illuminanceAtPoint(P, lums, I, MF); return s / points.length;
}

export function calcRoad(input) {
  const {
    ies, H, overhang, spacing, width, lanes = 2, arrangement = "1 bên",
    tilt = 0, MF = 0.8, roadClass = "D1", spanWindow = 5,
    q0 = null, detail = false,
  } = input;
  // Bảng r mặt đường: ưu tiên rfn truyền vào; nếu không, dùng R3 (q0=0,07),
  // nhân tỉ lệ nếu người dùng chọn q0 khác (vd 0,08 theo DIALux Tarmac).
  const rfn = input.rfn || (q0 && q0 !== R3.q0 ? scaleRTable(R3, q0) : R3);

  const g = { H, overhang, spacing, width, lanes, arrangement, tilt, spanWindow };
  const I = makeIntensity(ies);
  const lums = buildLuminaires(g);
  const grid = buildGrid(g);
  const observers = buildObservers(g, grid);

  // Độ rọi (không phụ thuộc observer/R-table)
  const Evals = grid.points.map((P) => illuminanceAtPoint(P, lums, I, MF));
  const E = stats(Evals);

  // Độ chói theo từng observer
  const obsResults = observers.map((obs) => {
    const Lvals = grid.points.map((P) => luminanceAtPoint(P, lums, I, rfn, obs, MF));
    const s = stats(Lvals);
    const Ul = longitudinalUniformity(Lvals, grid);
    const { Lv, TI } = thresholdIncrement(lums, I, obs, s.avg, MF);
    const out = { pos: obs, Lav: s.avg, Uo: s.min / s.avg, Ul, Lmin: s.min, Lmax: s.max, Lv, TI };
    if (detail) out.Lvals = Lvals;
    return out;
  });

  // Kết quả mặt đường = xấu nhất qua observer
  const road = {
    Lav: Math.min(...obsResults.map(o => o.Lav)),
    Uo:  Math.min(...obsResults.map(o => o.Uo)),
    Ul:  Math.min(...obsResults.map(o => o.Ul)),
    TI:  Math.max(...obsResults.map(o => o.TI)),
  };

  // SR: dải 5m ngoài carriageway / dải 5m mép trong
  const sampleStrip = (y0, y1) => {
    const pts = [];
    const nx = grid.nLong, ny = 5;
    for (let i = 0; i < nx; i++) {
      const x = grid.dL / 2 + i * grid.dL;
      for (let j = 0; j < ny; j++) {
        const y = y0 + (y1 - y0) * (j + 0.5) / ny;
        pts.push({ x, y });
      }
    }
    return avgE(pts, lums, I, MF);
  };
  const W = width;
  const sw = Math.min(5, W / 2); // bề rộng dải = min(5m, nửa lòng đường) — tránh chồng dải
  const outL = sampleStrip(-sw, 0), outR = sampleStrip(W, W + sw);
  const inL = sampleStrip(0, sw), inR = sampleStrip(W - sw, W);
  const SR = (outL + outR) / (inL + inR);
  road.SR = SR;

  const req = QCVN[roadClass] || QCVN.D1;
  // So sánh theo đúng độ chính xác hiển thị (2 chữ số; TI làm tròn số nguyên) để
  // verdict khớp con số in ra — tránh kiểu 0,499 hiển thị 0,50 mà lại ✗.
  const r2 = (x) => Math.round(x * 100) / 100;
  const checks = {
    Ltb: r2(road.Lav) >= req.Ltb,
    Uo: r2(road.Uo) >= req.Uo,
    Ul: r2(road.Ul) >= req.Ul,
    TI: Math.round(road.TI) <= req.TI,
    SR: r2(road.SR) >= req.SR,
  };
  const pass = Object.values(checks).every(Boolean);

  return {
    E, road, observers: obsResults, grid, Evals,
    req, checks, pass, roadClass,
    provisionalLuminance: !!rfn.provisional,
  };
}
