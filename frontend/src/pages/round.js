import { boot, $, $$, modal, toast, runTx, spinner, mochiSpinner, stateBadge, tilt, reveal, countdowns, confetti, openConnect, copy } from "../lib/ui.js";
import { api, poll } from "../lib/chain.js";
import { wallet, onWallet } from "../lib/wallet.js";
import { CONFIG } from "../config.js";
import { esc, fmtGen, parseGen, short, sameAddr, nowSec, fmtDate, avatar } from "../lib/format.js";
import { checkEntry, checkReason, clean } from "../lib/validate.js";
import { errorBox, OUT } from "../lib/render.js";

boot("round");
const id = Number(new URLSearchParams(location.search).get("id"));
const view = $("#view");
$("#boot-spin").innerHTML = mochiSpinner("Loading round…");
let R = null, tab = "entries", draft = { name: "", pitch: "", url: "" }, topAmt = "0.1", credit = 0n, busy = false;

const isHost = () => wallet.account && R && sameAddr(wallet.account, R.host);
const myEntry = () => R?.entries.find((e) => sameAddr(e.who, wallet.account));
const evidence = (u) => (u && /^https?:\/\//i.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener nofollow ugc">${esc(u.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 46))}${u.length > 52 ? "…" : ""} ↗</a>` : `<span class="muted">no link</span>`);
const nm = (i) => esc(R.entries[i]?.name ?? "?");
const reload = async (fresh = true) => { R = await api.round(id, fresh); render(); };

if (!Number.isInteger(id) || id < 0) view.innerHTML = `<div class="err-box"><b>No round selected.</b> Open one from the <a href="./rounds.html">arena</a>.</div>`;
else {
  poll(async () => {
    if (busy || !R) return;
    const next = await api.round(id);
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest("#side input, #side textarea");
    if (JSON.stringify(next) === JSON.stringify(R)) return; // nothing changed: leave the page alone
    R = next;
    if (!typing && !document.querySelector(".modal")) render();
  }, 20000);
}
window.addEventListener("error", () => {});

function timeline() {
  const s = R.state, cancelled = s === 3;
  const stages = [["Open", "Entries"], [cancelled ? "Cancelled" : "Playing", "Matches"], ["Done", "Payout"]];
  const at = cancelled ? 1 : s;
  return `<div class="timeline">${stages.map(([a, b], i) => `<div class="${i <= at ? "on" : ""} ${i === at && s < 2 ? "now" : ""}">${a}<br><span style="font-weight:500">${b}</span></div>`).join("")}</div>`;
}
function clock() {
  if (R.state === 0) return `<div class="kpi"><small>Entries close</small><b data-countdown="${R.entry_deadline}">…</b><span>${fmtDate(R.entry_deadline)}</span></div>`;
  if (R.state === 1) return `<div class="kpi"><small>Play deadline</small><b data-countdown="${R.play_deadline}">…</b><span>${fmtDate(R.play_deadline)}</span></div>`;
  return `<div class="kpi"><small>${R.state === 2 ? "Finished" : "Cancelled"}</small><b style="font-size:1rem">${fmtDate(R.finished_at)}</b><span>&nbsp;</span></div>`;
}
const priceNote = () => (R.price_final ? "final" : "estimate");

function render() {
  const open = R.state === 0, playing = R.state === 1, doneS = R.state === 2;
  view.innerHTML = `
  <div class="rhead reveal in"><div><div class="row" style="margin-bottom:10px">${stateBadge(R.state)}<span class="pill">Round #${R.id}</span><span class="pill">Bar ${R.min_fit}</span>${R.need_evidence ? '<span class="pill warn">Evidence required</span>' : ""}</div>
    <h1>${esc(R.title)}</h1><p class="muted" style="max-width:760px">${esc(R.mission)}</p>
    <p class="tiny muted">Hosted by <span class="mono">${avatar(R.host, 16)} ${short(R.host, 5)}</span>${isHost() ? ' <span class="pill good">you</span>' : ""} · created ${fmtDate(R.created)}</p></div>
    <div class="row"><button class="btn ghost sm" id="r-refresh">Refresh</button><button class="btn ghost sm" id="r-copy">Copy link</button></div></div>
  ${timeline()}
  <div class="kpis"><div class="kpi"><small>Prize</small><b>${fmtGen(R.prize)} GEN</b><span>${open ? `pool now ${fmtGen(R.pool)}` : "fixed at start"}</span></div>
    <div class="kpi"><small>Entry bond</small><b>${fmtGen(R.entry_bond)} GEN</b><span>refunded unless a strike</span></div>
    <div class="kpi"><small>One point</small><b>${fmtGen(R.price_per_point, 6)}</b><span>GEN · ${priceNote()}</span></div>
    <div class="kpi"><small>Entries</small><b>${R.entry_count}/${R.max_entries}</b><span>minimum ${R.min_entries}</span></div>
    ${playing || doneS ? `<div class="kpi"><small>Matches</small><b>${R.next_match}/${R.match_count}</b><span>${R.judged} judged · ${R.voided} voided · ${R.timeouts} timed out</span></div>` : ""}
    ${clock()}</div>
  <div class="layout"><div><div class="tabs" role="tablist">${["entries", "matches", "rules"].map((t) => `<button role="tab" aria-selected="${tab === t}" data-tab="${t}">${{ entries: `Entries (${R.entry_count})`, matches: `Matches${R.match_count ? ` (${R.match_count})` : ""}`, rules: "Rules of this round" }[t]}</button>`).join("")}</div><div id="tab-body">${tabBody()}</div></div>
  <aside class="side" id="side">${actions()}</aside></div>`;
  bind();
  tilt(view); countdowns(view); reveal(view);
  if (doneS) { const k = `mp.conf.${id}`; try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); confetti(); } } catch {} }
}

