import { esc, fmtGen, short } from "./format.js";
import { stateBadge } from "./ui.js";

export function roundCard(r) {
  const ends = r.state === 0 ? r.entry_deadline : r.state === 1 ? r.play_deadline : 0;
  const when = r.state === 0 ? "Entries" : r.state === 1 ? "Playing" : "";
  return `<a class="card tcard rcard reveal" data-tilt="5" href="./round.html?id=${r.id}">
    <div class="top">${stateBadge(r.state)}<span class="pill">#${r.id}</span></div>
    <h3>${esc(r.title)}</h3><p class="m">${esc(r.mission)}</p>
    <div class="meta"><div><small>Prize</small><b>${fmtGen(r.prize)} GEN</b></div><div><small>Entries</small><b>${r.entry_count}/${r.max_entries}</b></div><div><small>Bar</small><b>${r.min_fit}</b></div>${ends ? `<div><small>${when}</small><b data-countdown="${ends}">…</b></div>` : `<div><small>Host</small><b class="mono">${short(r.host)}</b></div>`}</div>
  </a>`;
}
export const skeletonCards = (n = 3) => Array.from({ length: n }, () => `<div class="skeleton" style="height:210px"></div>`).join("");
export const errorBox = (msg, retry = true) => `<div class="err-box"><b>Could not load this from Studionet.</b><p style="margin:6px 0 0">${esc(msg)}</p>${retry ? `<p style="margin:10px 0 0"><button class="btn ghost sm" data-retry>Try again</button></p>` : ""}</div>`;
export const emptyBox = (title, text, cta = "") => `<div class="empty"><img src="./img/mochi-head.webp" alt=""><h3>${esc(title)}</h3><p>${text}</p>${cta}</div>`;
export const OUT = ["A wins", "B wins", "Tie", "Nobody earns"];
