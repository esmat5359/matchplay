// Shared page chrome: header with wallet, network banner, footer, toasts, modals, transaction dialog, small 3D helpers.
import "@fontsource-variable/unbounded";
import "@fontsource-variable/figtree";
import "@fontsource-variable/jetbrains-mono";
import "../styles/main.css";
import { CONFIG } from "../config.js";
import { wallet, onWallet, discover, autoReconnect, connect, disconnect, switchNetwork, listProviders, isWrongNetwork } from "./wallet.js";
import { isDemo, setDemo, budget, sendTx, balanceOf, invalidate, TxError } from "./chain.js";
import { registerDemoWallet, resetDemo } from "./mock.js";
import { esc, short, fmtGen, avatar, nowSec, fmtDuration } from "./format.js";

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const NAV = [["rounds.html", "Arena"], ["create.html", "Host a round"], ["ledger.html", "Ledger"], ["docs.html", "Docs"], ["demo.html", "Demo"]];
const CHAINS = { 1: "Ethereum", 10: "Optimism", 56: "BNB Chain", 137: "Polygon", 8453: "Base", 42161: "Arbitrum One", 11155111: "Sepolia", 61999: "GenLayer Studionet" };

export const logoMark = (size = 34) => `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="lg${size}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a3aff"/><stop offset="1" stop-color="#110fff"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#lg${size})"/><path d="M15 47V18l17 15 17-15v29" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="42" r="5.2" fill="#ff7a18" stroke="#fff" stroke-width="2.4"/></svg>`;
export const logo = (size = 34) => `<a class="logo" href="./index.html" aria-label="Matchplay home">${logoMark(size)}<span class="logo-word">match<b>play</b></span></a>`;

/** Loading animations. kind: cube (waiting), swap (the judge reads both orders), ring (small inline). */
export function spinner(kind = "cube", label = "") {
  const inner = {
    cube: `<div class="cube3d"><i class="f f1"><img src="./img/genlayer-symbol-white.svg" alt=""></i><i class="f f2">A</i><i class="f f3">B</i><i class="f f4"><img src="./img/logo-mark.svg" alt=""></i><i class="f f5">1</i><i class="f f6">2</i></div>`,
    swap: `<div class="swap3d"><i class="sw a">A</i><i class="sw b">B</i><span class="sw-eye"></span></div>`,
    ring: `<span class="ring3d"></span>`,
  }[kind];
  return `<div class="spin spin-${kind}" role="status" aria-live="polite">${inner}${label ? `<p class="spin-label">${esc(label)}</p>` : ""}</div>`;
}
export const mochiSpinner = (label = "Loading") => `<div class="spin spin-mochi" role="status"><img src="./img/mochi-head-s.png" alt=""><span class="orbit"></span>${label ? `<p class="spin-label">${esc(label)}</p>` : ""}</div>`;

