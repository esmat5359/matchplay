import { boot, $, runTx, toast, tilt, reveal, countdowns, openConnect, openSwitch, mochiSpinner, copy } from "../lib/ui.js";
import { api, balanceOf } from "../lib/chain.js";
import { wallet, onWallet, isWrongNetwork } from "../lib/wallet.js";
import { CONFIG } from "../config.js";
import { esc, fmtGen, avatar } from "../lib/format.js";
import { roundCard, errorBox, emptyBox } from "../lib/render.js";

boot("account");
const box = $("#acct");
let token = 0;
async function draw() {
  const t = ++token;
  if (wallet.status !== "connected") {
    box.innerHTML = `<div class="card" style="text-align:center;padding:50px 20px;max-width:560px;margin:auto"><img src="./img/mochi-head.webp" width="110" alt="" class="mochi-float"><h2 style="font-size:1.4rem;margin-top:10px">Connect your wallet</h2><p class="muted">Your claimable GEN and your rounds are tied to your address.</p><button class="btn primary lg" id="c1">Connect wallet</button></div>`;
    $("#c1").onclick = openConnect; return;
  }
  box.innerHTML = `<div style="min-height:40vh;display:grid;place-items:center">${mochiSpinner("Reading your account…")}</div>`;
  try {
    const [credit, bal, rows] = await Promise.all([api.creditOf(wallet.account, true), balanceOf(wallet.account).catch(() => null), api.roundsOf(wallet.account, 0, 50)]);
    if (t !== token) return;
    const hosted = rows.filter((r) => r.host.toLowerCase() === wallet.account.toLowerCase()), entered = rows.filter((r) => r.host.toLowerCase() !== wallet.account.toLowerCase());
    box.innerHTML = `<div class="grid g3" style="grid-template-columns:1.2fr 1fr 1fr;margin-bottom:34px">
      <div class="card" data-tilt="4" style="display:flex;gap:16px;align-items:center">${avatar(wallet.account, 56)}<div><small class="muted" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">${esc(wallet.info?.name || "Wallet")}</small><p class="mono" style="word-break:break-all;margin:2px 0 6px;font-size:.8rem">${esc(wallet.account)}</p><button class="btn ghost sm" id="cp">Copy</button> <a class="btn ghost sm" target="_blank" rel="noopener" href="${CONFIG.addressUrl(wallet.account)}">Explorer ↗</a></div></div>
      <div class="card" data-tilt="4"><small class="muted" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">Wallet balance</small><div class="big" style="font:600 1.8rem var(--f-head);letter-spacing:-.03em;margin:6px 0">${bal == null ? "–" : fmtGen(bal)} <span style="font-size:1rem">GEN</span></div><span class="tiny muted">on GenLayer Studionet</span></div>
      <div class="card" data-tilt="4" style="background:linear-gradient(160deg,#fff,${credit > 0n ? "#fff0e2" : "#f5f6fc"});border-color:${credit > 0n ? "#ffc58f" : "var(--line)"}"><small class="muted" style="font-weight:700;letter-spacing:.08em;text-transform:uppercase">Claimable</small><div style="font:600 1.8rem var(--f-head);letter-spacing:-.03em;margin:6px 0">${fmtGen(credit)} <span style="font-size:1rem">GEN</span></div><button class="btn orange" id="claim" ${credit > 0n ? "" : "disabled"}>${credit > 0n ? "Claim now" : "Nothing to claim"}</button></div></div>
    ${isWrongNetwork() ? `<div class="warn-box" style="margin-bottom:24px"><b>Your wallet is on another network.</b> Switch to GenLayer Studionet before claiming. <button class="btn orange sm" id="sw" style="margin-left:8px">Switch network</button></div>` : ""}
    <div class="info-box tiny" style="margin-bottom:34px">Credits are bookkeeping until you claim. After a claim the contract's native balance catches up once the network finalises the transfer, so the ledger page can show a short lag.</div>
    <h2 style="font-size:1.4rem">Rounds you host (${hosted.length})</h2><div class="rounds" style="margin-bottom:40px">${hosted.map(roundCard).join("") || emptyBox("No hosted rounds", "Open one and the prize you attach is returned to you for whatever nobody earns.", `<a class="btn primary" href="./create.html">Host a round</a>`)}</div>
    <h2 style="font-size:1.4rem">Rounds you entered (${entered.length})</h2><div class="rounds">${entered.map(roundCard).join("") || emptyBox("No entries yet", "Pick an open round in the arena.", `<a class="btn primary" href="./rounds.html">Open the arena</a>`)}</div>`;
    $("#cp").onclick = () => copy(wallet.account, "Address copied");
    $("#sw")?.addEventListener("click", openSwitch);
    $("#claim").onclick = async () => { const r = await runTx({ title: "Claim your winnings", fn: "claim", args: [], success: `${fmtGen(credit)} GEN was sent to your wallet.` }); draw(); };
    tilt(box); reveal(box); countdowns(box);
  } catch (e) { box.innerHTML = errorBox(e.message); $("[data-retry]", box)?.addEventListener("click", draw); }
}
onWallet((_w, why) => { if (["connected", "disconnected", "account", "chain"].includes(why)) draw(); });
draw();
