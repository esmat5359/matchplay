import { boot, $, tilt, reveal, mochiSpinner, toast, spinner } from "../lib/ui.js";
import { api, poll } from "../lib/chain.js";
import { CONFIG } from "../config.js";
import { fmtGen, esc } from "../lib/format.js";
import { errorBox } from "../lib/render.js";

boot("ledger");
const box = $("#ledger"); box.innerHTML = `<div style="min-height:40vh;display:grid;place-items:center">${mochiSpinner("Reading the books…")}</div>`;
let audit = null;
const term = (l, v, note = "") => `<div class="term"><small>${l}</small>${fmtGen(v, 6)} <span style="font-size:.8rem">GEN</span>${note ? `<div class="tiny muted" style="font:500 .78rem var(--f-body);margin-top:2px">${note}</div>` : ""}</div>`;
function draw(s, v) {
  const inside = BigInt(v.deposited) - BigInt(v.claimed);
  const native = v.native == null ? null : BigInt(v.native);
  let nativeNote = "";
  if (native != null) {
    const d = native - inside;
    nativeNote = d === 0n ? `<div class="ok-box">The contract's own balance equals what should still be inside. In sync.</div>`
      : d > 0n ? `<div class="warn-box"><b>The contract holds ${fmtGen(d, 6)} GEN more than its books explain.</b> On Studionet a payable call the contract refused (create_round, enter or top_up) leaves the attached GEN in the contract, outside the books. Matchplay's pages check inputs first so this does not happen through the app.</div>`
      : `<div class="info-box"><b>The balance is ${fmtGen(-d, 6)} GEN below the books.</b> That is normal for a moment after a claim: the transfer is only reflected once the network has finalised it.</div>`;
  }
  box.innerHTML = `
  <div class="reveal"><div class="row" style="margin-bottom:8px"><span class="pill ${v.balanced ? "good" : "bad"}">${v.balanced ? "Books balanced" : "Books do not balance"}</span>${audit ? `<span class="pill ${audit.ok ? "good" : "bad"}">${audit.ok ? "Full audit passed" : "Audit failed: " + esc(audit.why || "mismatch")}</span>` : ""}</div>
  <div class="eq">${term("Paid in", v.deposited)}<span class="op">−</span>${term("Sent out", v.claimed)}<span class="op">=</span>${term("Still inside", inside)}</div>
  <div class="eq">${term("Still inside", inside)}<span class="op">=</span>${term("Owed", v.owed, "credited, waiting to be claimed")}<span class="op">+</span>${term("Locked", v.locked, "held by open or playing rounds")}</div></div>
  <div class="reveal" style="margin:24px 0">${nativeNote}</div>
  <h2 style="font-size:1.4rem;margin-top:40px">Activity</h2>
  <div class="books reveal">${[["Rounds", s.rounds], ["Entries", s.entries], ["Matches judged", s.judged], ["Voided", s.voided], ["Timed out", s.timeouts], ["Strikes", s.flagged], ["Rounds done", s.done], ["Cancelled", s.cancelled], ["Claims", s.claims]].map(([a, b]) => `<div class="kpi" data-tilt="6"><small>${a}</small><b>${b}</b></div>`).join("")}</div>
  <div class="card reveal" style="margin-top:34px;display:flex;gap:20px;align-items:center;justify-content:space-between;flex-wrap:wrap"><div><h3 style="margin:0 0 4px">Recompute everything</h3><p class="muted" style="margin:0">The full audit reads every round and every credit from scratch. It grows with the number of rounds, so it runs only when you ask.</p></div><button class="btn primary" id="aud">Run full audit</button></div>
  <p class="tiny muted" style="margin-top:20px">Contract <a class="mono" target="_blank" rel="noopener" href="${CONFIG.addressUrl(CONFIG.contract)}">${CONFIG.contract}</a></p>`;
  $("#aud").onclick = async (e) => { e.target.disabled = true; e.target.innerHTML = `<span class="ring3d tiny"></span> Auditing…`; try { audit = await api.audit(true); } catch (err) { toast(esc(err.message), "warn"); } draw(s, v); };
  tilt(box); reveal(box);
}
poll(async () => {
  try { const [s, v] = await Promise.all([api.stats(), api.solvency()]); draw(s, v); }
  catch (e) { if (!box.querySelector(".eq")) { box.innerHTML = errorBox(e.message); $("[data-retry]", box)?.addEventListener("click", () => location.reload()); } }
}, 45000);
