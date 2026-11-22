import { boot, $, $$, runTx, toast, modal, openConnect } from "../lib/ui.js";
import { api } from "../lib/chain.js";
import { wallet } from "../lib/wallet.js";
import { esc, fmtGen, parseGen, pairs } from "../lib/format.js";
import { checkRound, clean } from "../lib/validate.js";

boot("create");
const g = (id) => $("#" + id);
const touched = new Set();
function values() {
  return {
    title: g("f-title").value, mission: g("f-mission").value, prize: parseGen(g("f-prize").value), bond: parseGen(g("f-bond").value),
    minEntries: Number(g("f-min").value), maxEntries: Number(g("f-max").value),
    entryWindow: Math.round(Number(g("f-ew").value) * Number(g("u-ew").value)), playWindow: Math.round(Number(g("f-pw").value) * Number(g("u-pw").value)),
    minFit: Number(g("f-fit").value), needEvidence: g("f-ev").checked,
  };
}
function run() {
  const v = values(), { errors } = checkRound(v);
  g("c-title").textContent = `${[...clean(v.title)].length}/60`; g("c-mission").textContent = `${[...clean(v.mission)].length}/1000`;
  const map = { title: "g-title", mission: "g-mission", prize: "g-prize", bond: "g-bond", entryWindow: "g-ew", playWindow: "g-pw", minFit: "g-fit" };
  for (const [k, box] of Object.entries(map)) { const er = errors.find((e) => e.field === k), b = g(box); b.classList.toggle("bad", !!er && touched.has(k)); const p = $(".err", b); p.hidden = !(er && touched.has(k)); p.textContent = er?.message ?? ""; }
  const ee = errors.find((e) => e.field === "entries"); g("e-entries").hidden = !ee; g("e-entries").textContent = ee?.message ?? "";
  g("r-check").innerHTML = errors.length ? errors.slice(0, 4).map((e) => `<li class="bad">${esc(e.message)}</li>`).join("") : "<li>Everything the contract checks is in range</li>";
  g("f-send").disabled = errors.length > 0;
  g("f-note").textContent = v.prize != null && !errors.length ? `You will attach ${fmtGen(v.prize)} GEN.` : "";
  preview(v);
  return { v, errors };
}
function preview(v) {
  const rows = [];
  const lo = Math.max(3, Math.min(8, v.minEntries || 3)), hi = Math.max(lo, Math.min(8, v.maxEntries || lo));
  for (let n = lo; n <= hi; n++) {
    const m = pairs(n), pts = 2 * m, ok = v.prize != null && v.prize > 0n;
    const unit = ok ? v.prize / BigInt(pts) : null;
    rows.push(`<tr><td>${n}</td><td>${m}</td><td>${pts}</td><td>${unit != null ? fmtGen(unit, 6) : "–"}</td><td>${unit != null ? fmtGen(unit * BigInt(2 * (n - 1)), 4) : "–"}</td></tr>`);
  }
  g("pv-rows").innerHTML = rows.join("");
  const worst = pairs(hi) * 2; g("pv-unit").textContent = v.prize != null && v.prize > 0n ? fmtGen(v.prize / BigInt(worst), 6) : "–";
}
$$("#f-title,#f-mission,#f-prize,#f-bond,#f-min,#f-max,#f-ew,#u-ew,#f-pw,#u-pw,#f-fit,#f-ev").forEach((el) => {
  el.addEventListener("input", run); el.addEventListener("change", run);
  el.addEventListener("blur", () => { const k = { "f-title": "title", "f-mission": "mission", "f-prize": "prize", "f-bond": "bond", "f-ew": "entryWindow", "f-pw": "playWindow", "f-fit": "minFit" }[el.id]; if (k) { touched.add(k); run(); } });
});
run();
g("f-send").onclick = async () => {
  ["title", "mission", "prize", "bond", "entryWindow", "playWindow", "minFit"].forEach((k) => touched.add(k));
  const { v, errors } = run(); if (errors.length) return;
  if (!wallet.account) return openConnect();
  const { values: clean_ } = checkRound(v);
  const ok = await new Promise((res) => { const m = modal(`<h3>Open this round?</h3><p>You will attach <b>${fmtGen(v.prize)} GEN</b> as the prize. It stays locked in the contract until the round ends. What nobody earns comes back to you.</p><div class="row"><button class="btn primary" id="go">Open the round</button><button class="btn ghost" id="no">Not now</button></div>`, { onClose: () => res(false) }); $("#go", m.body).onclick = () => { res(true); m.el.remove(); }; $("#no", m.body).onclick = m.close; });
  if (!ok) return;
  const r = await runTx({ title: "Open the round", fn: "create_round", value: v.prize, args: [clean_.title, clean_.mission, v.bond, v.minEntries, v.maxEntries, v.entryWindow, v.playWindow, v.minFit, v.needEvidence], success: "Your round is open." });
  if (r?.ok) {
    try { const mine = await api.roundsOf(wallet.account, 0, 1); const rid = mine?.[0]?.id; if (rid != null) { location.href = `./round.html?id=${rid}`; return; } } catch {}
    toast("Round created. Find it in the arena.", "ok"); location.href = "./rounds.html";
  }
};
