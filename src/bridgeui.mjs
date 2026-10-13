// Giao diện chế độ "Cầu" (phương án A — bàn làm việc 1 cầu): trái = mặt cắt ngang + thông số, phải = KPI + mặt bằng/3D + trắc dọc.
// Tự dựng DOM trong #bridgeView; trang chính gọi initBridgeUI(...) và chuyển chế độ.
import { calcBridge, pickBridgeIes, validateBridge, parseBridgeRows, buildBridgeWorkbook, BRIDGE_DEFAULTS, BRIDGE_SAMPLES, BRIDGE_SHEET, POLE_SITES, WALK_REQS } from "./bridge.mjs";
import { drawCrossSection, drawProfile, drawPlan, drawBridge3D, defaultBridgeCamera } from "./bridgeDraw.mjs";
import { heatColor } from "./areaDraw.mjs";
import { findReq } from "./areaReq.mjs";
import { QCVN } from "./engine.mjs";
import { VERSION } from "./version.mjs";

const CSS = `
#bridgeView{padding:12px 0}
body.bridge .wrap{max-width:min(1680px,100%)}
#bridgeView .bv{display:grid;grid-template-columns:minmax(0,430px) minmax(0,1fr);gap:14px;align-items:start}
@media (max-width:980px){#bridgeView .bv{grid-template-columns:1fr}#bridgeView .bv>div:last-child{order:-1}}
#bridgeView .bv>*{min-width:0}
#bridgeView .card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px;box-shadow:0 1px 2px rgba(16,24,40,.05),0 4px 14px rgba(16,24,40,.05);margin-bottom:12px}
#bridgeView h3{margin:0;font-size:14px}
#bridgeView h4{margin:12px 0 6px;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
#bridgeView .hd{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
#bridgeView .hd .sp{flex:1}
#bridgeView .hd select{flex:1;min-width:0;font-weight:600}
#bridgeView canvas{width:100%;height:auto;display:block;border-radius:8px}
#bridgeView .fg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px}
#bridgeView .fg label{display:flex;flex-direction:column;gap:3px;font-size:11.5px;color:var(--muted);min-width:0}
#bridgeView .fg label.w2{grid-column:1/-1}
#bridgeView .fg input,#bridgeView .fg select{width:100%;min-width:0;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:13px var(--mono);padding:6px 8px;border-radius:6px}
#bridgeView .fg select,#bridgeView .fg input[type=text]{font-family:var(--sans)}
#bridgeView .fg input:focus,#bridgeView .fg select:focus{border-color:var(--accent);outline:none}
#bridgeView .fg input.bad{border-color:var(--fail)}
#bridgeView .kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:12px}
@media (max-width:1180px){#bridgeView .kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
#bridgeView .kpi{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:9px 11px}
#bridgeView .kpi .n{font:600 20px var(--mono);line-height:1.1}
#bridgeView .kpi .l{font-size:11px;color:var(--muted);margin-top:3px}
#bridgeView .ok{color:var(--ok)}#bridgeView .bad{color:var(--fail)}#bridgeView .na{color:var(--muted)}
#bridgeView .verdict{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:9px 12px;border-radius:9px;margin-bottom:12px;font-size:13px}
#bridgeView .verdict.ok{background:var(--ok-bg)}#bridgeView .verdict.bad{background:var(--fail-bg)}
#bridgeView .verdict b{font-size:14px}
#bridgeView .vtabs{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:8px}
#bridgeView .vtabs button{border:none;border-radius:0;font-size:12.5px;padding:6px 12px}
#bridgeView .vtabs button.on{background:var(--accent);color:var(--accent-ink)}
#bridgeView .legend{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--muted);margin-top:6px;flex-wrap:wrap}
#bridgeView .legend .bar{width:160px;height:9px;border-radius:3px}
#bridgeView .warn{font-size:12px;color:var(--warn);margin:0 0 10px;padding-left:18px}
#bridgeView .err{font-size:12.5px;color:var(--fail);margin:0 0 10px;padding-left:18px}
#bridgeView .hint{font-size:12px;color:var(--muted);margin:6px 0 0}
#bridgeView .empty{padding:28px;text-align:center;color:var(--muted)}
#bridgeView .tw{overflow:auto;max-height:40vh;border:1px solid var(--line);border-radius:8px}
#bridgeView table{border-collapse:collapse;width:100%;font-size:12.5px}
#bridgeView th{position:sticky;top:0;background:var(--surface-2);color:var(--muted);font-size:11px;text-transform:uppercase;padding:6px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}
#bridgeView td{padding:5px 6px;border-bottom:1px solid var(--line);text-align:right;font-family:var(--mono);white-space:nowrap}
#bridgeView td:first-child,#bridgeView th:first-child{text-align:left}
#bridgeView tr.worst td{background:color-mix(in srgb,var(--warn) 14%,transparent)}
#bridgeView details summary{cursor:pointer;font-size:13px;font-weight:600;padding:4px 0}
@media (max-width:640px){
#bridgeView .kpis{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
#bridgeView .kpi{padding:7px 8px}#bridgeView .kpi .n{font-size:17px}
#bridgeView .fg input,#bridgeView .fg select{min-height:44px;font-size:16px}
#bridgeView .vtabs{display:flex;width:100%}#bridgeView .vtabs button{flex:1;justify-content:center;min-height:44px}
#bridgeView .hd button,#bridgeView .hd select{min-height:44px}
}
`;

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const f2 = (x, d = 2) => (x == null || !isFinite(x) ? "—" : Number(x).toFixed(d).replace(".", ","));
const N = (v) => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };

// trường nhập: [key, nhãn, kiểu, tuỳ chọn]
const GEO = [
  ["name", "Tên cầu", "text", { w2: true }],
  ["roadClass", "Cấp đường (QCVN 07-7)", "sel", { opts: Object.keys(QCVN).map((k) => [k, k]) }],
  ["length", "Chiều dài cầu (m)", "num", { step: 1 }],
  ["width", "Lòng đường (m)", "num", { step: 0.5 }],
  ["lanes", "Số làn", "num", { step: 1 }],
  ["walk", "Lề bộ hành mỗi bên (m)", "num", { step: 0.25 }],
  ["medianW", "Dải phân cách (m)", "num", { step: 0.25 }],
  ["guard", "Gờ chắn (m)", "num", { step: 0.05 }],
  ["parapetH", "Chiều cao lan can (m)", "num", { step: 0.1 }],
];
const PROF = [
  ["grade", "Dốc dọc (%)", "num", { step: 0.25 }],
  ["Rv", "Bán kính cong đứng (m)", "num", { step: 100, ph: "đỉnh gãy" }],
  ["site", "Vị trí trụ", "sel", { opts: Object.entries(POLE_SITES).map(([k, v]) => [k, v]) }],
  ["arrangement", "Bố trí", "sel", { opts: [["1 bên", "1 bên"], ["đối xứng", "đối xứng"], ["so le", "so le"], ["giữa", "giữa (cần đôi)"]] }],
  ["spacing", "Khoảng cách trụ (m)", "num", { step: 1 }],
  ["poleStart", "Trụ đầu cách mố (m)", "num", { step: 1, ph: "tự canh giữa" }],
  ["setback", "Trụ → mép lòng đường (m)", "num", { step: 0.05, ph: "tự tính" }],
  ["approachLit", "Đường dẫn có chiếu sáng", "sel", { opts: [["1", "có"], ["0", "không"]] }],
];
const LAMP = [
  ["H", "Độ cao đèn H (m)", "num", { step: 0.5 }],
  ["arm", "Độ vươn (m)", "num", { step: 0.25 }],
  ["tilt", "Góc nghiêng (°)", "num", { step: 1 }],
  ["rot", "Góc xoay (°)", "num", { step: 1 }],
  ["perPole", "Số đèn/trụ", "num", { step: 1 }],
  ["MF", "MF riêng", "num", { step: 0.05, ph: "MF chung" }],
  ["walkReq", "Yêu cầu lề bộ hành", "sel", { w2: true, opts: WALK_REQS.map((id) => [id, (findReq(id) || {}).label || id]) }],
];

