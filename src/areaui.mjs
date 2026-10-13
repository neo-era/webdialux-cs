// Giao diện chế độ "Khu vực tự do" (phương án B: bảng trụ bên trái, KPI + mặt bằng bên phải).
// Tự dựng DOM trong #areaView; trang chính chỉ cần gọi initAreaUI(...) và chuyển chế độ.
import { calcArea, parseAreaRows, buildAreaWorkbook, buildAreaTemplate, matchAreaIes, AREA_COLS } from "./area.mjs";
import { AREA_REQS, findReq } from "./areaReq.mjs";
import { drawAreaPlan, heatColor } from "./areaDraw.mjs";

const CSS = `
#areaView{padding:12px 0}
body.area .wrap{max-width:min(1680px,100%)}
#areaView .av{display:grid;grid-template-columns:minmax(0,46%) minmax(0,1fr);gap:14px;align-items:start}
@media (max-width:980px){#areaView .av{grid-template-columns:1fr}}
#areaView .card{background:var(--surface);border:1px solid var(--line);border-radius:10px;box-shadow:0 1px 2px rgba(16,24,40,.05),0 4px 14px rgba(16,24,40,.05)}
#areaView .pad{padding:12px}
#areaView h3{margin:0;font-size:14px}
#areaView .hd{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
#areaView .hd .sp{flex:1}
#areaView .chip{font-size:11.5px;padding:2px 8px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);color:var(--muted)}
#areaView .tw{overflow:auto;max-height:46vh;border:1px solid var(--line);border-radius:8px}
#areaView table{border-collapse:collapse;width:100%;font-size:12.5px}
#areaView th{position:sticky;top:0;background:var(--surface-2);color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.3px;text-align:left;padding:6px;border-bottom:1px solid var(--line);white-space:nowrap}
#areaView td{padding:2px 3px;border-bottom:1px solid var(--line)}
#areaView tr.sel td{background:color-mix(in srgb,var(--warn) 14%,transparent)}
#areaView td input[type=number]{min-width:54px}
#areaView .av>*{min-width:0}
#areaView td input,#areaView td select{width:100%;min-width:0;border:1px solid transparent;background:transparent;color:var(--fg);font:12.5px var(--mono);padding:5px 4px;border-radius:5px}
#areaView td input:focus,#areaView td select:focus{border-color:var(--accent);outline:none;background:var(--surface)}
#areaView td select{font-family:var(--sans)}
#areaView .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:10px}
@media (max-width:620px){#areaView .kpis{grid-template-columns:repeat(2,1fr)}}
#areaView .kpi{padding:10px 12px}#areaView .kpi .l{font-size:12px;color:var(--muted)}#areaView .kpi .n{font:600 19px var(--mono)}#areaView .kpi .r{font-size:11.5px}
#areaView .ok{color:var(--ok)}#areaView .bad{color:var(--fail)}
#areaView .plan{position:relative;padding:6px}
#areaView canvas{width:100%;height:auto;display:block;touch-action:none;cursor:default;border-radius:6px}
#areaView .legend{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--muted);margin-top:6px;flex-wrap:wrap}
#areaView .legend .bar{width:160px;height:9px;border-radius:3px}
#areaView .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
#areaView .tabs button{font-size:12.5px;padding:5px 10px}
#areaView .tabs button.on{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
#areaView .warn{font-size:12px;color:var(--warn);margin:8px 0 0;padding-left:18px}
#areaView .hint{font-size:12px;color:var(--muted);margin:8px 0 0}
#areaView .empty{padding:28px;text-align:center;color:var(--muted)}
#areaView .del{border:none;background:none;color:var(--muted);cursor:pointer;font-size:14px;padding:4px 6px}
`;