function tabBody() {
  if (tab === "entries") return entriesTable();
  if (tab === "matches") return matchesGrid();
  return `<div class="card prose" style="max-width:none"><h3 style="margin-top:0">How this round pays</h3><ul>
    <li>Every pair of entries meets once: <b>${R.match_count || (R.entry_count * (R.entry_count - 1)) / 2 || "n × (n−1) ÷ 2"}</b> matches${R.match_count ? "" : " with the entries so far"}. A match is worth 2 points: 2 to the winner, 1 each for a tie, 0 if nobody clears the bar.</li>
    <li>One point is worth <b>${fmtGen(R.price_per_point, 6)} GEN</b> (${priceNote()}). Each entry gets its points × that price, plus its bond back.</li>
    <li>An entry earns from a match only if its fit score is at least <b>${R.min_fit}</b> in both readings. What nobody earns returns to the host, together with the bonds of struck entries.</li>
    <li>Ranking: more points, then more decisive wins, then the earlier entry. Struck entries have no rank.</li>
    <li>Entries ${R.state === 0 ? "close" : "closed"} ${fmtDate(R.entry_deadline)}. The host may start early once ${R.min_entries} entries are in. Playing time after the start: ${Math.round(R.play_window / 60)} minutes.</li></ul></div>`;
}
function entriesTable() {
  if (!R.entries.length) return `<div class="card" style="text-align:center"><p class="muted" style="margin:0">No entries yet. ${R.state === 0 ? "The first pitch sets the tone." : ""}</p></div>`;
  const rows = [...R.entries].sort((a, b) => (R.state >= 1 ? (a.rank || 99) - (b.rank || 99) || a.index - b.index : a.index - b.index));
  return `<div class="tbl"><table><thead><tr><th>${R.state >= 1 ? "Rank" : "#"}</th><th>Entry</th><th>Points</th><th>Wins</th><th>${R.state === 2 ? "Payout" : "Bond"}</th>${isHost() && R.state === 0 ? "<th></th>" : ""}</tr></thead><tbody>${rows.map((e) => `<tr>
    <td><span class="rank ${e.rank && e.rank < 4 ? "r" + e.rank : ""}">${R.state >= 1 ? e.rank || "–" : e.index + 1}</span></td>
    <td><div class="entry-name">${esc(e.name)} ${sameAddr(e.who, wallet.account) ? '<span class="pill good">you</span>' : ""}${e.flagged ? ' <span class="pill bad" title="Tried to steer the judge. Bond forfeited.">strike</span>' : ""}</div><div class="tiny muted mono">${short(e.who, 5)}</div><div class="entry-pitch">${esc(e.pitch)}</div><div class="tiny" style="margin-top:4px">${evidence(e.url)}</div></td>
    <td><b>${e.points}</b></td><td>${e.wins}</td><td>${R.state === 2 ? `<b>${fmtGen(e.payout)}</b> GEN` : `${fmtGen(e.bond)} GEN`}</td>
    ${isHost() && R.state === 0 ? `<td><button class="btn danger sm" data-remove="${esc(e.who)}">Remove</button></td>` : ""}</tr>`).join("")}</tbody></table></div>`;
}
function matchesGrid() {
  if (!R.matches.length) return `<div class="card"><p style="margin:0" class="muted">The schedule is fixed when the round starts: every pair meets exactly once, in a set order.${R.entry_count >= 3 ? " With the current entries that is " + (R.entry_count * (R.entry_count - 1)) / 2 + " matches." : ""}</p></div>`;
  return `<div class="bracket"><div class="bracket-in">${R.matches.map((m) => {
    const played = m.state === 1, a = R.entries[m.a], b = R.entries[m.b];
    const res = !played ? (m.index === R.next_match && R.state === 1 ? "Up next" : "Waiting") : OUT[m.outcome] + (m.by === 2 ? " · voided" : m.by === 3 ? " · timed out" : "");
    return `<button class="match ${m.index === R.next_match && R.state === 1 ? "next" : ""}" data-match="${m.index}"><div class="vs"><span class="${played && m.outcome === 0 ? "win" : ""}">${esc(a?.name)}</span><em>VS</em><span class="${played && m.outcome === 1 ? "win" : ""}" style="text-align:right">${esc(b?.name)}</span></div><div class="res"><span>#${m.index + 1}</span><span>${res}</span></div></button>`;
  }).join("")}</div></div>`;
}

// ---- actions panel -----------------------------------------------------------------------------------------------------
function actions() {
  const blocks = [];
  const me = wallet.account, mine = myEntry();
  if (R.state === 0) {
    const closed = nowSec() >= R.entry_deadline, full = R.entry_count >= R.max_entries, enough = R.entry_count >= R.min_entries;
    if (!me) blocks.push(`<div class="card panel"><h3>Take part</h3><p class="muted">Connect a wallet to enter, host or run this round.</p><button class="btn primary" data-act="connect">Connect wallet</button></div>`);
    else if (isHost()) blocks.push(hostPanel(closed, full, enough));
    else if (mine) blocks.push(`<div class="card panel"><h3>Your entry</h3><p class="muted">You are in as <b>${esc(mine.name)}</b>, with ${fmtGen(mine.bond)} GEN as the bond. You can leave before the round starts and get the bond back.</p><button class="btn ghost" data-act="withdraw">Withdraw my entry</button></div>${anyonePanel(closed, full, enough)}`);
    else if (closed) blocks.push(`<div class="card panel"><h3>Entries are closed</h3><p class="muted">${enough ? "Anyone can start the round now." : "Not enough entries came in. Anyone can cancel the round and everyone is refunded."}</p></div>${anyonePanel(closed, full, enough)}`);
    else if (full) blocks.push(`<div class="card panel"><h3>The round is full</h3><p class="muted">All ${R.max_entries} places are taken.</p></div>${anyonePanel(closed, full, enough)}`);
    else blocks.push(entryForm());
  } else if (R.state === 1) blocks.push(playPanel());
  else if (R.state === 2) blocks.push(`<div class="card panel"><h3>Finished</h3><p class="muted">Winnings are credited to each address. Claiming sends them to the wallet.</p>${credit > 0n ? `<div class="ok-box" style="margin-bottom:12px"><b>You can claim ${fmtGen(credit)} GEN.</b></div><button class="btn orange" data-act="claim">Claim ${fmtGen(credit)} GEN</button>` : `<a class="btn ghost" href="./account.html">Go to my account</a>`}<p class="tiny muted" style="margin-top:12px">Paid out ${fmtGen(R.paid_out)} GEN · returned to the host ${fmtGen(R.returned)} GEN</p></div>`);
  else blocks.push(`<div class="card panel"><h3>Cancelled</h3><p class="muted">The prize went back to the host and the bonds to the entrants. Claim from your account page.</p><a class="btn ghost" href="./account.html">My account</a></div>`);
  blocks.push(`<div class="card panel"><h3>Verify it yourself</h3><p class="tiny muted">Every number here is read from the contract.</p><div class="row"><a class="btn ghost sm" target="_blank" rel="noopener" href="${CONFIG.addressUrl(CONFIG.contract)}">Contract ↗</a><a class="btn ghost sm" href="./docs.html#lifecycle">How rounds work</a></div></div>`);
  return blocks.join("");
}
function anyonePanel(closed, full, enough) {
  const can = enough && (closed || full);
  const cancelOk = closed && !enough;
  if (!can && !cancelOk) return "";
  return `<div class="card panel"><h3>${can ? "Start the round" : "Cancel the round"}</h3><p class="muted">${can ? "The entry time is over. Anyone may close the entries and fix the schedule." : "The entry time is over without enough entries. Anyone may cancel and refund everyone."}</p><button class="btn primary" data-act="${can ? "start" : "cancel"}">${can ? "Start the round" : "Cancel and refund"}</button></div>`;
}
function hostPanel(closed, full, enough) {
  return `<div class="card panel"><h3>You host this round</h3><div class="stack">
    <div class="field" style="margin:0"><label for="top-amt">Add to the prize (GEN)</label><div class="row" style="flex-wrap:nowrap"><input id="top-amt" type="text" inputmode="decimal" value="${esc(topAmt)}"><button class="btn ghost" data-act="topup">Top up</button></div><span class="hint">Only while the round is open.</span></div>
    <button class="btn primary" data-act="start" ${enough ? "" : "disabled"}>${enough ? "Start the round now" : `Start needs ${R.min_entries} entries`}</button>
    <button class="btn danger" data-act="cancel">Cancel round and refund</button>
    <p class="tiny muted" style="margin:0">Remove an entry from the Entries tab. Its bond is refunded.</p></div></div>`;
}
function entryForm() {
  return `<div class="card panel"><h3>Enter this round</h3><p class="muted tiny">Bond: exactly <b>${fmtGen(R.entry_bond)} GEN</b>, refunded after the round unless the judge catches an attempt to steer it.</p>
  <div class="field" id="f-name"><label for="e-name">Entry name <span class="count" id="n-count"></span></label><input id="e-name" type="text" maxlength="80" autocomplete="off" value="${esc(draft.name)}" placeholder="2 to 40 characters"><p class="err" hidden></p></div>
  <div class="field" id="f-pitch"><label for="e-pitch">Pitch <span class="count" id="p-count"></span></label><textarea id="e-pitch" maxlength="900" placeholder="40 to 600 characters. Say what you offer and why it fits the mission.">${esc(draft.pitch)}</textarea><p class="err" hidden></p></div>
  <div class="field" id="f-url"><label for="e-url">Evidence link ${R.need_evidence ? "" : '<span class="muted" style="font-weight:500">(optional)</span>'}</label><input id="e-url" type="url" autocomplete="off" value="${esc(draft.url)}" placeholder="https://…"><span class="hint">One public page the judge can read. No logins, no local or private addresses.</span><p class="err" hidden></p></div>
  <ul class="checklist" id="e-check"></ul>
  <button class="btn primary" style="width:100%;margin-top:14px" id="e-send">Enter with ${fmtGen(R.entry_bond)} GEN</button>
  <p class="tiny muted" style="margin:10px 0 0">Checked here first, because a refused entry would keep your bond stuck in the contract.</p></div>`;
}
function playPanel() {
  const total = R.match_count, nextI = R.next_match, all = nextI >= total, over = nowSec() >= R.play_deadline;
  const m = R.matches[nextI];
  const cd = m && m.tries > 0 ? m.last_try + 120 : 0;
  if (all || over) return `<div class="card panel"><h3>${all ? "Every match is played" : "Playing time is over"}</h3><p class="muted">${all ? "Anyone can finish the round and pay everyone out." : "Matches nobody ran earn nothing. Anyone can finish the round now."}</p><button class="btn orange" data-act="finalize">Finish the round and pay out</button></div>`;
  return `<div class="card panel"><h3>Next match</h3><div class="match next" style="cursor:default"><div class="vs"><span>${nm(m.a)}</span><em>VS</em><span style="text-align:right">${nm(m.b)}</span></div><div class="res"><span>Match ${nextI + 1} of ${total}</span><span>${m.tries ? `${m.tries} earlier ${m.tries > 1 ? "tries" : "try"}` : "first try"}</span></div></div>
  <p class="muted tiny" style="margin-top:12px">Anyone can run it. The judge reads both entries twice, once in each order, and the validators must agree.</p>
  <button class="btn primary" style="width:100%" data-act="play" id="play-btn" ${cd > nowSec() ? "disabled" : ""}>${cd > nowSec() ? `Wait <span data-cd="${cd}"></span>` : "Run the next match"}</button>
  <div class="info-box tiny" style="margin-top:12px">If the validators do not agree (UNDETERMINED), nothing changes and you can try again at once. Only when an evidence page could not be read is there a two minute pause.</div></div>`;
}

// ---- events ------------------------------------------------------------------------------------------------------------
function bind() {
  $("#r-refresh").onclick = async (e) => { e.target.disabled = true; try { await reload(); toast("Refreshed from the contract.", "ok", 1800); } catch (err) { toast(esc(err.message), "warn"); } };
  $("#r-copy").onclick = () => copy(location.href, "Link copied");
  $$("[data-tab]").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; $$("[data-tab]").forEach((x) => x.setAttribute("aria-selected", x === b)); $("#tab-body").innerHTML = tabBody(); bindTab(); tilt(view); }));
  bindTab();
  $("#side").addEventListener("click", onAct);
  if ($("#e-name")) bindForm();
}
function bindTab() {
  $$("[data-match]").forEach((b) => (b.onclick = () => showMatch(Number(b.dataset.match))));
  $$("[data-remove]").forEach((b) => (b.onclick = () => removeEntry(b.dataset.remove)));
}
async function onAct(e) {
  const a = e.target.closest("[data-act]")?.dataset.act; if (!a) return;
  if (a === "connect") return openConnect();
  if (!wallet.account) return openConnect();
  if (a === "withdraw") return act({ title: "Withdraw your entry", fn: "withdraw_entry", args: [id], success: "Your entry is withdrawn and the bond is credited to you." });
  if (a === "start") return act({ title: "Start the round", fn: "start_round", args: [id], success: "The round is playing. The schedule is fixed." });
  if (a === "cancel") { if (!(await confirmBox("Cancel this round?", "The prize goes back to the host and every bond to its owner. This cannot be undone.", "Cancel round"))) return; return act({ title: "Cancel the round", fn: "cancel_round", args: [id], success: "The round is cancelled. Claim your refund from your account page." }); }
  if (a === "play") return act({ title: `Match ${R.next_match + 1} of ${R.match_count}`, fn: "play_next", args: [id], judging: true, success: "The match was judged." });
  if (a === "finalize") return act({ title: "Finish the round", fn: "finalize_round", args: [id], success: "The round is done and everyone is credited." });
  if (a === "claim") return act({ title: "Claim your winnings", fn: "claim", args: [], success: "Your winnings were sent to your wallet." });
  if (a === "topup") {
    const v = parseGen($("#top-amt").value); topAmt = $("#top-amt").value;
    if (v == null || v <= 0n) return toast("Enter an amount in GEN, for example 0.1.", "warn");
    if (!(await confirmBox("Add to the prize", `You will attach <b>${fmtGen(v)} GEN</b> to the prize pool.`, "Add GEN"))) return;
    return act({ title: "Add to the prize", fn: "top_up", args: [id], value: v, success: "The prize has grown." });
  }
}
async function act(o) {
  busy = true;
  const r = await runTx(o);
  busy = false;
  try { await reload(true); if (R.state === 2 && wallet.account) credit = await api.creditOf(wallet.account, true); render(); } catch (err) { toast("Could not refresh: " + esc(err.message), "warn"); }
  return r;
}
function confirmBox(title, html, ok) {
  return new Promise((res) => { const m = modal(`<h3>${esc(title)}</h3><p>${html}</p><div class="row"><button class="btn primary" id="cb-ok">${esc(ok)}</button><button class="btn ghost" id="cb-no">Not now</button></div>`, { onClose: () => res(false) }); $("#cb-ok", m.body).onclick = () => { res(true); m.el.remove(); }; $("#cb-no", m.body).onclick = () => m.close(); });
}
async function removeEntry(who) {
  const e = R.entries.find((x) => sameAddr(x.who, who));
  const reason = await new Promise((res) => {
    const m = modal(`<h3>Remove ${esc(e?.name)}?</h3><p class="muted">The bond is refunded. Give a short reason (3 to 160 characters).</p><div class="field"><input id="rm-reason" type="text" maxlength="200" placeholder="Reason"><p class="err" id="rm-err" hidden></p></div><div class="row"><button class="btn danger" id="rm-ok">Remove entry</button><button class="btn ghost" id="rm-no">Cancel</button></div>`, { onClose: () => res(null) });
    $("#rm-no", m.body).onclick = () => m.close();
    $("#rm-ok", m.body).onclick = () => { const c = checkReason($("#rm-reason", m.body).value); if (!c.ok) { const p = $("#rm-err", m.body); p.hidden = false; p.textContent = c.message; return; } res(c.value); m.el.remove(); };
  });
  if (reason) act({ title: "Remove entry", fn: "remove_entry", args: [id, who, reason], success: "The entry was removed and its bond refunded." });
}
function showMatch(i) {
  const m = R.matches[i], a = R.entries[m.a], b = R.entries[m.b], rv = m.review;
  let body;
  if (m.state !== 1) body = `<p class="muted">This match has not been played yet.${i === R.next_match ? " It is next in the schedule." : ""}</p>`;
  else if (!rv || rv.timeout) body = `<div class="warn-box">${rv?.timeout ? "Nobody ran this match before the playing time ended, so neither entry earned anything." : "No review was stored for this match."}</div>`;
  else if (rv.void) body = `<div class="warn-box"><b>Voided.</b> ${esc(rv.reason || "An evidence page stayed unreadable.")} Neither entry earned points.</div>`;
  else {
    const fit = rv.fit || [0, 0], w = rv.win || ["T", "T"], flags = rv.flagged || [0, 0];
    const who = (x) => (x === "A" ? esc(a.name) : x === "B" ? esc(b.name) : "no clear winner");
    body = `<div class="review"><div class="ok-box"><b>${OUT[m.outcome]}</b>${m.outcome === 0 ? ` · ${esc(a.name)}` : m.outcome === 1 ? ` · ${esc(b.name)}` : ""}</div>
    <div class="pair">${[[a, fit[0], flags[0]], [b, fit[1], flags[1]]].map(([e, f, fl]) => `<div class="side-box"><b>${esc(e.name)}</b>${fl ? ' <span class="pill bad">strike</span>' : ""}<div class="fitbar"><i style="width:${f}%"></i></div><span class="tiny muted">Fit ${f} · bar ${R.min_fit} · ${f >= R.min_fit && !fl ? "clears" : "does not clear"}</span></div>`).join("")}</div>
    <div class="side-box"><span class="tiny muted">Reading 1 shows ${esc(a.name)} then ${esc(b.name)}: winner <b>${who(w[0])}</b></span><p style="margin:6px 0 10px">${esc(rv.reason || "")}</p><span class="tiny muted">Reading 2 shows ${esc(b.name)} then ${esc(a.name)}: winner <b>${who(w[1])}</b></span><p style="margin:6px 0 0">${esc(rv.reason2 || "")}</p></div>
    <p class="tiny muted" style="margin:0">Judged ${fmtDate(m.played_at)} · ${m.tries} ${m.tries === 1 ? "try" : "tries"}${(Array.isArray(rv.hash) ? rv.hash.find(Boolean) : rv.hash) ? ` · evidence hash <span class="mono">${esc(String(Array.isArray(rv.hash) ? rv.hash.find(Boolean) : rv.hash).slice(0, 16))}…</span>` : ""}</p></div>`;
  }
  const mm = modal(`<button class="x" aria-label="Close">×</button><h3>Match ${i + 1}: ${esc(a.name)} vs ${esc(b.name)}</h3>${body}`, { wide: true });
  $(".x", mm.body).onclick = mm.close;
}
function bindForm() {
  const f = { name: $("#e-name"), pitch: $("#e-pitch"), url: $("#e-url") }, touched = new Set();
  const run = () => {
    draft = { name: f.name.value, pitch: f.pitch.value, url: f.url.value };
    const { errors } = checkEntry(draft, R, wallet.account);
    $("#n-count").textContent = `${[...clean(draft.name)].length}/40`; $("#p-count").textContent = `${[...clean(draft.pitch)].length}/600`;
    for (const k of ["name", "pitch", "url"]) { const box = $(`#f-${k}`), er = errors.find((x) => x.field === k); box.classList.toggle("bad", !!er && touched.has(k)); const p = $(".err", box); p.hidden = !(er && touched.has(k)); p.textContent = er?.message ?? ""; }
    const gen = errors.filter((e) => e.field === "round");
    $("#e-check").innerHTML = gen.map((e) => `<li class="bad">${esc(e.message)}</li>`).join("") || `<li>The round is open for you</li>`;
    $("#e-send").disabled = errors.length > 0;
    return errors;
  };
  for (const k of Object.keys(f)) { f[k].addEventListener("input", run); f[k].addEventListener("blur", () => { touched.add(k); run(); }); }
  run();
  $("#e-send").onclick = async () => {
    if (!wallet.account) return openConnect();
    ["name", "pitch", "url"].forEach((k) => touched.add(k));
    if (run().length) return;
    const { values } = checkEntry(draft, R, wallet.account);
    const btn = $("#e-send"); btn.disabled = true; btn.textContent = "Checking with the contract…";
    try {
      const [s1, s2] = await Promise.all([api.wouldSteer(values.name), api.wouldSteer(values.pitch)]);
      if (s1 === true || s2 === true) { toast("The contract says the name or pitch tries to steer the judge. Rephrase it and try again.", "warn", 7000); return; }
    } catch { /* the local check already passed; the view is an extra guard */ } finally { btn.disabled = false; btn.textContent = `Enter with ${fmtGen(R.entry_bond)} GEN`; }
    if (!(await confirmBox("Enter this round", `You will attach exactly <b>${fmtGen(R.entry_bond)} GEN</b> as the bond for <b>${esc(values.name)}</b>.`, `Enter with ${fmtGen(R.entry_bond)} GEN`))) return;
    const r = await act({ title: "Enter the round", fn: "enter", args: [id, values.name, values.pitch, values.url], value: BigInt(R.entry_bond), success: "You are in. Good luck." });
    if (r?.ok) draft = { name: "", pitch: "", url: "" };
  };
}

// first load
(async () => {
  if (!Number.isInteger(id) || id < 0) return;
  try { R = await api.round(id); if (R.state === 2 && wallet.account) credit = await api.creditOf(wallet.account).catch(() => 0n); render(); }
  catch (e) { view.innerHTML = errorBox(/No such round/i.test(e.message) ? "That round does not exist." : e.message); $("[data-retry]", view)?.addEventListener("click", () => location.reload()); }
})();
onWallet(async (_w, why) => { if (!R || !["connected", "disconnected", "account", "chain"].includes(why)) return; if (R.state === 2 && wallet.account) credit = await api.creditOf(wallet.account).catch(() => 0n); render(); });
setInterval(() => { $$("[data-cd]").forEach((el) => { const left = Number(el.dataset.cd) - nowSec(); el.textContent = left > 0 ? `${left}s` : "now"; if (left <= 0) { const b = $("#play-btn"); if (b?.disabled) { b.disabled = false; b.textContent = "Run the next match"; } } }); }, 1000);