// ---- toasts & modal ----------------------------------------------------------------------------------------------------
export function toast(msg, kind = "info", ms = 5200) {
  let host = $("#toasts"); if (!host) { host = document.createElement("div"); host.id = "toasts"; host.setAttribute("aria-live", "polite"); document.body.append(host); }
  const t = document.createElement("div"); t.className = `toast ${kind}`; t.innerHTML = `<span>${msg}</span><button aria-label="Dismiss">×</button>`;
  t.querySelector("button").onclick = () => t.remove(); host.append(t); setTimeout(() => t.remove(), ms);
}
export function modal(html, { onClose, wide = false, locked = false } = {}) {
  const el = document.createElement("div"); el.className = "modal"; el.innerHTML = `<div class="modal-card${wide ? " wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { if (el.isConnected) { el.classList.add("out"); setTimeout(() => el.remove(), 160); document.removeEventListener("keydown", key); onClose?.(); } };
  const key = (e) => { if (e.key === "Escape" && !locked) close(); };
  el.addEventListener("mousedown", (e) => { if (e.target === el && !locked) close(); });
  document.addEventListener("keydown", key); document.body.append(el);
  requestAnimationFrame(() => el.classList.add("in"));
  return { el, close, body: $(".modal-card", el) };
}
export async function copy(text, label = "Copied") { try { await navigator.clipboard.writeText(text); toast(label, "ok", 1800); } catch { toast("Could not copy. Select the text and copy it by hand.", "warn"); } }

// ---- wallet UI ---------------------------------------------------------------------------------------------------------
function chainName(id) { return CHAINS[id] ?? `chain ${id}`; }
export function requireWallet() {
  if (wallet.status === "connected") return true;
  openConnect(); return false;
}
export function openConnect() {
  const render = () => {
    const ps = listProviders();
    const list = ps.length
      ? ps.map((p) => `<button class="wallet-opt" data-uuid="${esc(p.info.uuid)}"><img src="${esc(p.info.icon)}" alt="" width="36" height="36"><span><b>${esc(p.info.name)}</b><small>${esc(p.info.rdns || "")}</small></span><i>›</i></button>`).join("")
      : `<div class="empty-note"><b>No wallet found in this browser.</b><p>Install a browser wallet that supports custom networks (MetaMask, Rabby, Coinbase Wallet and others) and reload. Or look around in demo mode, which needs no wallet.</p></div>`;
    m.body.innerHTML = `<button class="x" aria-label="Close">×</button><h3>Connect a wallet</h3><p class="muted">Wallets announce themselves to this page (EIP-6963). Pick the one you want to use.</p><div class="wallet-list">${list}</div>${isDemo() ? "" : `<button class="btn ghost sm demo-link">Try demo mode instead</button>`}<p class="tiny muted">Matchplay never sees your keys. Every action asks your wallet to sign.</p>`;
    $(".x", m.body).onclick = m.close;
    $$(".wallet-opt", m.body).forEach((b) => (b.onclick = async () => {
      b.classList.add("busy");
      try { await connect(b.dataset.uuid); m.close(); toast("Wallet connected.", "ok"); if (isWrongNetwork()) openSwitch(); }
      catch (e) { b.classList.remove("busy"); toast(esc(wallet.error || e.message), "warn"); }
    }));
    $(".demo-link", m.body)?.addEventListener("click", () => { setDemo(true); location.reload(); });
  };
  const m = modal("");
  render();
  const off = onWallet((_w, why) => { if (why === "providers" && m.el.isConnected) render(); });
  const obs = new MutationObserver(() => { if (!m.el.isConnected) { off(); obs.disconnect(); } }); obs.observe(document.body, { childList: true });
}
export function openSwitch() {
  const m = modal(`<button class="x" aria-label="Close">×</button><div class="switch-art">${spinner("cube")}</div><h3>Switch to GenLayer Studionet</h3><p class="muted">Your wallet is on <b>${esc(chainName(wallet.chainId))}</b>. Matchplay runs on <b>GenLayer Studionet</b> (chain ${CONFIG.chainId}, currency GEN). Your wallet will ask you to switch, and to add the network first if it does not know it yet.</p><div class="row"><button class="btn primary" id="do-switch">Switch network</button><button class="btn ghost" id="not-now">Not now</button></div><p class="err" id="sw-err" hidden></p>`);
  $(".x", m.body).onclick = m.close; $("#not-now", m.body).onclick = m.close;
  $("#do-switch", m.body).onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = "Waiting for your wallet…";
    try { if (await switchNetwork()) { m.close(); toast("Connected to GenLayer Studionet.", "ok"); } else throw new Error("The wallet is still on another network."); }
    catch (err) { e.target.disabled = false; e.target.textContent = "Try again"; const p = $("#sw-err", m.body); p.hidden = false; p.textContent = err?.code === 4001 ? "You declined the switch in your wallet." : String(err?.message ?? err); }
  };
}
function renderWallet() {
  const slot = $("#wallet-slot"); if (!slot) return;
  const w = wallet;
  if (w.status === "connecting") { slot.innerHTML = `<button class="btn primary sm" disabled><span class="ring3d tiny"></span> Connecting…</button>`; }
  else if (w.status !== "connected") { slot.innerHTML = `<button class="btn primary sm" id="btn-connect">Connect wallet</button>`; $("#btn-connect").onclick = openConnect; }
  else {
    const wrong = w.chainId !== CONFIG.chainId;
    slot.innerHTML = `<button class="net-pill ${wrong ? "bad" : "good"}" id="net-pill" title="${wrong ? "Switch network" : "Connected to GenLayer Studionet"}"><i></i>${wrong ? "Wrong network" : "Studionet"}</button>
      <div class="acct"><button class="acct-btn" id="acct-btn" aria-haspopup="true">${avatar(w.account, 22)}<span class="mono">${short(w.account)}</span><i>▾</i></button>
      <div class="acct-menu" id="acct-menu" hidden>
        <div class="acct-head">${esc(w.info?.name || "Wallet")}<span class="mono" id="acct-addr">${esc(w.account)}</span><span class="acct-bal" id="acct-bal">Balance: …</span></div>
        <button data-act="copy">Copy address</button>
        <a href="${CONFIG.addressUrl(w.account)}" target="_blank" rel="noopener">View in explorer ↗</a>
        <a href="./account.html">My account &amp; winnings</a>
        ${wrong ? `<button data-act="switch" class="warn">Switch to Studionet</button>` : ""}
        <button data-act="disconnect" class="danger">Disconnect</button>
      </div></div>`;
    $("#net-pill").onclick = () => (wrong ? openSwitch() : null);
    const menu = $("#acct-menu");
    $("#acct-btn").onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; if (!menu.hidden) balanceOf(w.account).then((b) => ($("#acct-bal") && ($("#acct-bal").textContent = `Balance: ${fmtGen(b)} GEN`))).catch(() => ($("#acct-bal").textContent = "Balance: unavailable")); };
    menu.addEventListener("click", async (e) => {
      const a = e.target.closest("[data-act]")?.dataset.act; if (!a) return;
      if (a === "copy") copy(w.account, "Address copied");
      if (a === "switch") openSwitch();
      if (a === "disconnect") { await disconnect(); toast("Wallet disconnected.", "info"); }
      menu.hidden = true;
    });
  }
  const bar = $("#net-banner");
  if (bar) {
    const wrong = w.status === "connected" && w.chainId !== CONFIG.chainId;
    bar.hidden = !wrong;
    if (wrong) bar.innerHTML = `<div class="wrap"><span><b>Wrong network.</b> Your wallet is on ${esc(chainName(w.chainId))}. Matchplay runs on GenLayer Studionet (chain ${CONFIG.chainId}).</span><button class="btn orange sm" id="bar-switch">Switch network</button></div>`, ($("#bar-switch").onclick = openSwitch);
  }
}
document.addEventListener("click", (e) => { const m = $("#acct-menu"); if (m && !m.hidden && !e.target.closest(".acct")) m.hidden = true; });

// ---- transaction dialog ------------------------------------------------------------------------------------------------
const STEPS = [["wallet", "Confirm in your wallet"], ["sent", "Sent to the network"], ["vote", "Validators decide"], ["done", "Result"]];
const stageIdx = { network: 0, wallet: 0, sent: 1, queued: 1, proposing: 2, voting: 2, accepted: 3, finalized: 3 };
/**
 * Run one write call with a progress dialog. Resolves to { ok, ... } and never throws.
 * opts: { title, fn, args, value, note, judging }
 */
export function runTx(opts) {
  return new Promise((resolve) => {
    const m = modal("", { locked: true });
    let hash = "", stage = "wallet", note = "";
    const draw = (final) => {
      const idx = final ? 3 : stageIdx[stage] ?? 0;
      const steps = STEPS.map(([k, label], i) => `<li class="${i < idx || (final && i <= idx) ? "done" : i === idx ? "now" : ""}"><i></i>${label}${k === "sent" && hash ? ` <a class="tiny" target="_blank" rel="noopener" href="${CONFIG.txUrl(hash)}">${short(hash, 5)} ↗</a>` : ""}</li>`).join("");
      m.body.innerHTML = `<h3>${esc(opts.title)}</h3>${final ? final : `<div class="tx-spin">${spinner(opts.judging && idx >= 2 ? "swap" : "cube", opts.judging && idx >= 2 ? "The judge reads both orders…" : "")}</div>`}<ol class="steps">${steps}</ol>${final ? "" : `<p class="tiny muted">${esc(note || opts.note || "Keep this window open. Validators on GenLayer can take a minute or two.")}</p>`}`;
    };
    const finish = (html, result) => {
      draw(html);
      const b = document.createElement("div"); b.className = "row"; b.innerHTML = `<button class="btn primary" id="tx-ok">Close</button>`; m.body.append(b);
      $("#tx-ok", m.body).onclick = () => { m.close(); resolve(result); }; $("#tx-ok", m.body).focus();
    };
    draw();
    sendTx({ fn: opts.fn, args: opts.args, value: opts.value, onStage: (s, info) => { stage = s; if (info?.hash) hash = info.hash; if (s === "network") note = "Waiting for your wallet to switch to GenLayer Studionet."; draw(); } })
      .then((r) => {
        invalidate();
        if (r.ok) return finish(`<div class="res ok"><b>Done.</b> ${esc(opts.success || "The network accepted it.")}</div>`, { ...r, ok: true });
        if (r.undetermined) return finish(`<div class="res warn"><b>The validators did not agree (UNDETERMINED).</b> Nothing changed on the contract, so you can try again right away. This happens when the strict consensus rule is not met.</div>`, r);
        const trapped = opts.value && opts.value > 0n ? `<p class="tiny">This call carried ${fmtGen(opts.value)} GEN. On Studionet, GEN attached to a refused payable call stays in the contract's balance outside its books. That is why Matchplay checks everything in your browser first.</p>` : "";
        return finish(`<div class="res bad"><b>The contract refused this call.</b>${r.detail ? `<p>${esc(r.detail)}</p>` : `<p>${r.known === false ? "The result could not be read from the receipt. Check the transaction in the explorer." : "No reason was given."}</p>`}${trapped}</div>`, r);
      })
      .catch((e) => {
        const kind = e instanceof TxError ? e.kind : "error";
        finish(`<div class="res ${kind === "rejected" ? "warn" : "bad"}"><b>${kind === "rejected" ? "Nothing was sent." : "Something went wrong."}</b><p>${esc(e.message)}</p></div>`, { ok: false, error: e });
      });
  });
}