const N = (v) => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const f1 = (x, d = 1) => (x == null || !isFinite(x)) ? "—" : Number(x).toFixed(d).replace(".", ",");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function initAreaUI({ root, setStatus, getIes: getIesAll, getMF, saveXlsxBuffer, outName, getPdfTools }) {
  const getIes = () => getIesAll().filter((e) => !e.ph || e.ph.photometricType === 1);   // chỉ trắc quang loại C
  const st = { poles: [], areas: [], result: null, sel: null, areaIx: 0, warnings: [], name: "" };
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  let view = null, timer = null, dragBounds = null;
  const nextId = () => { const used = new Set(st.poles.map((p) => p.id)); let n = st.poles.length + 1; while (used.has("T" + n)) n++; return "T" + n; };
  window.addEventListener("resize", () => { if (root.querySelector("#avCanvas")) drawPlan(); });

  // ---------- tính ----------
  function recalc(now = false) {
    clearTimeout(timer);
    const run = () => {
      try { st.result = st.areas.length ? calcArea(st, { MF: getMF() }) : null; }
      catch (e) { st.result = null; setStatus("Lỗi tính khu vực: " + e.message, true); }
      drawPlan(); drawKpis();
    };
    if (now) run(); else timer = setTimeout(run, 140);
  }

  // ---------- dựng giao diện ----------
  function render() {
    if (!st.poles.length && !st.areas.length) {
      root.innerHTML = `<div class="card empty"><h3 style="margin-bottom:8px">Chế độ khu vực tự do — sân thể thao, công viên, quảng trường, bãi đỗ xe</h3>
        <p>Chọn file Excel có sheet <b>VI TRI TRU</b> và <b>VUNG TINH</b> (☰ Menu → <i>Tải Excel mẫu khu vực</i>), hoặc bắt đầu từ sân mẫu rồi sửa trực tiếp.</p>
        <button id="avSample" class="primary">Bắt đầu với sân bóng mẫu 40 × 20 m</button></div>`;
      root.querySelector("#avSample").onclick = () => loadSample();
      return;
    }
    const ies = getIes();
    const iesOpts = (cur) => `<option value="">— chọn IES —</option>` + ies.map((e) => `<option value="${esc(e.name)}"${cur === e.name ? " selected" : ""}>${esc(e.name.replace(/\.ies$/i, ""))}</option>`).join("");
    const reqOpts = (cur) => {
      const groups = [...new Set(AREA_REQS.map((r) => r.group))];
      return `<option value=""${!cur ? " selected" : ""}>Tự nhập ngưỡng</option>` + groups.map((g) => `<optgroup label="${esc(g)}">` +
        AREA_REQS.filter((r) => r.group === g).map((r) => `<option value="${r.id}"${cur === r.id ? " selected" : ""}>${esc(r.label)} — ${r.Eav} lx${r.Uo != null ? ", Uo " + r.Uo : ""}</option>`).join("") + "</optgroup>").join("");
    };
    const nLum = st.poles.reduce((s, p) => s + p.n, 0);
    root.innerHTML = `<div class="av">
      <div class="card pad">
        <div class="hd"><h3>Vị trí trụ đèn</h3><span class="chip">${st.poles.length} trụ · ${nLum} đèn</span><span class="sp"></span>
          <button id="avAdd">＋ Thêm trụ</button><button id="avDup" ${st.sel ? "" : "disabled"}>⧉ Nhân bản</button></div>
        <div class="tw"><table><thead><tr><th>Trụ</th><th>x (m)</th><th>y (m)</th><th>H (m)</th><th>Hướng°</th><th>Nghiêng°</th><th>Số đèn</th><th>Bộ đèn (IES)</th><th></th></tr></thead><tbody>
        ${st.poles.map((p, i) => `<tr data-i="${i}" class="${p.id === st.sel ? "sel" : ""}">
          <td><input data-k="id" value="${esc(p.id)}" style="width:52px;font-family:var(--sans);font-weight:600"></td>
          <td><input data-k="x" type="number" step="0.1" value="${p.x}"></td><td><input data-k="y" type="number" step="0.1" value="${p.y}"></td>
          <td><input data-k="H" type="number" step="0.5" min="0" value="${p.H}"></td><td><input data-k="aim" type="number" step="5" value="${p.aim}"></td>
          <td><input data-k="tilt" type="number" step="5" min="0" max="85" value="${p.tilt}"></td><td><input data-k="n" type="number" step="1" min="1" value="${p.n}" style="width:46px"></td>
          <td>${ies.length ? `<select data-k="ies">${iesOpts(p.ies && p.ies.name)}</select>` : `<input data-k="iesWant" value="${esc(p.iesWant || "")}" placeholder="chọn thư mục IES">`}</td>
          <td><button class="del" data-del="${i}" title="Xoá trụ">✕</button></td></tr>`).join("")}
        </tbody></table></div>
        <p class="hint">Sửa trực tiếp trong bảng hoặc <b>kéo trụ</b> trên mặt bằng; kéo <b>đầu mũi tên</b> để đổi hướng chiếu. Hướng: 0° = trục +x, 90° = +y. Nghiêng: 0° = chiếu thẳng xuống.</p>
        <div class="hd" style="margin-top:14px"><h3>Vùng tính &amp; yêu cầu</h3><span class="sp"></span><button id="avAddA">＋ Thêm vùng</button></div>
        <div class="tw"><table><thead><tr><th>Vùng</th><th>Yêu cầu</th><th>Eav≥</th><th>Uo≥</th><th>x0</th><th>y0</th><th>Dài x</th><th>Rộng y</th><th>Lưới</th><th>MF</th><th></th></tr></thead><tbody>
        ${st.areas.map((a, i) => `<tr data-a="${i}">
          <td><input data-k="name" value="${esc(a.name)}" style="font-family:var(--sans);min-width:90px"></td>
          <td><select data-k="req" style="min-width:150px">${reqOpts(a.req && a.req.id)}</select></td>
          <td><input data-k="Eav" type="number" step="5" value="${a.req && a.req.Eav != null ? a.req.Eav : ""}" style="width:56px"></td>
          <td><input data-k="Uo" type="number" step="0.05" value="${a.req && a.req.Uo != null ? a.req.Uo : ""}" style="width:52px"></td>
          ${a.poly ? `<td colspan="4" style="font-size:11.5px;color:var(--muted)">đa giác ${a.poly.length} đỉnh</td>` :
            `<td><input data-k="x0" type="number" step="0.5" value="${a.x0}"></td><td><input data-k="y0" type="number" step="0.5" value="${a.y0}"></td>
             <td><input data-k="L" type="number" step="0.5" min="0" value="${a.L}"></td><td><input data-k="W" type="number" step="0.5" min="0" value="${a.W}"></td>`}
          <td><input data-k="step" type="number" step="0.5" min="0" value="${a.step ?? ""}" placeholder="tự" style="width:48px"></td>
          <td><input data-k="MF" type="number" step="0.05" min="0.3" max="1" value="${a.MF ?? ""}" placeholder="chung" style="width:52px"></td>
          <td><button class="del" data-dela="${i}" title="Xoá vùng">✕</button></td></tr>`).join("")}
        </tbody></table></div>
        ${st.warnings.length ? `<ul class="warn">${st.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      </div>
      <div>
        <div class="tabs" id="avTabs"></div>
        <div class="kpis" id="avKpis"></div>
        <div class="card plan"><canvas id="avCanvas" width="1200" height="760" aria-label="Mặt bằng bố trí trụ đèn và độ rọi"></canvas></div>
        <div class="legend" id="avLegend"></div>
      </div></div>`;
    bind();
    recalc(true);
  }

  function bind() {
    root.querySelectorAll("tr[data-i] input, tr[data-i] select").forEach((el) => {
      el.onchange = el.oninput = (e) => {
        const p = st.poles[+el.closest("tr").dataset.i], k = el.dataset.k;
        if (k === "id") {
          if (e && e.type === "input") return;                       // đổi mã khi rời ô, tránh trùng
          let v = el.value.trim() || p.id; if (st.poles.some((q) => q !== p && q.id === v)) { v = nextId(); el.value = v; }
          if (st.sel === p.id) st.sel = v; p.id = v; drawPlan(); return;
        }
        else if (k === "ies") { p.ies = getIes().find((e) => e.name === el.value) || null; p.iesWant = el.value; }
        else if (k === "iesWant") p.iesWant = el.value;
        else { const v = N(el.value); if (v == null) return; p[k] = k === "n" ? Math.max(1, Math.round(v)) : v; }
        recalc();
      };
      el.onfocus = () => { const p = st.poles[+el.closest("tr").dataset.i]; if (st.sel !== p.id) { st.sel = p.id; markSel(); drawPlan(); } };
    });
    root.querySelectorAll("tr[data-a] input, tr[data-a] select").forEach((el) => {
      el.onchange = () => {
        const a = st.areas[+el.closest("tr").dataset.a], k = el.dataset.k;
        if (k === "name") a.name = el.value;
        else if (k === "req") { const r = findReq(el.value); a.req = r ? { id: r.id, Eav: r.Eav, Uo: r.Uo, label: r.label } : { id: null, Eav: a.req && a.req.Eav, Uo: a.req && a.req.Uo, label: "Yêu cầu tự nhập" }; render(); return; }
        else if (k === "Eav" || k === "Uo") { a.req = a.req || { id: null, label: "Yêu cầu tự nhập" }; a.req[k] = N(el.value); }
        else if (k === "MF") { const v = N(el.value); a.MF = v != null && v >= 0.3 && v <= 1 ? v : null; }
        else a[k] = N(el.value) ?? (k === "step" ? null : a[k]);
        recalc();
      };
    });
    root.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => { const p = st.poles.splice(+b.dataset.del, 1)[0]; if (p && p.id === st.sel) st.sel = null; render(); });
    root.querySelectorAll("[data-dela]").forEach((b) => b.onclick = () => { st.areas.splice(+b.dataset.dela, 1); st.areaIx = 0; render(); });
    root.querySelector("#avAdd").onclick = () => {
      const last = st.poles[st.poles.length - 1];
      const id = nextId();
      st.poles.push(last ? { ...last, id, x: last.x + 5 } : { id, x: 0, y: 0, H: 10, aim: 90, tilt: 30, n: 1, ies: getIes()[0] || null, iesWant: "" });
      st.sel = id; render();
    };
    root.querySelector("#avDup").onclick = () => {
      const p = st.poles.find((q) => q.id === st.sel); if (!p) return;
      const id = nextId(); st.poles.push({ ...p, id, x: p.x + 3, y: p.y + 3 }); st.sel = id; render();
    };
    root.querySelector("#avAddA").onclick = () => { st.areas.push({ name: `Vùng ${st.areas.length + 1}`, x0: 0, y0: 0, L: 20, W: 10, step: null, req: null, MF: null, poly: null }); render(); };
    bindCanvas();
  }

  function markSel() { root.querySelectorAll("tr[data-i]").forEach((tr) => tr.classList.toggle("sel", st.poles[+tr.dataset.i] && st.poles[+tr.dataset.i].id === st.sel)); const d = root.querySelector("#avDup"); if (d) d.disabled = !st.sel; }

  function colors() {
    const cs = getComputedStyle(document.documentElement), g = (k, d) => (cs.getPropertyValue(k) || d).trim() || d;
    return { bg: g("--surface", "#fff"), line: g("--line", "#d8dee8"), fg: g("--fg", "#1c2430"), muted: g("--muted", "#5b6676"), pole: g("--fg", "#1c2430"), sel: "#f59e0b" };
  }
  function drawPlan() {
    const cv = root.querySelector("#avCanvas"); if (!cv) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1), cssW = cv.clientWidth || 600;
    const w = Math.round(cssW * dpr), h = Math.round(cssW * 0.62 * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }   // vẽ đúng độ phân giải màn hình → chữ rõ
    view = drawAreaPlan(cv.getContext("2d"), cv.width, cv.height, st, { sel: st.sel, colors: colors(), px: dpr, bounds: dragBounds });
    const lg = root.querySelector("#avLegend");
    if (lg && st.result) {
      const [lo, hi] = view.range, grad = [0, .25, .5, .75, 1].map((t) => `rgb(${heatColor(t).join(",")}) ${t * 100}%`).join(",");
      lg.innerHTML = `<span class="bar" style="background:linear-gradient(90deg,${grad})"></span><span>${f1(lo, 0)} – ${f1(hi, 0)} lx</span><span>· độ rọi ngang duy trì · công suất ${f1(st.result.power / 1000, 2)} kW</span>`;
    }
  }
  function drawKpis() {
    const tabs = root.querySelector("#avTabs"), k = root.querySelector("#avKpis"); if (!k) return;
    const R = st.result; if (!R || !R.areas.length) { k.innerHTML = ""; tabs.innerHTML = ""; return; }
    if (st.areaIx >= R.areas.length) st.areaIx = 0;
    tabs.innerHTML = R.areas.length > 1 ? R.areas.map((a, i) => `<button data-t="${i}" class="${i === st.areaIx ? "on" : ""}">${esc(a.name)} ${a.req ? (a.pass ? "✓" : "✗") : ""}</button>`).join("") : "";
    tabs.querySelectorAll("button").forEach((b) => b.onclick = () => { st.areaIx = +b.dataset.t; drawKpis(); });
    const a = R.areas[st.areaIx], q = a.req || {};
    if (a.empty) { k.innerHTML = `<div class="card kpi" style="grid-column:1/-1"><div class="l">${esc(a.name)}</div><div class="n bad" style="font-size:15px">Vùng không có điểm tính — kiểm tra Dài/Rộng hoặc đa giác</div></div>`; return; }
    const mark = (ok, has) => has ? (ok ? `<span class="ok">✓</span>` : `<span class="bad">✗</span>`) : "";
    k.innerHTML = `
      <div class="card kpi"><div class="l">Eav</div><div class="n">${f1(a.Eav)} lx</div><div class="r ${q.Eav != null ? (a.okE ? "ok" : "bad") : ""}">${q.Eav != null ? "≥ " + q.Eav + " " + mark(a.okE, true) : "&nbsp;"}</div></div>
      <div class="card kpi"><div class="l">Emin / Emax</div><div class="n">${f1(a.Emin, 0)} / ${f1(a.Emax, 0)}</div><div class="r" style="color:var(--muted)">Ud ${f1(a.Ud, 2)}</div></div>
      <div class="card kpi"><div class="l">Uo = Emin/Eav</div><div class="n">${f1(a.Uo, 2)}</div><div class="r ${q.Uo != null ? (a.okU ? "ok" : "bad") : ""}">${q.Uo != null ? "≥ " + f1(q.Uo, 2) + " " + mark(a.okU, true) : "không quy định"}</div></div>
      <div class="card kpi"><div class="l">Kết luận</div><div class="n ${a.req ? (a.pass ? "ok" : "bad") : ""}">${a.req ? (a.pass ? "ĐẠT" : "KHÔNG ĐẠT") : "—"}</div><div class="r" style="color:var(--muted)" title="${esc(q.label || "")}">${esc((q.label || "chưa chọn yêu cầu").slice(0, 46))}</div></div>`;
  }

  // ---------- kéo trụ / xoay hướng ----------
  function bindCanvas() {
    const cv = root.querySelector("#avCanvas"); if (!cv) return;
    let drag = null;
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
    const hit = (px, py) => {
      let best = null, bd = 18 * (window.devicePixelRatio || 1);
      for (const p of st.poles) {
        const a = (p.aim || 0) * Math.PI / 180, reach = Math.max(3, Math.min(40, p.H * Math.tan(Math.min(75, p.tilt || 0) * Math.PI / 180)));
        const [hx, hy] = view.toScreen(p.x + reach * Math.cos(a), p.y + reach * Math.sin(a));
        const [sx, sy] = view.toScreen(p.x, p.y);
        const d1 = Math.hypot(px - sx, py - sy), d2 = Math.hypot(px - hx, py - hy);
        if (d1 < bd) { bd = d1; best = { p, mode: "move" }; }
        if (d2 < bd) { bd = d2; best = { p, mode: "aim" }; }
      }
      return best;
    };
    cv.onpointerdown = (e) => {
      const [px, py] = pt(e), h = hit(px, py);
      if (!h) { st.sel = null; markSel(); drawPlan(); return; }
      st.sel = h.p.id; markSel(); drag = h; dragBounds = view.bounds; cv.setPointerCapture(e.pointerId); drawPlan();
    };
    cv.onpointermove = (e) => {
      const [px, py] = pt(e);
      if (!drag) { const h = view && hit(px, py); cv.style.cursor = h ? (h.mode === "aim" ? "crosshair" : "grab") : "default"; return; }
      const [wx, wy] = view.toWorld(px, py), p = drag.p;
      if (drag.mode === "move") { p.x = Math.round(wx * 10) / 10; p.y = Math.round(wy * 10) / 10; }
      else { p.aim = Math.round(Math.atan2(wy - p.y, wx - p.x) * 180 / Math.PI); }
      drawPlan();
      const tr = root.querySelector(`tr[data-i="${st.poles.indexOf(p)}"]`);
      if (tr) { tr.querySelector('[data-k="x"]').value = p.x; tr.querySelector('[data-k="y"]').value = p.y; tr.querySelector('[data-k="aim"]').value = p.aim; }
      recalc();
    };
    cv.onpointerup = cv.onpointercancel = cv.onlostpointercapture = () => { if (drag) { drag = null; dragBounds = null; recalc(true); } };
  }

  // ---------- nạp dữ liệu ----------
  function loadState(s, name) {
    st.poles = s.poles; st.areas = s.areas; st.warnings = s.warnings || []; st.name = name || ""; st.sel = null; st.areaIx = 0;
    render();
    setStatus(`Khu vực: ${st.poles.length} trụ, ${st.areas.length} vùng${st.warnings.length ? ` · ${st.warnings.length} cảnh báo` : ""}. ${getIes().length ? "Kéo trụ hoặc sửa bảng — kết quả tự tính lại." : "Chọn thư mục IES để tính."}`, st.warnings.length > 0);
  }
  function loadWorkbook(wb, name) {
    const XLSX = window.XLSX;
    const rd = (n) => wb.SheetNames.includes(n) ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null }) : [];
    loadState(parseAreaRows({ poleRows: rd("VI TRI TRU"), areaRows: rd("VUNG TINH") }, getIes()), name);
  }
  function loadSample() {
    const ies = getIes(), e = ies[0] || null;
    const poles = [[-3, -2, 35], [20, -2, 90], [43, -2, 145], [-3, 22, -35], [20, 22, -90], [43, 22, -145]]
      .map(([x, y, aim], i) => ({ id: `T${i + 1}`, x, y, H: 12, aim, tilt: 35, n: 2, ies: e, iesWant: e ? e.name : "" }));
    const r = findReq("TCVN13608-B12-luyentap");
    loadState({ poles, areas: [{ name: "Sân bóng đá mini", x0: 0, y0: 0, L: 40, W: 20, step: 1, req: { id: r.id, Eav: r.Eav, Uo: r.Uo, label: r.label }, MF: null, poly: null }], warnings: e ? [] : ["Chưa chọn thư mục IES — chọn để tính độ rọi."] }, "San mau");
  }
  function onIes() {
    const ies = getIes();
    for (const p of st.poles) if (!p.ies && p.iesWant) p.ies = matchAreaIes(p.iesWant, ies);
    if (st.poles.length || st.areas.length) render();
  }

  // ---------- xuất ----------
  const hasData = () => { if (st.poles.length && st.areas.length) return true; setStatus("Chưa có trụ đèn hoặc vùng tính để xuất — nạp Excel khu vực hoặc bắt đầu từ sân mẫu.", true); return false; };
  async function saveExcel() {
    if (!hasData()) return;
    if (!window.ExcelJS) { setStatus("Chưa tải được thư viện ExcelJS.", true); return; }
    const result = st.result || calcArea(st, { MF: getMF() });
    const wbx = await buildAreaWorkbook(window.ExcelJS, { poles: st.poles, areas: st.areas, result, projectName: st.name });
    await saveXlsxBuffer(await wbx.xlsx.writeBuffer(), outName("KhuVuc", st.name || null, "xlsx"));
    setStatus("Đã tạo file Excel khu vực: vị trí trụ (đã chỉnh), vùng tính, kết quả, lưới độ rọi.");
  }
  async function downloadTemplate() {
    if (!window.ExcelJS) { setStatus("Chưa tải được thư viện ExcelJS.", true); return; }
    const wbx = await buildAreaTemplate(window.ExcelJS);
    await saveXlsxBuffer(await wbx.xlsx.writeBuffer(), "DATA_MAU_KHU_VUC_WEBDIALUX.xlsx");
    setStatus("Đã tạo Excel mẫu khu vực (sân bóng mini 6 trụ). Điền tên file IES rồi nạp lại.");
  }
  async function exportPdf() {
    if (!hasData()) return;
    const { jsPDF, makeDoc, finalizeDoc, font } = await getPdfTools();
    const { renderAreaPdf } = await import("./areaReport.mjs");
    const result = st.result || calcArea(st, { MF: getMF() });
    const doc = makeDoc({ jsPDF, font });
    renderAreaPdf(doc, { state: st, result, projectName: st.name || "Khu vực" });
    finalizeDoc(doc, { tail: "độ rọi ngang duy trì · cùng engine đã kiểm chứng DIALux · TCVN 13608:2023 / EN 12193" });
    const blob = doc.output("blob");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: outName("BaoCao_KhuVuc", st.name || "khu_vuc", "pdf") });
    document.body.appendChild(a); a.click(); a.remove();
    setStatus("Đã tạo báo cáo PDF khu vực.");
  }

  return { render, loadWorkbook, loadSample, onIes, recalc, saveExcel, exportPdf, downloadTemplate, state: st };
}