export function initBridgeUI({ root, setStatus, getIes, getMF, getQ0, saveXlsxBuffer, outName, getPdfTools }) {
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  const st = { bridges: [], sel: 0, view: "plan", res: null, err: null, cam: null, name: "" };
  const cur = () => st.bridges[st.sel] || null;
  const iesList = () => getIes().filter((e) => !e.ph || !e.ph.photometricType || e.ph.photometricType === 1);
  let timer = null, lastKey = null, pickCache = new Map();

  // ---------------------------------------------------------------- tính
  function inputOf(b) { return { ...b, MF: b.MF ?? getMF(), q0: getQ0(), detail: true }; }
  function compute(b, { detail = true } = {}) {
    const list = iesList();
    const v = validateBridge(b, { hasIes: list.length > 0 });
    if (v.errors.length) return { err: v.errors };
    const inp = { ...inputOf(b), detail };
    let ies = null, auto = false;
    if (b.iesName) ies = list.find((e) => e.name === b.iesName) || null;
    if (!ies) {
      const key = JSON.stringify({ ...b, cam: null, MF: inp.MF, q0: inp.q0, n: list.length });
      let p = pickCache.get(key);
      if (!p) { if (pickCache.size > 40) pickCache.clear(); p = pickBridgeIes({ ...inp, detail: false }, list); pickCache.set(key, p); }
      if (!p) return { err: ["Không bộ đèn nào trong thư mục IES tính được cho cầu này"] };
      ies = p.ies; auto = true;
    }
    try { const r = calcBridge({ ...inp, ies: ies.ph }); return { r, ies, auto, power: ies.power, iesName: ies.name, noPass: auto && !r.pass }; }
    catch (e) { return { err: [e.message] }; }
  }
  function recalc() { clearTimeout(timer); timer = setTimeout(() => { st.res = cur() ? compute(cur()) : null; lastKey = null; render(true); }, 400); }

  // ---------------------------------------------------------------- vẽ
  const field = ([k, label, type, o = {}], b) => {
    const v = b[k];
    if (type === "sel") {
      const val = k === "approachLit" ? (v === false ? "0" : "1") : String(v ?? "");
      return `<label${o.w2 ? ' class="w2"' : ""}>${label}<select data-k="${k}">${o.opts.map(([x, t]) => `<option value="${esc(x)}"${x === val ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
    }
    return `<label${o.w2 ? ' class="w2"' : ""}>${label}<input data-k="${k}" ${type === "num" ? `type="number" inputmode="decimal" step="${o.step || "any"}"` : 'type="text"'} value="${esc(v ?? "")}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ""}></label>`;
  };
  function iesSelect(b) {
    const list = iesList();
    return `<label class="w2">Bộ đèn (file IES)<select data-k="iesName"><option value="">Tự chọn — công suất nhỏ nhất vẫn Đạt</option>${list.map((e) => `<option value="${esc(e.name)}"${e.name === b.iesName ? " selected" : ""}>${esc(e.name.replace(/\.ies$/i, ""))}${e.power ? ` · ${e.power} W` : ""}</option>`).join("")}</select></label>`;
  }
  const colors = () => { const t = document.documentElement.dataset.theme; return { dark: t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches }; };
  function kpi(v, l, ok) { return `<div class="kpi"><div class="n ${ok == null ? "na" : ok ? "ok" : "bad"}">${v}</div><div class="l">${l}</div></div>`; }

  function render(keep = false) {
    if (!root) return;
    if (!st.bridges.length) {
      root.innerHTML = `<div class="card empty"><h3 style="margin-bottom:8px">Chế độ Cầu — chiếu sáng mặt cầu giao thông</h3>
        <p>Lòng đường theo QCVN 07-7:2023 (Ltb, Uo, Ul, TI, SR) và lề bộ hành theo TCVN 13608:2023, có dốc dọc và đường cong đứng.</p>
        <p>Nạp Excel có sheet <b>${BRIDGE_SHEET}</b> (☰ Menu → <i>Tải Excel mẫu cầu</i>), hoặc bắt đầu từ cầu mẫu rồi sửa trực tiếp.</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${BRIDGE_SAMPLES.map((s, i) => `<button data-bsample="${i}"${i ? "" : ' class="primary"'}>${esc(s.name.split(" — ")[0])}</button>`).join("")}<button data-bnew="1">＋ Cầu trống</button></div></div>`;
      return;
    }
    const b = cur(), R = st.res, r = R && R.r;
    if (!keep || !root.querySelector(".bv")) {
      root.innerHTML = `<div class="bv">
        <div>
          <div class="card">
            <div class="hd"><select id="bvSel" aria-label="Chọn cầu">${st.bridges.map((x, i) => `<option value="${i}"${i === st.sel ? " selected" : ""}>${esc(x.name || "Cầu " + (i + 1))}</option>`).join("")}</select>
              <button id="bvAdd" title="Thêm cầu">＋</button><button id="bvDup" title="Nhân bản cầu">⧉</button><button id="bvDel" title="Xoá cầu">✕</button></div>
            <canvas id="bvXs" aria-label="Mặt cắt ngang cầu"></canvas>
            <h4>Mặt cắt ngang</h4><div class="fg">${GEO.map((f) => field(f, b)).join("")}</div>
            <h4>Trắc dọc & bố trí trụ</h4><div class="fg">${PROF.map((f) => field(f, b)).join("")}</div>
            <h4>Bộ đèn</h4><div class="fg">${LAMP.map((f) => field(f, b)).join("")}${iesSelect(b)}</div>
          </div>
        </div>
        <div>
          <div id="bvRes"></div>
          <div class="card"><div class="vtabs" role="tablist"><button data-v="plan">Mặt bằng</button><button data-v="3d">Phối cảnh 3D</button></div>
            <canvas id="bvMain" aria-label="Mặt bằng / phối cảnh cầu" style="touch-action:none"></canvas><div class="legend" id="bvLeg"></div></div>
          <div class="card"><h3 style="margin-bottom:8px">Trắc dọc</h3><canvas id="bvProf" aria-label="Trắc dọc cầu"></canvas></div>
          <div class="card"><details id="bvFields"><summary>Kết quả từng ô dọc cầu</summary><div class="tw" id="bvTbl"></div></details></div>
        </div></div>`;
      wire();
    }
    root.querySelectorAll(".vtabs button").forEach((x) => x.classList.toggle("on", x.dataset.v === st.view));
    // kết quả
    const box = root.querySelector("#bvRes");
    if (!r) root.querySelector("#bvTbl").innerHTML = `<p class="hint" style="padding:8px">Chưa có kết quả.</p>`;
    if (!iesList().length) box.innerHTML = `<div class="card" style="color:var(--muted)">Chọn <b>📁 thư mục IES</b> để tính. Mặt cắt và trắc dọc đã vẽ theo số liệu nhập.</div>`;
    else if (!R) box.innerHTML = `<div class="card" style="color:var(--muted)"><span class="spin"></span> Đang tính…</div>`;
    else if (R.err) box.innerHTML = `<div class="card"><ul class="err">${R.err.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
    else {
      const c = r.checks, q = r.req, w = r.walk;
      box.innerHTML = `<div class="verdict ${r.pass ? "ok" : "bad"}"><b class="${r.pass ? "ok" : "bad"}">${r.pass ? "ĐẠT" : "KHÔNG ĐẠT"}</b>
          <span>cấp ${r.roadClass} · ${esc(R.iesName.replace(/\.ies$/i, ""))}${R.power ? ` · ${R.power} W` : ""}${R.auto ? (R.noPass ? " · <span class='bad'>không bộ nào Đạt — đang hiện bộ Ltb cao nhất</span>" : " · tự chọn") : ""}</span></div>
        <div class="kpis">${kpi(f2(r.road.Lav), `Ltb ≥ ${f2(q.Ltb)} cd/m²`, c.Ltb)}${kpi(f2(r.road.Uo), `Uo ≥ ${f2(q.Uo)}`, c.Uo)}${kpi(f2(r.road.Ul), `Ul ≥ ${f2(q.Ul)}`, c.Ul)}${kpi(f2(r.road.TI, 0), `TI ≤ ${q.TI} %`, c.TI)}${kpi(r.road.SR == null ? "—" : f2(r.road.SR), r.road.SR == null ? "SR · không có lề" : `SR ≥ ${f2(q.SR)}`, c.SR)}${kpi(w ? f2(w.Eav, 1) + " lx" : "—", w ? `Lề BH Eav ≥ ${w.req.Eav} · Uo ${f2(w.Uo)}` : "Không có lề bộ hành", w ? w.pass : null)}</div>
        ${(r.warnings || []).length ? `<ul class="warn">${r.warnings.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}`;
      const tb = root.querySelector("#bvTbl");
      tb.innerHTML = `<table><thead><tr><th>Ô</th><th>x (m)</th><th>Cao độ</th><th>Dốc %</th><th>Ltb</th><th>Uo</th><th>Ul</th><th>TI</th><th>SR</th><th>Eav lx</th><th>Khuất</th></tr></thead><tbody>${r.fields.map((f) =>
        `<tr${f.f === r.road.worstField.Lav ? ' class="worst"' : ""}><td>${f.f + 1}</td><td>${f2(f.x0, 0)}–${f2(f.x1, 0)}</td><td>${f2(f.zMid)}</td><td>${f2(f.slopeMid * 100)}</td><td class="${Math.round(f.Lav * 100) / 100 >= q.Ltb ? "" : "bad"}">${f2(f.Lav)}</td><td>${f2(f.Uo)}</td><td>${f2(f.Ul)}</td><td>${f2(f.TI, 0)}</td><td>${f.SR == null ? "—" : f2(f.SR)}</td><td>${f2(f.E.avg, 1)}</td><td>${f.hidden ? Math.round(f.hidden * 100) + " %" : "—"}</td></tr>`).join("")}</tbody></table>`;
    }
    draw();
  }
  function sizeCanvas(cv, ratio) {
    const dpr = Math.min(2.5, window.devicePixelRatio || 1), w = Math.max(240, cv.clientWidth || 600);
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * ratio * dpr); return dpr;
  }
  function draw(fast = false) {
    const b = cur(); if (!b || !root.querySelector(".bv")) return;
    const r = st.res && st.res.r ? st.res.r : null, valid = !validateBridge(b).errors.length;
    const xs = root.querySelector("#bvXs"), main = root.querySelector("#bvMain"), pf = root.querySelector("#bvProf");
    if (!fast) {
      if (valid) { const d = sizeCanvas(xs, 0.42); drawCrossSection(xs.getContext("2d"), xs.width, xs.height, b, { px: d }); }
      if (valid) { const d = sizeCanvas(pf, Math.max(0.28, 190 / Math.max(240, pf.clientWidth))); drawProfile(pf.getContext("2d"), pf.width, pf.height, b, r, { px: d }); }
    }
    if (!valid) { for (const c of [xs, main, pf]) { const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height); } root.querySelector("#bvLeg").innerHTML = ""; return; }
    const leg = root.querySelector("#bvLeg");
    if (st.view === "plan") {
      const wv = Math.max(0, +b.walk || 0), cw = Math.max(300, main.clientWidth), ratio = Math.max(0.2, Math.min(0.55, ((+b.width + 2 * wv + 4) * (cw < 900 ? 7 : 2.8) / Math.max(10, +b.length)) + 70 / cw));
      const d = sizeCanvas(main, ratio); const rg = drawPlan(main.getContext("2d"), main.width, main.height, b, r, { px: d, dark: colors().dark });
      const grad = [0, 0.25, 0.5, 0.75, 1].map((t) => `rgb(${heatColor(t).join(",")}) ${t * 100}%`).join(",");
      leg.innerHTML = r ? `<span class="bar" style="background:linear-gradient(90deg,${grad})"></span><span>${f2(rg.lo, 0)} – ${f2(rg.hi, 0)} lx · độ rọi trên mặt cầu (theo pháp tuyến) · khung vàng: ô Ltb thấp nhất</span>` : "";
    } else {
      if (!fast || !main.width) sizeCanvas(main, 0.55);
      if (!st.cam) st.cam = b.cam || defaultBridgeCamera(b);
      const d = Math.min(2.5, window.devicePixelRatio || 1);
      drawBridge3D(main.getContext("2d"), main.width, main.height, b, r, { px: d, cam: st.cam, fast });
      leg.innerHTML = `<span>Kéo để xoay · lăn chuột / chụm 2 ngón để phóng to · bấm đúp về góc mặc định. Mặt cầu tô theo độ rọi đã tính; trụ cầu, dầm minh hoạ.</span>`;
    }
  }

  // ---------------------------------------------------------------- sự kiện
  function wire() {
    root.querySelector("#bvSel").onchange = (e) => select(+e.target.value);
    root.querySelector("#bvAdd").onclick = () => { st.bridges.push({ ...BRIDGE_DEFAULTS, name: `Cầu ${st.bridges.length + 1}` }); select(st.bridges.length - 1); };
    root.querySelector("#bvDup").onclick = () => { const b = cur(); st.bridges.splice(st.sel + 1, 0, { ...b, name: b.name + " (bản sao)" }); select(st.sel + 1); };
    root.querySelector("#bvDel").onclick = () => { if (st.bridges.length <= 1) return; st.bridges.splice(st.sel, 1); select(Math.min(st.sel, st.bridges.length - 1)); };
    root.querySelectorAll(".vtabs button").forEach((x) => { x.onclick = () => { st.view = x.dataset.v; render(true); }; });
    root.querySelectorAll("[data-k]").forEach((el) => {
      const on = () => {
        const k = el.dataset.k, b = cur();
        let v = el.value;
        if (k === "approachLit") v = v !== "0";
        else if (el.type === "number") v = N(v);
        b[k] = v;
        // "giữa" (bố trí) ⇔ "trên dải phân cách" (vị trí trụ): đồng bộ hai chiều để màn hình và tính toán luôn khớp
        const setSel = (kk, val) => { b[kk] = val; const s2 = root.querySelector(`[data-k="${kk}"]`); if (s2) s2.value = val; };
        if (k === "arrangement") { if (v === "giữa") setSel("site", "giua"); else if (b.site === "giua") setSel("site", "lancan"); }
        if (k === "site") { if (v === "giua") setSel("arrangement", "giữa"); else if (b.arrangement === "giữa") setSel("arrangement", "1 bên"); }
        if (k === "name") { const o = root.querySelector(`#bvSel option[value="${st.sel}"]`); if (o) o.textContent = v || `Cầu ${st.sel + 1}`; }
        if (["length", "width", "grade", "Rv"].includes(k)) { st.cam = null; b.cam = null; }
        const bad = validateBridge(b).errors.length > 0;
        el.classList.toggle("bad", el.type === "number" && bad && (v == null || v <= 0) && ["length", "width", "spacing", "H"].includes(k));
        st.res = null; render(true); recalc();
      };
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", on);
    });
    // 3D: xoay / phóng to
    const cv = root.querySelector("#bvMain"), ptrs = new Map();
    let raf = 0; const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(true); }); };
    let settle = 0; const done = () => { clearTimeout(settle); settle = setTimeout(() => draw(false), 180); };
    cv.addEventListener("pointerdown", (e) => { if (st.view !== "3d") return; cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); });
    cv.addEventListener("pointermove", (e) => {
      if (st.view !== "3d" || !ptrs.has(e.pointerId)) return;
      const [px, py] = ptrs.get(e.pointerId);
      if (ptrs.size === 1) { st.cam = { ...st.cam, az: st.cam.az - (e.clientX - px) * 0.4, el: Math.max(3, Math.min(80, st.cam.el + (e.clientY - py) * 0.3)) }; }
      else if (ptrs.size === 2) { const o = [...ptrs.entries()].find(([id]) => id !== e.pointerId)[1];
        const d0 = Math.hypot(px - o[0], py - o[1]), d1 = Math.hypot(e.clientX - o[0], e.clientY - o[1]); if (d0 > 0 && d1 > 0) st.cam = { ...st.cam, dist: Math.max(15, Math.min(4000, st.cam.dist * d0 / d1)) }; }
      ptrs.set(e.pointerId, [e.clientX, e.clientY]); cur().cam = st.cam; later(); done();
    });
    const up = (e) => { ptrs.delete(e.pointerId); };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", (e) => { if (st.view !== "3d") return; e.preventDefault(); st.cam = { ...st.cam, dist: Math.max(15, Math.min(4000, st.cam.dist * Math.exp(e.deltaY * 0.0012))) }; cur().cam = st.cam; later(); done(); }, { passive: false });
    cv.addEventListener("dblclick", () => { if (st.view !== "3d") return; st.cam = defaultBridgeCamera(cur()); cur().cam = null; draw(); });
  }
  root.addEventListener("click", (e) => {
    const s = e.target.closest("[data-bsample]"); if (s) { loadSample(+s.dataset.bsample); return; }
    if (e.target.closest("[data-bnew]")) { st.bridges = [{ ...BRIDGE_DEFAULTS }]; select(0); }
  });
  let rz = 0; window.addEventListener("resize", () => { if (!document.body.classList.contains("bridge")) return; clearTimeout(rz); rz = setTimeout(() => draw(), 150); });

  function select(i) { st.sel = Math.max(0, Math.min(i, st.bridges.length - 1)); st.cam = cur() ? cur().cam || null : null; st.res = null; render(false); recalc(); }
  function loadSample(i = 0) { st.bridges = BRIDGE_SAMPLES.map((b) => ({ ...b })); st.name = "Cầu mẫu"; select(i); setStatus(`Cầu mẫu: ${BRIDGE_SAMPLES.length} cầu. Sửa thông số bên trái — kết quả tính lại ngay.`); }
  function loadWorkbook(wb, name) {
    const XLSX = window.XLSX;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[BRIDGE_SHEET], { defval: null });
    const list = parseBridgeRows(rows);
    if (!list.length) { setStatus(`Sheet ${BRIDGE_SHEET} không có cầu nào (cần cột "Tên cầu").`, true); return; }
    st.bridges = list; st.name = name || ""; pickCache = new Map();
    const miss = list.filter((b) => b.iesName && !iesList().some((e) => e.name === b.iesName)).length;
    select(0);
    setStatus(`Excel cầu: ${name} · ${list.length} cầu.${miss ? ` ${miss} cầu ghi bộ đèn chưa có trong thư mục IES — app tự chọn.` : ""} ${iesList().length ? "" : "Giờ chọn thư mục IES."}`);
  }
  function onIes() { pickCache = new Map(); if (document.body.classList.contains("bridge") && st.bridges.length) { st.res = null; render(false); recalc(); } }
  function hasData() { if (!st.bridges.length) { setStatus("Chưa có cầu — chọn cầu mẫu hoặc nạp Excel.", true); return false; } return true; }
  function computeAll() {
    return st.bridges.map((b) => { const R = compute(b); return { b, r: R.r || null, iesName: R.iesName, power: R.power, ies: R.ies, err: R.err }; });
  }
  async function saveExcel() {
    if (!hasData()) return;
    if (!window.ExcelJS) { setStatus("Chưa tải được thư viện ExcelJS.", true); return; }
    const all = computeAll();
    const wbx = await buildBridgeWorkbook(window.ExcelJS, { bridges: st.bridges, results: all, version: VERSION });
    await saveXlsxBuffer(await wbx.xlsx.writeBuffer(), outName("KetQua_Cau", st.name || (st.bridges.length === 1 ? st.bridges[0].name : `${st.bridges.length}_cau`), "xlsx"));
    const nOk = all.filter((x) => x.r && x.r.pass).length;
    setStatus(`Đã tạo file Excel cầu: ${all.length} cầu (${nOk} ĐẠT) — sheet DU LIEU CAU (thông số đã sửa), KET QUA CAU, O TINH DOC CAU.`);
  }
  async function downloadTemplate() {
    if (!window.ExcelJS) { setStatus("Chưa tải được thư viện ExcelJS.", true); return; }
    const wbx = await buildBridgeWorkbook(window.ExcelJS, { bridges: BRIDGE_SAMPLES, version: VERSION });
    await saveXlsxBuffer(await wbx.xlsx.writeBuffer(), "DATA_MAU_CAU_WEBDIALUX.xlsx");
    setStatus("Đã tạo Excel mẫu cầu (sheet DU LIEU CAU, 3 cầu mẫu). Sửa/thêm dòng rồi nạp lại.");
  }
  async function exportPdf() {
    if (!hasData()) return;
    const { jsPDF, makeDoc, finalizeDoc, font } = await getPdfTools();
    const { renderBridgePdf } = await import("./bridgeReport.mjs");
    const all = computeAll().filter((x) => x.r);
    if (!all.length) { setStatus("Không cầu nào tính được — kiểm tra dữ liệu và thư mục IES.", true); return; }
    const doc = makeDoc({ jsPDF, font });
    all.forEach((x, i) => {
      const p = renderBridgePdf(doc, { b: x.b, r: x.r, ies: x.ies && x.ies.ph, iesName: x.iesName, power: x.power, first: i === 0 });
      doc.outline && doc.outline.add(null, x.b.name || `Cầu ${i + 1}`, { pageNumber: p });
    });
    finalizeDoc(doc, { tail: "mặt cầu: CIE 140 · R3 · TI EN 13201-3 · lề bộ hành TCVN 13608:2023" });
    const blob = doc.output("blob");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: outName("BaoCao_Cau", all.length === 1 ? all[0].b.name : `${all.length}_cau`, "pdf") });
    document.body.appendChild(a); a.click(); a.remove();
    setStatus(`Đã tạo báo cáo PDF ${all.length} cầu (3 trang/cầu).`);
  }
  return { render: () => { st.res = null; render(false); recalc(); }, recalc: () => { pickCache = new Map(); st.res = null; render(true); recalc(); }, loadWorkbook, loadSample, onIes,
    saveExcel, exportPdf, downloadTemplate, state: st, result: () => st.res };
}