// ---- small helpers ------------------------------------------------------------------------------------------------------
export function tilt(root = document) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  $$("[data-tilt]", root).forEach((el) => {
    if (el.__t) return; el.__t = 1;
    const max = Number(el.dataset.tilt) || 8;
    el.addEventListener("pointermove", (e) => { const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`; el.style.setProperty("--mx", `${(x + 0.5) * 100}%`); el.style.setProperty("--my", `${(y + 0.5) * 100}%`); });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
}
export function reveal(root = document) {
  const els = $$(".reveal:not(.in)", root); if (!els.length) return;
  if (!("IntersectionObserver" in window)) return els.forEach((e) => e.classList.add("in"));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}
let cdTimer;
export function countdowns(root = document) {
  const tick = () => $$("[data-countdown]").forEach((el) => { const t = Number(el.dataset.countdown), left = t - nowSec(); el.textContent = left > 0 ? `${fmtDuration(left)} left` : "ended"; el.classList.toggle("over", left <= 0); });
  tick(); clearInterval(cdTimer); cdTimer = setInterval(tick, 1000);
}
export function confetti(ms = 2600) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const c = document.createElement("canvas"); c.className = "confetti"; document.body.append(c);
  const g = c.getContext("2d"), W = (c.width = innerWidth), H = (c.height = innerHeight), cols = ["#110fff", "#ff7a18", "#0da85a", "#7b5cff", "#ffc23d"];
  const ps = Array.from({ length: 140 }, () => ({ x: W / 2 + (Math.random() - 0.5) * 200, y: H * 0.35, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4, s: 5 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[(Math.random() * cols.length) | 0] }));
  const t0 = performance.now();
  (function f(t) { g.clearRect(0, 0, W, H); ps.forEach((p) => { p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); g.restore(); }); if (t - t0 < ms) requestAnimationFrame(f); else c.remove(); })(t0);
}
export const stateBadge = (s) => ["<span class='badge open'>Open</span>", "<span class='badge play'>Playing</span>", "<span class='badge done'>Done</span>", "<span class='badge off'>Cancelled</span>"][s] ?? "";

// ---- boot --------------------------------------------------------------------------------------------------------------
export function boot(page) {
  document.body.dataset.page = page;
  const demo = isDemo();
  if (new URLSearchParams(location.search).get("demo") === "1") { setDemo(true); const u = new URL(location.href); u.searchParams.delete("demo"); location.replace(u); return; }
  const links = NAV.map(([h, t]) => `<a href="./${h}"${h.startsWith(page) ? ' aria-current="page"' : ""}>${t}</a>`).join("");
  document.body.insertAdjacentHTML("afterbegin", `${demo ? `<div class="demo-bar"><div class="wrap"><span><b>Demo mode</b> · simulated network and wallet, no real GEN, nothing is sent to Studionet.</span><span><button class="link" id="demo-reset">Reset demo data</button><button class="link" id="demo-exit">Exit demo</button></span></div></div>` : ""}
    <header class="site-head"><div class="wrap head-in">${logo()}<nav class="nav" id="nav">${links}</nav><div class="head-end"><div id="wallet-slot"></div><button class="burger" id="burger" aria-label="Menu" aria-expanded="false"><i></i><i></i><i></i></button></div></div></header><div id="net-banner" class="net-banner" hidden></div>`);
  const main = $("main") ?? document.body; main.id ||= "main";
  document.body.insertAdjacentHTML("beforeend", `<footer class="site-foot"><div class="wrap foot-grid">
      <div><div class="foot-logo">${logo(38)}</div><p class="muted">Head-to-head rounds judged by an Intelligent Contract on GenLayer. Every pair meets once, every match is read twice.</p><a class="built" href="${CONFIG.genlayer}" target="_blank" rel="noopener"><span>Built on</span><img src="./img/genlayer-logo-black.svg" alt="GenLayer" height="20"></a></div>
      <div><h4>App</h4><a href="./rounds.html">Arena</a><a href="./create.html">Host a round</a><a href="./account.html">My account</a><a href="./ledger.html">Ledger</a></div>
      <div><h4>Learn</h4><a href="./docs.html">Documentation</a><a href="./docs.html#api">Contract API</a><a href="./docs.html#quirks">Studionet quirks</a><a href="./demo.html">Video demo</a></div>
      <div><h4>Project</h4><a href="${CONFIG.github}" target="_blank" rel="noopener">GitHub</a><a href="${CONFIG.x}" target="_blank" rel="noopener">X @amirhp771</a><a href="${CONFIG.studio}" target="_blank" rel="noopener">GenLayer Studio</a><a href="${CONFIG.explorer}" target="_blank" rel="noopener">Explorer</a></div>
    </div><div class="wrap foot-end"><button class="addr-chip" id="foot-addr" title="Copy contract address"><span>Contract</span><code>${CONFIG.contract}</code></button><span class="budget" id="rpc-budget" title="Studionet allows about ${CONFIG.rpcBudgetPerHour} requests per hour. Pages refresh slowly to stay under it.">RPC <b>0</b>/${CONFIG.rpcBudgetPerHour} this hour</span></div></footer>`);
  $("#foot-addr").onclick = () => copy(CONFIG.contract, "Contract address copied");
  const showB = (n) => { const el = $("#rpc-budget b"); if (el) { el.textContent = n; el.parentElement.classList.toggle("hot", n > 330); } };
  showB(demo ? 0 : budget.used()); budget.on(showB);
  window.addEventListener("mp:ratelimit", (e) => toast(`Studionet is rate limiting requests. Pausing for ${e.detail.seconds}s, then retrying.`, "warn", 6000));
  $("#burger").onclick = (e) => { const o = $("#nav").classList.toggle("open"); e.currentTarget.setAttribute("aria-expanded", o); };
  if (demo) { $("#demo-exit").onclick = () => { setDemo(false); location.reload(); }; $("#demo-reset").onclick = () => { resetDemo(); location.reload(); }; registerDemoWallet(); }
  onWallet(renderWallet); renderWallet();
  discover(); autoReconnect();
  const hd = $(".site-head"); addEventListener("scroll", () => hd.classList.toggle("stuck", scrollY > 8), { passive: true });
  tilt(); reveal(); countdowns();
}
