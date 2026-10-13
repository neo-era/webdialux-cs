// Giao diện chế độ "Khu vực tự do" (phương án B: bảng trụ bên trái, KPI + mặt bằng bên phải).
// Tự dựng DOM trong #areaView; trang chính chỉ cần gọi initAreaUI(...) và chuyển chế độ.
import { calcArea, parseAreaRows, buildAreaWorkbook, buildAreaTemplate, matchAreaIes, poleLamps, spreadLamps } from "./area.mjs";
import { AREA_REQS, findReq } from "./areaReq.mjs";
import { drawAreaPlan, heatColor, lampHandle } from "./areaDraw.mjs";
import { drawArea3D, defaultCamera, rampCss } from "./areaView3D.mjs";
import { SAMPLES, sampleState } from "./areaSamples.mjs";
import { calcArch, parseObjRows, MATERIALS, ARCH_REQS, TYPE_LABEL, DEFAULT_RHO, parsePts } from "./arch.mjs";
import { drawFacades } from "./archDraw.mjs";

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
#areaView .subtabs{display:flex;gap:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;width:max-content;max-width:100%;margin-bottom:10px}
#areaView .subtabs button{border:none;border-radius:0;font-size:12.5px;padding:6px 12px}
#areaView .subtabs button.on{background:var(--accent);color:var(--accent-ink)}
#areaView .tools{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
#areaView .tools button.on{border-color:var(--accent);color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent)}
#areaView tr.osel td{background:color-mix(in srgb,var(--warn) 14%,transparent)}
#areaView td .pts{font-family:var(--mono);min-width:150px}
#areaView .resok{color:var(--ok);font-weight:600}#areaView .resbad{color:var(--fail);font-weight:600}
#areaView .vtabs{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:8px}
#areaView .vtabs button{border:none;border-radius:0;font-size:12.5px;padding:6px 12px}
#areaView .vtabs button.on{background:var(--accent);color:var(--accent-ink)}
#areaView .vbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#areaView .vbar .hint{margin:0 0 8px}
#areaView .tabs button.on{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
#areaView .warn{font-size:12px;color:var(--warn);margin:8px 0 0;padding-left:18px}
#areaView .hint{font-size:12px;color:var(--muted);margin:8px 0 0}
#areaView .empty{padding:28px;text-align:center;color:var(--muted)}
#areaView .del{border:none;background:none;color:var(--muted);cursor:pointer;font-size:14px;padding:4px 6px}
#areaView .detail{margin-top:12px}
#areaView .detail .top{display:flex;gap:12px;align-items:center;justify-content:space-between}
#areaView .detail .acts{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 10px}
#areaView .lamps{display:grid;gap:8px;max-height:44vh;overflow:auto;padding-right:2px}
#areaView .lamp{display:grid;grid-template-columns:28px 1fr 26px;gap:8px;align-items:start;border:1px solid var(--line);border-radius:10px;padding:8px;transition:border-color .15s,background .15s}
#areaView .lamp.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 6%,transparent)}
#areaView .lamp.miss{border-color:color-mix(in srgb,var(--fail) 55%,var(--line))}
#areaView .lamp .no{width:26px;height:26px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font:600 12px var(--sans)}
#areaView .lamp .g4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
#areaView .lamp label{display:block;font-size:11px;color:var(--muted);margin-bottom:2px}
#areaView .lamp input,#areaView .lamp select{width:100%;min-width:0;border:1px solid var(--line);background:var(--surface);color:var(--fg);font:12.5px var(--mono);padding:5px 6px;border-radius:6px}
#areaView .lamp select,#areaView .lamp .iesw{margin-top:6px;font-family:var(--sans)}
#areaView .lamp input:focus,#areaView .lamp select:focus{border-color:var(--accent);outline:none}
#areaView .compass{flex:none}
#areaView .sumies{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
@media (max-width:620px){#areaView .lamp .g4{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

const N = (v) => { if (v === "" || v == null) return null; const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
const f1 = (x, d = 1) => (x == null || !isFinite(x)) ? "—" : Number(x).toFixed(d).replace(".", ",");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function initAreaUI({ root, setStatus, getIes: getIesAll, getMF, saveXlsxBuffer, outName, getPdfTools }) {
  const getIes = () => getIesAll().filter((e) => !e.ph || e.ph.photometricType === 1);   // chỉ trắc quang loại C
  const st = { poles: [], areas: [], objects: [], result: null, arch: null, sel: null, selLamp: null, areaIx: 0, warnings: [], name: "",
    view3d: false, facade: false, cam: null, tab: "poles", selObj: null, tool: null, draft: null };
  const nextObjId = (pre) => { const used = new Set(st.objects.map((o) => o.id)); let n = 1; while (used.has(pre + n)) n++; return pre + n; };
  const ptsStr = (pts) => pts.map(([x, y]) => `${+x.toFixed(2)} ${+y.toFixed(2)}`).join("; ");
  const shortIes = (l) => l.ies ? l.ies.name.replace(/\.ies$/i, "").replace(/_IESNA2002$/i, "") : (l.iesWant ? l.iesWant + " (thiếu)" : "thiếu IES");
  const iesSummary = (p) => { const m = new Map(); for (const l of poleLamps(p)) { const k = shortIes(l); m.set(k, (m.get(k) || 0) + 1); } return [...m].map(([k, n]) => n > 1 ? `${k} ×${n}` : k).join(", "); };
  const newLamp = (o = {}) => ({ aim: 90, tilt: 30, arm: 0, H: null, ies: getIes()[0] || null, iesWant: (getIes()[0] || {}).name || "", ...o });
  const copyLamps = (L) => L.map((l) => ({ ...l }));
  const selPole = () => st.poles.find((p) => p.id === st.sel) || null;
  const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
  let view = null, timer = null, dragBounds = null;
  const nextId = () => { const used = new Set(st.poles.map((p) => p.id)); let n = st.poles.length + 1; while (used.has("T" + n)) n++; return "T" + n; };
  window.addEventListener("resize", () => { if (root.querySelector("#avCanvas")) drawPlan(); });

  // ---------- tính ----------
  function recalc(now = false) {
    clearTimeout(timer);
    const run = () => {
      try { st.result = st.areas.length ? calcArea(st, { MF: getMF() }) : null; st.arch = st.objects.length ? calcArch(st, { MF: getMF() }) : null; if (st.tab === "obj") drawObjResults(); }
      catch (e) { st.result = null; setStatus("Lỗi tính khu vực: " + e.message, true); }
      drawPlan(); drawKpis();
    };
    if (now) run(); else timer = setTimeout(run, 140);
  }

  // ---------- ngăn "Chi tiết trụ": sơ đồ hướng + thẻ từng đèn ----------
  function compass(L) {
    const r = 34, lines = L.map((l, i) => { const a = (l.aim || 0) * Math.PI / 180, x = Math.cos(a) * r, y = -Math.sin(a) * r;
      const on = st.selLamp === i, col = !l.ies ? "var(--fail)" : on ? "#c2410c" : "var(--accent)";
      return `<line x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${col}" stroke-width="${on ? 3.4 : 2.6}" stroke-linecap="round"/><text x="${(x * 1.22).toFixed(1)}" y="${(y * 1.22 + 3).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="var(--muted)">${i + 1}</text>`; }).join("");
    return `<svg class="compass" width="96" height="96" viewBox="-48 -48 96 96" role="img" aria-label="Sơ đồ hướng chiếu các đèn (vạch phải = +x, vạch trên = +y)"><circle r="40" fill="none" stroke="var(--line)"/><path d="M40 0h5M0 -40v-5" stroke="var(--muted)"/>${lines}<circle r="4.5" fill="#f59e0b"/></svg>`;
  }
  function iesOptions(cur) {
    return `<option value="">— chọn IES —</option>` + getIes().map((e) => `<option value="${esc(e.name)}"${cur === e.name ? " selected" : ""}>${esc(e.name.replace(/\.ies$/i, ""))}</option>`).join("");
  }
  function detailHtml() {
    const ies = getIes(), iesOpts = iesOptions;
    const p = selPole();
    if (!p) return `<div class="card pad detail" style="color:var(--muted);font-size:12.5px;text-align:center">Chọn một trụ để khai báo từng đèn (hướng, nghiêng, vươn, cao độ, bộ đèn IES).</div>`;
    const L = poleLamps(p), others = st.poles.filter((q) => q !== p);
    return `<div class="card pad detail" id="avDetail">
      <div class="top"><div><h3>Chi tiết trụ ${esc(p.id)} — ${L.length} đèn</h3><div style="font-size:12px;color:var(--muted);margin-top:3px">Cao trụ ${f1(p.H)} m · toạ độ (${f1(p.x)}; ${f1(p.y)})</div></div>${compass(L)}</div>
      <div class="acts"><button id="avLAdd" class="primary">＋ Thêm đèn</button><button id="avLSpread" ${L.length > 1 ? "" : "disabled"} title="Giữ hướng đèn 1, các đèn còn lại cách đều">Chia đều 360°</button>
        ${others.length ? `<select id="avLCopy" style="max-width:200px"><option value="">Sao chép bộ đèn sang…</option><option value="*">Tất cả trụ khác</option>${others.map((q) => `<option value="${esc(q.id)}">Trụ ${esc(q.id)}</option>`).join("")}</select>` : ""}</div>
      <div class="lamps">${L.map((l, i) => `<div class="lamp${st.selLamp === i ? " on" : ""}${l.ies ? "" : " miss"}" data-l="${i}">
        <div class="no">${i + 1}</div>
        <div><div class="g4">
          <div><label>Hướng °</label><input data-lk="aim" type="number" step="5" value="${l.aim}"></div>
          <div><label>Nghiêng °</label><input data-lk="tilt" type="number" step="5" min="0" max="180" value="${l.tilt}"></div>
          <div><label>Vươn m</label><input data-lk="arm" type="number" step="0.1" min="0" value="${l.arm ?? 0}"></div>
          <div><label>Cao độ m</label><input data-lk="H" type="number" step="0.5" min="0" value="${l.H ?? ""}" placeholder="${f1(p.H)}"></div></div>
          ${ies.length ? `<select data-lk="ies" aria-label="Bộ đèn IES">${iesOpts(l.ies && l.ies.name)}</select>` : `<input class="iesw" data-lk="iesWant" value="${esc(l.iesWant || "")}" placeholder="tên file IES — chọn thư mục IES để tính">`}
        </div>
        <button class="del" data-ldel="${i}" title="Xoá đèn ${i + 1}" ${L.length > 1 ? "" : "disabled"}>✕</button></div>`).join("")}</div></div>`;
  }

  // ---------- vật thể: tòa nhà, tường rào, cây xanh (chiếu sáng mỹ thuật) ----------
  function toolHint() {
    if (st.tool === "building") return "Đang vẽ TÒA NHÀ: bấm từng góc chân nhà trên mặt bằng · bấm đúp hoặc Enter để xong · Esc để huỷ.";
    if (st.tool === "wall") return "Đang vẽ TƯỜNG RÀO: bấm từng điểm của tường · bấm đúp hoặc Enter để xong · Esc để huỷ.";
    if (st.tool === "tree") return "Đang đặt CÂY: bấm vị trí gốc cây trên mặt bằng (bấm nhiều lần để đặt nhiều cây) · Esc để thôi.";
    return st.tab === "obj" ? "Bấm vật thể trên mặt bằng để chọn, kéo để dời. Toạ độ sửa trong bảng dạng \"x y; x y\"." : "";
  }
  function stopTool() { st.tool = null; st.draft = null; }
  function objHtml() {
    const matOpts = (o) => `<option value="">Tự nhập ρ</option>` + MATERIALS.filter((m) => m.type === o.type || (o.type === "wall" && m.type === "building"))
      .map((m) => `<option${o.mat === m.name ? " selected" : ""}>${esc(m.name)}</option>`).join("");
    const zoneOpts = (z) => `<option value="">—</option>` + ARCH_REQS.map((r) => `<option value="${r.zone}"${z === r.zone ? " selected" : ""} title="${esc(r.label)}">${r.zone}</option>`).join("");
    return `<div class="hd"><h3>Vật thể chiếu sáng mỹ thuật</h3><span class="sp"></span></div>
      <div class="tools"><button data-tool="building" class="${st.tool === "building" ? "on" : ""}">＋ Tòa nhà (vẽ đa giác)</button><button data-tool="wall" class="${st.tool === "wall" ? "on" : ""}">＋ Tường rào (vẽ đường)</button><button data-tool="tree" class="${st.tool === "tree" ? "on" : ""}">＋ Cây (bấm điểm)</button></div>
      <div class="tw" style="max-height:30vh"><table><thead><tr><th>Mã</th><th>Loại</th><th>Toạ độ (x y; …)</th><th>Cao</th><th>Tán R</th><th>Vật liệu</th><th>ρ</th><th>Vùng</th><th>Mặt ĐG</th><th></th></tr></thead><tbody>
      ${st.objects.map((o, i) => `<tr data-o="${i}" class="${o.id === st.selObj ? "osel" : ""}">
        <td><input data-ok="id" value="${esc(o.id)}" style="width:52px;font-family:var(--sans);font-weight:600"></td>
        <td style="font-size:12px;white-space:nowrap">${TYPE_LABEL[o.type]}</td>
        <td><input class="pts" data-ok="pts" value="${esc(ptsStr(o.pts))}"></td>
        <td><input data-ok="H" type="number" step="0.5" min="0.1" value="${o.H}" style="width:56px"></td>
        <td>${o.type === "tree" ? `<input data-ok="crownR" type="number" step="0.5" min="0.3" value="${o.crownR ?? ""}" style="width:50px">` : ""}</td>
        <td><select data-ok="mat" style="min-width:120px">${matOpts(o)}</select></td>
        <td><input data-ok="rho" type="number" step="0.05" min="0.02" max="0.98" value="${o.rho}" style="width:54px"></td>
        <td><select data-ok="zone">${zoneOpts(o.zone)}</select></td>
        <td>${o.type === "tree" ? "" : `<input data-ok="faces" value="${esc((o.faces || []).join("; "))}" placeholder="tất cả" style="width:60px">`}</td>
        <td><button class="del" data-odel="${i}" title="Xoá vật thể">✕</button></td></tr>`).join("") || `<tr><td colspan="10" style="color:var(--muted);padding:10px">Chưa có vật thể — dùng nút phía trên để vẽ trên mặt bằng, hoặc nạp Excel có sheet VAT THE.</td></tr>`}
      </tbody></table></div>
      <p class="hint">Vùng môi trường: E2 nông thôn · E3 đô thị · E4 trung tâm — đặt mức Eav tối thiểu (tham khảo, theo ρ) và giới hạn độ chói L. "Mặt ĐG": số cạnh/đoạn được đánh giá (trống = tất cả); mặt khác vẫn tính số. Tòa nhà, tường chắn sáng và đổ bóng xuống mặt đất; tán cây không chắn.</p>
      <div class="hd" style="margin-top:12px"><h3>Kết quả mặt đứng</h3><span class="sp"></span></div>
      <div class="tw" style="max-height:34vh" id="avObjRes"></div>`;
  }
  function drawObjResults() {
    const box = root.querySelector("#avObjRes"); if (!box) return;
    const R = st.arch;
    const warn = R && R.warnings && R.warnings.length ? `<ul class="warn" style="margin:6px 0">${R.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "";
    if (!R || !R.surfaces.length) { box.innerHTML = `<p class="hint" style="padding:8px">Chưa có bề mặt để tính.</p>`; return; }
    const surf = R.surfaces.filter((x) => !st.selObj || x.objId === st.selObj);
    box.innerHTML = warn + `<table><thead><tr><th>Bề mặt</th><th>Eav</th><th>Emin</th><th>Emax</th><th>Uo</th><th>L cd/m²</th><th>Yêu cầu</th><th>KQ</th></tr></thead><tbody>${surf.map((x) => `<tr>
      <td style="font-size:12px">${esc(x.name)}</td><td>${f1(x.Eav)}</td><td>${f1(x.Emin)}</td><td>${f1(x.Emax)}</td><td>${f1(x.Uo, 2)}</td><td>${f1(x.Lav, 2)}</td>
      <td style="font-size:11.5px;white-space:nowrap">${x.req ? `${x.req.Emin != null ? "E ≥ " + x.req.Emin : ""}${x.req.Emin != null && x.req.Lmax != null ? " · " : ""}${x.req.Lmax != null ? "L ≤ " + x.req.Lmax : ""}` : "—"}</td>
      <td>${x.req ? (x.pass ? `<span class="resok">ĐẠT</span>` : `<span class="resbad" title="${!x.okE ? "Eav thấp hơn mức tối thiểu" : "Độ chói vượt giới hạn vùng"}">KHÔNG</span>`) : "—"}</td></tr>`).join("")}</tbody></table>`;
  }
  function selectObj(id) {
    st.selObj = id; root.querySelectorAll("tr[data-o]").forEach((tr) => tr.classList.toggle("osel", st.objects[+tr.dataset.o] && st.objects[+tr.dataset.o].id === id));
    drawObjResults(); drawPlan();
    const h = root.querySelector("#avViewHint"); if (h && st.facade) h.textContent = id ? `Bề mặt của ${id} — chọn vật thể khác trong tab Vật thể.` : "Tất cả bề mặt — chọn một vật thể để xem riêng.";
  }
  function bindObj() {
    root.querySelectorAll("[data-tool]").forEach((b) => b.onclick = () => {
      const t = b.dataset.tool; st.tool = st.tool === t ? null : t; st.draft = st.tool ? { type: t, pts: [] } : null;
      st.view3d = false; st.facade = false; const y = window.scrollY; render({ keep: true }); window.scrollTo(0, y);
    });
    root.querySelectorAll("tr[data-o] input, tr[data-o] select").forEach((el) => {
      const o = () => st.objects[+el.closest("tr").dataset.o];
      el.onfocus = () => { if (st.selObj !== o().id) selectObj(o().id); };
      el.onchange = () => {
        const ob = o(), k = el.dataset.ok;
        if (k === "id") { let v = el.value.trim() || ob.id; if (st.objects.some((q) => q !== ob && q.id === v)) { v = nextObjId(ob.type === "tree" ? "C" : ob.type === "wall" ? "TR" : "NH"); el.value = v; } if (st.selObj === ob.id) st.selObj = v; ob.id = v; }
        else if (k === "pts") { const P = parsePts(el.value), need = ob.type === "building" ? 3 : ob.type === "wall" ? 2 : 1;
          if (!P || P.length < need) { setStatus(`Toạ độ ${ob.id} không hợp lệ — ghi "x y; x y", ${TYPE_LABEL[ob.type]} cần ≥ ${need} điểm.`, true); el.value = ptsStr(ob.pts); return; }
          if (ob.type === "building" && Math.abs(P.reduce((a, [x, y], i) => { const [x2, y2] = P[(i + 1) % P.length]; return a + x * y2 - x2 * y; }, 0)) < 1e-6) { setStatus(`Đa giác chân ${ob.id} có diện tích 0 — kiểm tra lại toạ độ.`, true); el.value = ptsStr(ob.pts); return; }
          ob.pts = ob.type === "tree" ? [P[0]] : P; }
        else if (k === "mat") { ob.mat = el.value || null; const m = MATERIALS.find((x) => x.name === el.value); if (m) { ob.rho = m.rho; const r = el.closest("tr").querySelector('[data-ok="rho"]'); if (r) r.value = m.rho; } }
        else if (k === "rho") { const v = N(el.value); if (v > 0 && v < 1) { ob.rho = v; ob.mat = null; el.closest("tr").querySelector('[data-ok="mat"]').value = ""; } else { el.value = ob.rho; return; } }
        else if (k === "zone") ob.zone = el.value || null;
        else if (k === "faces") ob.faces = el.value.trim() ? el.value.split(/[;,\s]+/).map(Number).filter((v) => Number.isInteger(v) && v > 0) : null;
        else if (k === "crownR") { const v = N(el.value); if (v > 0) ob.crownR = Math.min(v, ob.H / 2); }
        else if (k === "H") { const v = N(el.value); if (v > 0) { ob.H = v; if (ob.type === "tree" && ob.crownR > v / 2) { ob.crownR = v / 2; const c = el.closest("tr").querySelector('[data-ok="crownR"]'); if (c) c.value = ob.crownR; } } else { el.value = ob.H; return; } }
        recalc();
      };
    });
    root.querySelectorAll("[data-odel]").forEach((b) => b.onclick = () => { const o = st.objects.splice(+b.dataset.odel, 1)[0]; if (o && o.id === st.selObj) st.selObj = null; const y = window.scrollY; render(); window.scrollTo(0, y); });
  }
  function finishDraft() {
    const d = st.draft; if (!d) return;
    const need = d.type === "building" ? 3 : 2;
    const area0 = d.type === "building" && Math.abs(d.pts.reduce((a, [x, y], i) => { const [x2, y2] = d.pts[(i + 1) % d.pts.length]; return a + x * y2 - x2 * y; }, 0)) < 1e-6;
    if (d.pts.length >= need && area0) setStatus("Các điểm thẳng hàng — tòa nhà cần đa giác có diện tích. Đã huỷ.", true);
    else if (d.pts.length >= need) {
      const id = nextObjId(d.type === "building" ? "NH" : "TR");
      st.objects.push({ id, type: d.type, pts: d.pts.map((p) => [...p]), H: d.type === "building" ? 12 : 2.5, crownR: null, mat: null, rho: DEFAULT_RHO[d.type], zone: null, reqE: null, reqL: null, faces: null, step: null });
      st.selObj = id; setStatus(`Đã thêm ${TYPE_LABEL[d.type].toLowerCase()} ${id} — sửa chiều cao, vật liệu trong bảng.`);
    } else if (d.pts.length) setStatus(`${TYPE_LABEL[d.type]} cần ít nhất ${need} điểm — đã huỷ.`, true);
    st.draft = { type: d.type, pts: [] }; st.tool = null; st.draft = null;
    const y = window.scrollY; render(); window.scrollTo(0, y);
  }
  window.addEventListener("keydown", (e) => {
    if (!st.tool || !root.querySelector("#avCanvas") || root.offsetParent === null) return;      // chỉ khi đang ở chế độ khu vực
    const t = e.target; if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;          // đang gõ trong ô thì không cướp Enter/Esc
    if (e.key === "Escape") { stopTool(); const y = window.scrollY; render(); window.scrollTo(0, y); }
    else if (e.key === "Enter" && st.draft && st.draft.pts.length) { e.preventDefault(); finishDraft(); }
  });

  // ---------- dựng giao diện ----------
  function render(opts = {}) {
    if (!st.poles.length && !st.areas.length && !st.objects.length) {
      root.innerHTML = `<div class="card empty"><h3 style="margin-bottom:8px">Chế độ khu vực tự do — sân thể thao, công viên, quảng trường, bãi đỗ xe</h3>
        <p>Chọn file Excel có sheet <b>VI TRI TRU</b> và <b>VUNG TINH</b> (☰ Menu → <i>Tải Excel mẫu khu vực</i>), hoặc bắt đầu từ sân mẫu rồi sửa trực tiếp.</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">${Object.entries(SAMPLES).map(([k, S], i) => `<button data-sample="${k}"${i ? "" : ' class="primary"'}>${esc(S.label)}</button>`).join("")}</div></div>`;
      root.querySelectorAll("[data-sample]").forEach((b) => b.onclick = () => loadSample(b.dataset.sample));
      return;
    }
    const ies = getIes();
    const iesOpts = (cur) => `<option value="">— chọn IES —</option>` + ies.map((e) => `<option value="${esc(e.name)}"${cur === e.name ? " selected" : ""}>${esc(e.name.replace(/\.ies$/i, ""))}</option>`).join("");
    const reqOpts = (cur) => {
      const groups = [...new Set(AREA_REQS.map((r) => r.group))];
      return `<option value=""${!cur ? " selected" : ""}>Tự nhập ngưỡng</option>` + groups.map((g) => `<optgroup label="${esc(g)}">` +
        AREA_REQS.filter((r) => r.group === g).map((r) => `<option value="${r.id}"${cur === r.id ? " selected" : ""}>${esc(r.label)} — ${r.Eav} lx${r.Uo != null ? ", Uo " + r.Uo : ""}</option>`).join("") + "</optgroup>").join("");
    };
    const nLum = st.poles.reduce((s, p) => s + poleLamps(p).length, 0);
    const T = st.tab, hide = (t) => (T === t ? "" : ' style="display:none"');
    root.innerHTML = `<div class="av">
      <div class="card pad">
        <div class="subtabs" role="tablist" aria-label="Dữ liệu khu vực"><button data-tab="poles" class="${T === "poles" ? "on" : ""}">Trụ đèn</button><button data-tab="areas" class="${T === "areas" ? "on" : ""}">Vùng tính (${st.areas.length})</button><button data-tab="obj" class="${T === "obj" ? "on" : ""}">Vật thể (${st.objects.length})</button></div>
        <div data-sec="poles"${hide("poles")}>
        <div class="hd"><h3>Vị trí trụ đèn</h3><span class="chip">${st.poles.length} trụ · ${nLum} đèn</span><span class="sp"></span>
          <button id="avAdd">＋ Thêm trụ</button><button id="avDup" ${st.sel ? "" : "disabled"}>⧉ Nhân bản</button></div>
        <div class="tw" style="max-height:30vh"><table><thead><tr><th>Trụ</th><th>x (m)</th><th>y (m)</th><th>H (m)</th><th>Số đèn</th><th>Bộ đèn</th><th></th></tr></thead><tbody>
        ${st.poles.map((p, i) => { const L = poleLamps(p), miss = !L.length || L.some((l) => !l.ies); return `<tr data-i="${i}" class="${p.id === st.sel ? "sel" : ""}">
          <td><input data-k="id" value="${esc(p.id)}" style="width:52px;font-family:var(--sans);font-weight:600"></td>
          <td><input data-k="x" type="number" step="0.1" value="${p.x}"></td><td><input data-k="y" type="number" step="0.1" value="${p.y}"></td>
          <td><input data-k="H" type="number" step="0.5" min="0" value="${p.H}"></td>
          <td style="text-align:center;font:600 12.5px var(--mono);cursor:pointer" data-pick="${i}">${L.length}</td>
          <td class="sumies${miss ? " bad" : ""}" data-pick="${i}" style="cursor:pointer" title="${esc(iesSummary(p))}">${esc(iesSummary(p) || "—")}</td>
          <td><button class="del" data-del="${i}" title="Xoá trụ">✕</button></td></tr>`; }).join("")}
        </tbody></table></div>
        <div id="avDetailWrap">${detailHtml()}</div>
        <p class="hint">Chọn trụ (bấm dòng hoặc bấm trên mặt bằng) để sửa <b>từng đèn</b>. Kéo trụ để dời; kéo <b>đầu mũi tên</b> của một đèn để đổi hướng đèn đó. Hướng: 0° = trục +x, 90° = +y. Nghiêng: 0° = chiếu thẳng xuống. Vươn: đèn lệch khỏi tâm trụ theo hướng chiếu. Đèn hắt lên: nghiêng 90° = ngang, 180° = thẳng lên; đèn âm đất: cao 0 m.</p>
        </div>
        <div data-sec="areas"${hide("areas")}>
        <div class="hd"><h3>Vùng tính &amp; yêu cầu</h3><span class="sp"></span><button id="avAddA">＋ Thêm vùng</button></div>
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
        </div>
        <div data-sec="obj"${hide("obj")}>${objHtml()}</div>
        ${st.warnings.length ? `<ul class="warn">${st.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
      </div>
      <div>
        <div class="vbar"><div class="vtabs" role="tablist" aria-label="Kiểu xem"><button id="avV2" role="tab" class="${st.view3d || st.facade ? "" : "on"}">Mặt bằng</button><button id="avV3" role="tab" class="${st.view3d ? "on" : ""}">Phối cảnh 3D</button>${st.objects.length ? `<button id="avVF" role="tab" class="${st.facade ? "on" : ""}">Mặt đứng trải phẳng</button>` : ""}</div>
          <p class="hint" id="avViewHint">${st.view3d ? "Kéo để xoay · lăn chuột / chụm 2 ngón để phóng to · bấm đúp để về góc nhìn mặc định." : st.facade ? (st.selObj ? `Bề mặt của ${esc(st.selObj)} — chọn vật thể khác trong tab Vật thể.` : "Tất cả bề mặt — chọn một vật thể để xem riêng.") : toolHint()}</p></div>
        <div class="tabs" id="avTabs"></div>
        <div class="kpis" id="avKpis"></div>
        <div class="card plan"><canvas id="avCanvas" width="1200" height="760" aria-label="Mặt bằng bố trí trụ đèn và độ rọi"></canvas></div>
        <div class="legend" id="avLegend"></div>
      </div></div>`;
    bind();
    if (opts.keep) { drawPlan(); drawKpis(); if (st.tab === "obj") drawObjResults(); }        // chỉ đổi cách xem: không tính lại
    else recalc(true);
  }

  function bind() {
    root.querySelectorAll("tr[data-i] input, tr[data-i] select").forEach((el) => {
      el.onchange = el.oninput = (e) => {
        const p = st.poles[+el.closest("tr").dataset.i], k = el.dataset.k;
        if (k === "id") {
          if (e && e.type === "input") return;                       // đổi mã khi rời ô, tránh trùng
          let v = el.value.trim() || p.id; if (st.poles.some((q) => q !== p && q.id === v)) { v = nextId(); el.value = v; }
          const wasSel = st.sel === p.id; if (wasSel) st.sel = v; p.id = v; renderDetail(); drawPlan(); return;
        }
        else if (k === "ies") { p.ies = getIes().find((e) => e.name === el.value) || null; p.iesWant = el.value; }
        else if (k === "iesWant") p.iesWant = el.value;
        else { const v = N(el.value); if (v == null) return; p[k] = k === "n" ? Math.max(1, Math.round(v)) : v; }
        recalc();
      };
      el.onfocus = () => { const p = st.poles[+el.closest("tr").dataset.i]; if (st.sel !== p.id) select(p.id); };
    });
    root.querySelectorAll("[data-pick]").forEach((td) => td.onclick = () => select(st.poles[+td.dataset.pick].id));
    bindDetail();
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
      st.poles.push(last ? { ...last, id, x: last.x + 5, lamps: copyLamps(poleLamps(last)) } : { id, x: 0, y: 0, H: 10, aim: 90, tilt: 30, n: 1, ies: getIes()[0] || null, iesWant: "", lamps: [newLamp()] });
      st.sel = id; st.selLamp = null; render();
    };
    root.querySelector("#avDup").onclick = () => {
      const p = st.poles.find((q) => q.id === st.sel); if (!p) return;
      const id = nextId(); st.poles.push({ ...p, id, x: p.x + 3, y: p.y + 3, lamps: copyLamps(poleLamps(p)) }); st.sel = id; st.selLamp = null; render();
    };
    root.querySelector("#avV2").onclick = () => { if (st.view3d || st.facade) { st.view3d = false; st.facade = false; render({ keep: true }); } };
    root.querySelector("#avV3").onclick = () => { if (!st.view3d) { st.view3d = true; st.facade = false; stopTool(); render({ keep: true }); } };
    const vf = root.querySelector("#avVF"); if (vf) vf.onclick = () => { if (!st.facade) { st.facade = true; st.view3d = false; stopTool(); render({ keep: true }); } };
    root.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => { st.tab = b.dataset.tab; if (st.tab !== "obj") stopTool(); render({ keep: true }); });
    bindObj();
    root.querySelector("#avAddA").onclick = () => { st.areas.push({ name: `Vùng ${st.areas.length + 1}`, x0: 0, y0: 0, L: 20, W: 10, step: null, req: null, MF: null, poly: null }); render(); };
    bindCanvas();
  }

  // đổi trụ/đèn đang chọn: chỉ dựng lại ngăn chi tiết (không dựng lại bảng/canvas → không mất focus, không ngắt thao tác kéo)
  function renderDetail() {
    const w = root.querySelector("#avDetailWrap"); if (!w) return;
    w.innerHTML = detailHtml(); bindDetail();
  }
  function select(id, lampIx = null) {
    const changed = st.sel !== id || st.selLamp !== lampIx;
    st.sel = id; st.selLamp = lampIx; markSel();
    if (changed) renderDetail();
    drawPlan();
  }
  function bindDetail() {
    const p = selPole(); if (!p) return;
    p.lamps = poleLamps(p);
    const rerender = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };
    root.querySelectorAll("#avDetail [data-l] input, #avDetail [data-l] select").forEach((el) => {
      const i = +el.closest("[data-l]").dataset.l, k = el.dataset.lk;
      el.onfocus = () => { if (st.selLamp !== i) { st.selLamp = i; root.querySelectorAll("#avDetail .lamp").forEach((d) => d.classList.toggle("on", +d.dataset.l === i)); drawPlan(); } };
      el.onchange = el.oninput = (e) => {
        const l = p.lamps[i];
        if (k === "ies") { if (e.type === "input") return; l.ies = getIes().find((x) => x.name === el.value) || null; l.iesWant = el.value; rerender(); return; }
        if (k === "iesWant") { l.iesWant = el.value; return; }
        const v = N(el.value);
        if (k === "H") l.H = v != null && v >= 0 ? v : null;
        else if (v == null) return;
        else if (k === "tilt") l.tilt = Math.max(0, Math.min(180, v));
        else if (k === "arm") l.arm = Math.max(0, v);
        else l[k] = v;
        p.n = p.lamps.length; recalc();
        if (e.type === "change") { const svg = root.querySelector("#avDetail .compass"); if (svg) svg.outerHTML = compass(p.lamps); }
      };
    });
    root.querySelectorAll("[data-ldel]").forEach((b) => b.onclick = () => { p.lamps.splice(+b.dataset.ldel, 1); p.n = p.lamps.length; st.selLamp = null; rerender(); });
    root.querySelector("#avLAdd").onclick = () => {
      const last = p.lamps[p.lamps.length - 1];
      p.lamps.push(last ? { ...last, aim: ((last.aim || 0) + 90) % 360 } : newLamp()); p.n = p.lamps.length; st.selLamp = p.lamps.length - 1; rerender();
    };
    root.querySelector("#avLSpread").onclick = () => { p.lamps = spreadLamps(p.lamps, p.lamps[0].aim || 0); rerender(); };
    const cp = root.querySelector("#avLCopy");
    if (cp) cp.onchange = () => {
      const targets = cp.value === "*" ? st.poles.filter((q) => q !== p) : st.poles.filter((q) => q.id === cp.value);
      for (const q of targets) { q.lamps = copyLamps(p.lamps); q.n = q.lamps.length; }
      setStatus(`Đã sao chép ${p.lamps.length} đèn của trụ ${p.id} sang ${targets.length} trụ.`); rerender();
    };
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
    if (st.view3d) {
      if (!st.cam) st.cam = defaultCamera(st.poles, st.areas, st.objects);
      const v3 = drawArea3D(cv.getContext("2d"), cv.width, cv.height, st, { cam: st.cam, px: dpr, fast: !!st.orbiting });
      view = { range: v3.range, three: true };
    } else if (st.facade) {
      const vf = drawFacades(cv.getContext("2d"), cv.width, cv.height, st.arch, { objId: st.selObj, px: dpr, colors: colors() });
      view = { range: vf.range, facade: true };
    } else view = drawAreaPlan(cv.getContext("2d"), cv.width, cv.height, st, { sel: st.sel, selLamp: st.selLamp, selObj: st.selObj, draft: st.draft, colors: colors(), px: dpr, bounds: dragBounds });
    const lg = root.querySelector("#avLegend");
    if (lg && (st.result || (st.facade && st.arch))) {
      const [lo, hi] = view.range, grad = view.three ? rampCss() : [0, .25, .5, .75, 1].map((t) => `rgb(${heatColor(t).join(",")}) ${t * 100}%`).join(",");
      lg.innerHTML = `<span class="bar" style="background:linear-gradient(90deg,${grad})"></span><span>${f1(lo, 0)} – ${view.facade ? "≥ " : ""}${f1(hi, 0)} lx</span><span>· ${view.facade ? "độ rọi trên bề mặt (theo pháp tuyến)" : "độ rọi ngang duy trì"}${st.result ? ` · công suất ${f1(st.result.power / 1000, 2)} kW` : ""}</span>`;
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
        const [sx, sy] = view.toScreen(p.x, p.y);
        const d1 = Math.hypot(px - sx, py - sy);
        if (d1 < bd) { bd = d1; best = { p, mode: "move" }; }
        poleLamps(p).forEach((l, i) => {
          const [hx, hy] = view.toScreen(...lampHandle(p, l)), d2 = Math.hypot(px - hx, py - hy);
          if (d2 < bd) { bd = d2; best = { p, mode: "aim", li: i }; }
        });
      }
      return best;
    };
    const inPolyW = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    const segD = (x, y, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(x - ax - dx * t, y - ay - dy * t); };
    const hitObj = (wx, wy) => {                                      // vật thể trên cùng dưới con trỏ (cây → tường → nhà)
      const tol = 10 * (window.devicePixelRatio || 1) / view.scale;
      for (const o of [...st.objects].reverse()) if (o.type === "tree" && Math.hypot(wx - o.pts[0][0], wy - o.pts[0][1]) <= Math.max(o.crownR || 2, tol)) return o;
      for (const o of [...st.objects].reverse()) if (o.type === "wall") for (let i = 0; i + 1 < o.pts.length; i++) if (segD(wx, wy, o.pts[i], o.pts[i + 1]) <= tol) return o;
      for (const o of [...st.objects].reverse()) if (o.type === "building" && inPolyW(wx, wy, o.pts)) return o;
      return null;
    };
    const snap = (v) => Math.round(v * 2) / 2;                         // bắt điểm 0,5 m
    let orbit = null, raf = 0; const touches = new Map();
    const frame = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; drawPlan(); }); };   // gộp sự kiện, 1 lần vẽ / khung hình
    cv.onwheel = (e) => { if (!st.view3d || !st.cam) return; e.preventDefault(); st.cam.dist = Math.max(5, Math.min(2000, st.cam.dist * Math.exp(e.deltaY * 0.0012))); frame(); };
    cv.ondblclick = () => { if (st.view3d) { st.cam = defaultCamera(st.poles, st.areas, st.objects); drawPlan(); } else if (st.tool && st.draft) finishDraft(); };
    cv.onpointerdown = (e) => {
      if (st.view3d) {
        touches.set(e.pointerId, [e.clientX, e.clientY]); cv.setPointerCapture(e.pointerId);
        orbit = { x: e.clientX, y: e.clientY, az: st.cam.az, el: st.cam.el, dist: st.cam.dist, pinch: touches.size === 2 ? (([a, b2]) => Math.hypot(a[0] - b2[0], a[1] - b2[1]))([...touches.values()]) : null };
        return;
      }
      if (st.facade) return;
      const [px, py] = pt(e);
      if (st.tool) {                                                    // đang vẽ vật thể
        const [wx, wy] = view.toWorld(px, py), P = [snap(wx), snap(wy)];
        if (st.tool === "tree") {
          const id = nextObjId("C");
          st.objects.push({ id, type: "tree", pts: [P], H: 8, crownR: 3, mat: "Tán lá cây", rho: DEFAULT_RHO.tree, zone: null, reqE: null, reqL: null, faces: null, step: null });
          st.selObj = id; setStatus(`Đã thêm cây ${id} tại (${P[0]}; ${P[1]}) — sửa chiều cao, bán kính tán trong bảng.`);
          const y = window.scrollY; render(); window.scrollTo(0, y); return;
        }
        const last = st.draft.pts[st.draft.pts.length - 1];
        if (!last || last[0] !== P[0] || last[1] !== P[1]) st.draft.pts.push(P);   // bấm đúp không thêm điểm trùng
        drawPlan(); return;
      }
      const h = hit(px, py);
      if (!h) {
        const [wx, wy] = view.toWorld(px, py), o = hitObj(wx, wy);
        if (o) { if (st.sel) select(null); selectObj(o.id); drag = { mode: "obj", o, last: [wx, wy] }; dragBounds = view.bounds; cv.setPointerCapture(e.pointerId); return; }
        if (st.sel) select(null); if (st.selObj) selectObj(null); return;
      }
      select(h.p.id, h.mode === "aim" ? h.li : (st.sel === h.p.id ? st.selLamp : null));
      drag = h; dragBounds = view.bounds; cv.setPointerCapture(e.pointerId); drawPlan();
    };
    cv.onpointermove = (e) => {
      if (st.view3d) {
        if (!orbit) return; touches.set(e.pointerId, [e.clientX, e.clientY]);
        if (touches.size === 2 && orbit.pinch) { const [a, b2] = [...touches.values()], d = Math.hypot(a[0] - b2[0], a[1] - b2[1]); st.cam.dist = Math.max(5, Math.min(2000, orbit.dist * orbit.pinch / Math.max(1, d))); }
        else { st.cam.az = orbit.az - (e.clientX - orbit.x) * 0.4; st.cam.el = Math.max(8, Math.min(85, orbit.el + (e.clientY - orbit.y) * 0.3)); }
        st.orbiting = true; frame(); return;
      }
      if (st.facade) return;
      const [px, py] = pt(e);
      if (st.tool) { cv.style.cursor = "crosshair"; if (st.draft && st.draft.pts.length) { const [wx, wy] = view.toWorld(px, py); st.draft.hover = [snap(wx), snap(wy)]; frame(); } return; }
      if (!drag) { const h = view && hit(px, py); cv.style.cursor = h ? (h.mode === "aim" ? "crosshair" : "grab") : (view && view.toWorld && hitObj(...view.toWorld(px, py)) ? "move" : "default"); return; }
      const [wx, wy] = view.toWorld(px, py), p = drag.p;
      if (drag.mode === "obj") {
        const dx = snap(wx - drag.last[0]), dy = snap(wy - drag.last[1]); if (!dx && !dy) return;
        drag.o.pts = drag.o.pts.map(([x, y]) => [x + dx, y + dy]); drag.last = [drag.last[0] + dx, drag.last[1] + dy];
        const tr = root.querySelector(`tr[data-o="${st.objects.indexOf(drag.o)}"] [data-ok="pts"]`); if (tr) tr.value = ptsStr(drag.o.pts);
        frame(); recalc(); return;
      }
      if (drag.mode === "move") { p.x = Math.round(wx * 10) / 10; p.y = Math.round(wy * 10) / 10; }
      else {
        p.lamps = poleLamps(p);
        const l = p.lamps[drag.li]; if (!l) return;
        l.aim = Math.round(Math.atan2(wy - p.y, wx - p.x) * 180 / Math.PI);
        const inp = root.querySelector(`#avDetail [data-l="${drag.li}"] [data-lk="aim"]`); if (inp) inp.value = l.aim;
        const svg = root.querySelector("#avDetail .compass"); if (svg) svg.outerHTML = compass(p.lamps);
      }
      drawPlan();
      const tr = root.querySelector(`tr[data-i="${st.poles.indexOf(p)}"]`);
      if (tr) { tr.querySelector('[data-k="x"]').value = p.x; tr.querySelector('[data-k="y"]').value = p.y; }
      recalc();
    };
    cv.onpointerup = cv.onpointercancel = cv.onlostpointercapture = (e) => {
      if (st.view3d) {
        touches.delete(e && e.pointerId);
        if (!touches.size) { orbit = null; if (st.orbiting) { st.orbiting = false; frame(); } }
        else if (touches.size === 1 && orbit) { const [q] = touches.values(); orbit = { x: q[0], y: q[1], az: st.cam.az, el: st.cam.el, dist: st.cam.dist, pinch: null }; }   // còn 1 ngón: tính lại gốc, không nhảy
        return;
      } if (drag) { drag = null; dragBounds = null; recalc(true); } };
  }

  // ---------- nạp dữ liệu ----------
  function loadState(s, name) {
    st.poles = s.poles.map((p) => ({ ...p, lamps: copyLamps(poleLamps(p)) })); st.areas = s.areas; st.objects = s.objects || [];
    st.selObj = null; st.tool = null; st.draft = null; st.facade = false; st.tab = s.tab || (st.objects.length && !st.areas.length ? "obj" : "poles"); st.warnings = s.warnings || []; st.name = name || ""; st.sel = null; st.selLamp = null; st.areaIx = 0; st.cam = null;
    render();
    setStatus(`Khu vực: ${st.poles.length} trụ, ${st.areas.length} vùng${st.objects.length ? `, ${st.objects.length} vật thể` : ""}${st.warnings.length ? ` · ${st.warnings.length} cảnh báo` : ""}. ${getIes().length ? "Kéo trụ hoặc sửa bảng — kết quả tự tính lại." : "Chọn thư mục IES để tính."}`, st.warnings.length > 0);
  }
  function loadWorkbook(wb, name) {
    const XLSX = window.XLSX;
    const rd = (n) => wb.SheetNames.includes(n) ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null }) : [];
    const base = parseAreaRows({ poleRows: rd("VI TRI TRU"), areaRows: rd("VUNG TINH"), lampRows: rd("DEN TREN TRU") }, getIes());
    const ob = parseObjRows(rd("VAT THE"));
    loadState({ ...base, objects: ob.objects, warnings: [...base.warnings, ...ob.warnings] }, name);
  }
  function loadSample(kind = "san") {
    const s0 = sampleState(kind, getIes());
    loadState(s0, s0.name);
    if (s0.tab === "obj" && s0.objects.length) { st.selObj = s0.objects[0].id; st.tab = "obj"; render(); return; }
    if (s0.select) select(s0.select);
  }
  function onIes() {
    const ies = getIes();
    for (const p of st.poles) {
      if (!p.ies && p.iesWant) p.ies = matchAreaIes(p.iesWant, ies);
      for (const l of poleLamps(p)) if (!l.ies && l.iesWant) l.ies = matchAreaIes(l.iesWant, ies);
    }
    if (st.poles.length || st.areas.length) render();
  }

  // ---------- xuất ----------
  const hasData = () => { if (st.poles.length && (st.areas.length || st.objects.length)) return true; setStatus("Chưa có trụ đèn hoặc vùng tính để xuất — nạp Excel khu vực hoặc bắt đầu từ sân mẫu.", true); return false; };
  async function saveExcel() {
    if (!hasData()) return;
    if (!window.ExcelJS) { setStatus("Chưa tải được thư viện ExcelJS.", true); return; }
    const result = st.result || calcArea(st, { MF: getMF() });
    const arch = st.objects.length ? (st.arch || calcArch(st, { MF: getMF() })) : null;
    const wbx = await buildAreaWorkbook(window.ExcelJS, { poles: st.poles, areas: st.areas, objects: st.objects, result, arch, projectName: st.name });
    await saveXlsxBuffer(await wbx.xlsx.writeBuffer(), outName("KhuVuc", st.name || null, "xlsx"));
    setStatus("Đã tạo file Excel khu vực: vị trí trụ (đã chỉnh), vùng tính, kết quả, lưới độ rọi.");
  }
  async function downloadTemplate(kind = "san") {
    if (!window.ExcelJS) { setStatus("Chưa tải được thư viện ExcelJS.", true); return; }
    const wbx = await buildAreaTemplate(window.ExcelJS, { sample: kind === "san" ? null : sampleState(kind, []) });
    const fn = { san: "DATA_MAU_KHU_VUC_WEBDIALUX.xlsx", congvien: "DATA_MAU_CONG_VIEN_WEBDIALUX.xlsx", quangtruong: "DATA_MAU_QUANG_TRUONG_WEBDIALUX.xlsx", mythuat: "DATA_MAU_MY_THUAT_WEBDIALUX.xlsx" }[kind] || "DATA_MAU_KHU_VUC_WEBDIALUX.xlsx";
    await saveXlsxBuffer(await wbx.xlsx.writeBuffer(), fn);
    if (kind === "mythuat") { setStatus("Đã tạo Excel mẫu chiếu sáng mỹ thuật (tòa nhà, tường rào, 2 cây, đèn hắt âm đất — sheet VAT THE). Đổi tên file IES cho đúng thư viện rồi nạp lại."); return; }
    setStatus(kind === "congvien" ? "Đã tạo Excel mẫu công viên (4 vùng theo Bảng 7 TCVN 13608:2023, trụ nhiều đèn). Đổi tên file IES cho đúng thư viện rồi nạp lại." : "Đã tạo Excel mẫu khu vực. Điền tên file IES rồi nạp lại.");
  }
  async function exportPdf() {
    if (!hasData()) return;
    const { jsPDF, makeDoc, finalizeDoc, font } = await getPdfTools();
    const { renderAreaPdf } = await import("./areaReport.mjs");
    const result = st.result || calcArea(st, { MF: getMF() });
    const arch = st.objects.length ? (st.arch || calcArch(st, { MF: getMF() })) : null;
    const doc = makeDoc({ jsPDF, font });
    renderAreaPdf(doc, { state: st, result, arch, projectName: st.name || "Khu vực" });
    finalizeDoc(doc, { tail: "độ rọi ngang duy trì · TCVN 13608:2023 / EN 12193" });
    const blob = doc.output("blob");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: outName("BaoCao_KhuVuc", st.name || "khu_vuc", "pdf") });
    document.body.appendChild(a); a.click(); a.remove();
    setStatus("Đã tạo báo cáo PDF khu vực.");
  }

  return { render, loadWorkbook, loadSample, onIes, recalc, saveExcel, exportPdf, downloadTemplate, state: st, view: () => view };
}
