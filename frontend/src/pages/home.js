import { boot, $, $$, copy, tilt, reveal, countdowns } from "../lib/ui.js";
import { api, poll } from "../lib/chain.js";
import { CONFIG } from "../config.js";
import { fmtGen, pairs } from "../lib/format.js";
import { roundCard, skeletonCards, errorBox } from "../lib/render.js";
import { initVideos } from "./video.js";

boot("index");
$("#home-addr").textContent = CONFIG.contract;
$("#home-copy").onclick = () => copy(CONFIG.contract, "Contract address copied");
$("#home-explorer").href = CONFIG.addressUrl(CONFIG.contract);
$("#home-gh").href = CONFIG.github;

// the judge visual: swap the order every few seconds
const duel = $("#duel"), lamp = $(".lamp", duel), verdict = $("#duel-verdict");
const bars = $("#fit-bars");
const cases = [
  { fits: [[75, 50], [75, 50]], line: "Same winner in both orders: a decisive result.", lamp: ["Reading 1 · A then B", "Reading 2 · B then A"] },
  { fits: [[75, 75], [50, 75]], line: "The winner flipped with the order: it is a tie.", lamp: ["Reading 1 · A then B", "Reading 2 · B then A"] },
];
let swapped = false, k = 0;
function drawBars(fits) {
  bars.innerHTML = [["Reading 1", fits[0]], ["Reading 2", fits[1]]].map(([t, f]) => `<div class="bar-row"><span>${t} · A</span><span class="t"><i style="width:${f[0]}%"></i></span><b>${f[0]}</b></div><div class="bar-row"><span>${t} · B</span><span class="t"><i style="width:${f[1]}%;background:linear-gradient(90deg,#ff7a18,#ffb066)"></i></span><b>${f[1]}</b></div>`).join("");
}
function flip() { swapped = !swapped; duel.classList.toggle("swapped", swapped); lamp.textContent = cases[k].lamp[swapped ? 1 : 0]; if (!swapped) { k = (k + 1) % cases.length; } drawBars(cases[k].fits); verdict.textContent = swapped ? "Now the order is swapped…" : cases[k].line; if (swapped) setTimeout(() => (verdict.textContent = cases[k].line), 1100); }
drawBars(cases[0].fits); setInterval(flip, 3600);

// the calculator
const calc = () => {
  const prize = Number($("#c-prize").value) || 0, n = Math.min(8, Math.max(3, Math.round(Number($("#c-n").value) || 3))), bond = Number($("#c-bond").value) || 0;
  const m = pairs(n), pts = 2 * m, unit = prize / pts, per = 2 * (n - 1);
  $("#calc").innerHTML = [["Matches", m, `${n} entries, each pair once`], ["Points", pts, "2 per match"], ["One point", `${unit.toFixed(4)} GEN`, "prize ÷ points"], ["Best case", `${(unit * per).toFixed(3)} GEN`, `wins all ${n - 1} matches, bond back`], ["Bonds held", `${(bond * n).toFixed(3)} GEN`, "refunded after the round"]].map(([a, b, c]) => `<div class="kpi"><small>${a}</small><b>${b}</b><span>${c}</span></div>`).join("");
};
$$("#c-prize,#c-n,#c-bond").forEach((i) => i.addEventListener("input", calc)); calc();

// live numbers
const set = (key, v) => $$(`[data-stat="${key}"]`).forEach((e) => (e.textContent = v));
poll(async () => {
  try {
    const s = await api.stats();
    set("rounds", s.rounds); set("judged", s.judged); set("locked", fmtGen(s.locked, 3));
  } catch { set("rounds", "–"); }
}, 30000);
async function latest() {
  const box = $("#latest"); box.innerHTML = skeletonCards(3);
  try {
    const rows = (await api.listRounds(0, 3));
    box.innerHTML = rows.length ? rows.map(roundCard).join("") : `<div class="card" style="grid-column:1/-1"><b>No rounds yet.</b> Be the first to <a href="./create.html">host one</a>.</div>`;
    tilt(box); reveal(box); countdowns(box);
  } catch (e) { box.innerHTML = errorBox(e.message); $("[data-retry]", box)?.addEventListener("click", latest); }
}
latest();
initVideos();
