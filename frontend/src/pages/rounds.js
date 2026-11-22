import { boot, $, $$, tilt, reveal, countdowns, openConnect, spinner } from "../lib/ui.js";
import { api, poll } from "../lib/chain.js";
import { wallet, onWallet } from "../lib/wallet.js";
import { roundCard, skeletonCards, errorBox, emptyBox } from "../lib/render.js";

boot("rounds");
const PAGE = 12;
let rows = [], filter = "all", mine = false, done = false, loading = false;
const list = $("#list"), more = $("#more");

function draw() {
  const shown = rows.filter((r) => filter === "all" || String(r.state) === filter);
  list.innerHTML = shown.length ? shown.map(roundCard).join("") : `<div style="grid-column:1/-1">${emptyBox(mine ? "Nothing here yet" : "No rounds match", mine ? "Rounds you host or enter will show up here." : "Try another filter, or host the first one.", `<a class="btn primary" href="./create.html">Host a round</a>`)}</div>`;
  tilt(list); reveal(list); countdowns(list);
  more.hidden = done || mine;
}
async function load(reset = false) {
  if (loading) return; loading = true;
  if (reset) { rows = []; done = false; list.innerHTML = skeletonCards(6); }
  try {
    if (mine) {
      if (wallet.status !== "connected") { list.innerHTML = `<div style="grid-column:1/-1">${emptyBox("Connect your wallet", "Your hosted and entered rounds appear here.", `<button class="btn primary" id="c-now">Connect wallet</button>`)}</div>`; $("#c-now")?.addEventListener("click", openConnect); more.hidden = true; return; }
      rows = await api.roundsOf(wallet.account, 0, 50); done = true;
    } else {
      const part = await api.listRounds(rows.length, PAGE);
      rows = rows.concat(part); if (part.length < PAGE) done = true;
    }
    draw();
  } catch (e) { list.innerHTML = `<div style="grid-column:1/-1">${errorBox(e.message)}</div>`; $("[data-retry]", list)?.addEventListener("click", () => load(true)); }
  finally { loading = false; }
}
$("#filters").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-f]"); if (!b) return;
  filter = b.dataset.f; $$("#filters button[data-f]").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw();
});
$("#mine-toggle").onclick = (e) => { mine = !mine; e.currentTarget.setAttribute("aria-pressed", mine); load(true); };
more.onclick = async () => { more.disabled = true; await load(); more.disabled = false; };
onWallet((_w, why) => { if (mine && (why === "connected" || why === "disconnected" || why === "account")) load(true); });
load(true);
// keep the first page fresh without loading more pages
poll(async () => { if (!rows.length || mine || loading || document.hidden) return; const first = await api.listRounds(0, Math.max(PAGE, Math.min(rows.length, 50))); rows = first.concat(rows.slice(first.length)); draw(); }, 40000);
