// Everything that talks to the Matchplay contract: reads through genlayer-js, writes through the connected wallet.
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CONFIG } from "../config.js";
import { wallet, switchNetwork } from "./wallet.js";
import * as mock from "./mock.js";

export const isDemo = () => { try { return localStorage.getItem("mp.demo") === "1"; } catch { return false; } };
export function setDemo(on) { try { on ? localStorage.setItem("mp.demo", "1") : localStorage.removeItem("mp.demo"); } catch {} }

// ---- request budget: Studionet allows about 500 requests an hour. Count them, wait out a rate limit, never double-send. --
const HITS_KEY = "mp.rpc.hits";
const budgetSubs = new Set();
function hits() {
  try { const cut = Date.now() - 3600_000; return JSON.parse(localStorage.getItem(HITS_KEY) || "[]").filter((t) => t > cut); } catch { return []; }
}
function addHit() {
  const h = hits(); h.push(Date.now());
  try { localStorage.setItem(HITS_KEY, JSON.stringify(h)); } catch {}
  budgetSubs.forEach((f) => f(h.length));
}
export const budget = {
  used: () => hits().length,
  limit: CONFIG.rpcBudgetPerHour,
  on: (f) => { budgetSubs.add(f); return () => budgetSubs.delete(f); },
};
let pausedUntil = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (typeof window !== "undefined" && !window.fetch.__mp) {
  const real = window.fetch.bind(window);
  const wrapped = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    if (url !== CONFIG.rpc || String(init?.method ?? "GET").toUpperCase() !== "POST" || typeof init?.body !== "string") return real(input, init);
    let methods = [];
    try { const b = JSON.parse(init.body); methods = (Array.isArray(b) ? b : [b]).map((x) => String(x.method)); } catch {}
    const sends = methods.some((m) => /^eth_send|^eth_signTransaction|^sim_/.test(m)); // never repeat something that may have run
    if (pausedUntil > Date.now()) await sleep(pausedUntil - Date.now());
    addHit();
    const res = await real(input, init);
    if (sends) return res;
    let body = ""; try { body = await res.clone().text(); } catch {}
    if (res.status === 429 || body.includes("-32029")) {
      const m = /retry_after_seconds"?\s*[:=]\s*(\d+)/.exec(body);
      const wait = Math.min(Number(m?.[1] ?? 20), 90) * 1000 + 500;
      pausedUntil = Date.now() + wait;
      window.dispatchEvent(new CustomEvent("mp:ratelimit", { detail: { seconds: Math.round(wait / 1000) } }));
      await sleep(wait);
      addHit();
      return real(input, init);
    }
    return res;
  };
  wrapped.__mp = true;
  window.fetch = wrapped;
}

// ---- reads -----------------------------------------------------------------------------------------------------------
let reader;
const rd = () => (reader ??= createClient({ chain: studionet }));
const inflight = new Map();

function parse(raw) {
  if (typeof raw === "boolean") return raw;
  const text = String(raw);
  if (/^\s*[\[{]/.test(text)) { try { return JSON.parse(text); } catch { return text; } }
  return text; // plain numbers stay text so a large amount is never rounded
}
const cacheKey = (fn, args) => `mp.c.${fn}.${JSON.stringify(args)}`;
export function invalidate() {
  try { Object.keys(sessionStorage).filter((k) => k.startsWith("mp.c.")).forEach((k) => sessionStorage.removeItem(k)); } catch {}
  inflight.clear();
}

/** Read a view method. Cached for `ttl` ms (also across page loads) and de-duplicated while in flight. */
export async function read(fn, args = [], { ttl = 6000, fresh = false } = {}) {
  const key = cacheKey(fn, args);
  if (!fresh) {
    try { const c = JSON.parse(sessionStorage.getItem(key) || "null"); if (c && Date.now() - c.t < ttl) return c.v; } catch {}
    if (inflight.has(key)) return inflight.get(key);
  }
  const job = (async () => {
    const v = isDemo() ? await mock.read(fn, args) : parse(await rd().readContract({ address: CONFIG.contract, functionName: fn, args }));
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v })); } catch {}
    return v;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}
export async function rpc(method, params = []) {
  const res = await fetch(CONFIG.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }) });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result;
}
export async function balanceOf(addr) {
  if (isDemo()) return mock.balanceOf(addr);
  return BigInt(await rpc("eth_getBalance", [addr, "latest"]));
}

export const api = {
  stats: () => read("stats", [], { ttl: 15000 }),
  solvency: (fresh) => read("solvency", [], { ttl: 10000, fresh }),
  audit: (fresh) => read("audit_books", [], { ttl: 30000, fresh }),
  listRounds: (offset = 0, limit = 12) => read("list_rounds", [offset, limit], { ttl: 10000 }),
  round: (id, fresh = false) => read("get_round", [Number(id)], { ttl: 8000, fresh }),
  match: (rid, i) => read("get_match", [Number(rid), Number(i)], { ttl: 20000 }),
  roundsOf: (who, offset = 0, limit = 20) => read("rounds_of", [who, offset, limit], { ttl: 10000 }),
  creditOf: async (who, fresh = false) => BigInt(await read("credit_of", [who], { ttl: 8000, fresh })),
  schedule: (n) => read("schedule_of", [n], { ttl: 3600_000 }),
  wouldSteer: (text) => read("would_steer", [text], { ttl: 60_000 }),
};

/** Run `fn` now and then every `ms` while the tab is visible; slows down as the hourly budget is used up. */
export function poll(fn, ms) {
  let stop = false, timer;
  const tick = async () => {
    if (stop) return;
    if (!document.hidden) { try { await fn(); } catch (e) { console.warn("refresh failed", e); } }
    const used = budget.used();
    const f = used > 420 ? 6 : used > 330 ? 3 : used > 240 ? 1.5 : 1;
    timer = setTimeout(tick, ms * f);
  };
  tick();
  const vis = () => { if (!document.hidden) { clearTimeout(timer); tick(); } };
  document.addEventListener("visibilitychange", vis);
  return () => { stop = true; clearTimeout(timer); document.removeEventListener("visibilitychange", vis); };
}

// ---- writes ----------------------------------------------------------------------------------------------------------
const FAIL = /ERROR|REVERT|FAIL/i, PASS = /RETURN|SUCCESS/i;
const TERMINAL = new Set(["ACCEPTED", "FINALIZED", "UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"]);
const STAGE = { PENDING: "queued", ACTIVATED: "queued", PROPOSING: "proposing", COMMITTING: "voting", REVEALING: "voting", ACCEPTED: "accepted", FINALIZED: "finalized", UNDETERMINED: "undetermined", READY_TO_FINALIZE: "voting" };

function leaderOf(r) { return r?.consensus_data?.leader_receipt?.[0] ?? r?.data?.leader_receipt?.[0] ?? r?.leader_receipt?.[0]; }
const dump = (v) => { try { return JSON.stringify(v ?? null, (_k, x) => (typeof x === "bigint" ? x.toString() : x)) ?? ""; } catch { return String(v); } };
/** Did the contract call itself succeed? A decided transaction can still be a refused call. */
export function outcome(receipt) {
  const leader = leaderOf(receipt);
  for (const v of [receipt?.txExecutionResultName, receipt?.resultName, leader?.execution_result, leader?.result?.status]) {
    if (typeof v !== "string" || !v) continue;
    if (FAIL.test(v)) return { ok: false, known: true, detail: refusalText(leader ?? receipt) };
    if (PASS.test(v)) return { ok: true, known: true };
  }
  const text = dump(receipt);
  if (/FINISHED_WITH_ERROR|"execution_result"\s*:\s*"ERROR"/.test(text)) return { ok: false, known: true, detail: refusalText(receipt) };
  if (/FINISHED_WITH_RETURN|"execution_result"\s*:\s*"SUCCESS"/.test(text)) return { ok: true, known: true };
  return { ok: false, known: false, detail: "" };
}
/** The contract refuses with a plain sentence; pull it out of the receipt when it is there. */
function refusalText(x) {
  const t = dump(x);
  const m = /(?:UserError|user_error|message|stderr|result)[^A-Za-z]{0,12}([A-Z][^"\\]{12,160}[.!])/.exec(t) || /"(The [^"\\]{8,160}\.|Only [^"\\]{8,160}\.|Attach [^"\\]{8,160}\.|You [^"\\]{8,160}\.|Wait [^"\\]{8,160}\.|Every [^"\\]{8,160}\.|That [^"\\]{8,160}\.|This [^"\\]{8,160}\.|There [^"\\]{8,160}\.|No such [^"\\]{3,60}\.)"/.exec(t);
  return m ? m[1] : "";
}

export class TxError extends Error { constructor(msg, kind) { super(msg); this.kind = kind; } }

/**
 * Send a write call through the connected wallet and wait for the network's decision.
 * onStage(stage, info): wallet -> sent -> queued/proposing/voting -> accepted | undetermined | ...
 */
export async function sendTx({ fn, args = [], value = 0n, onStage = () => {} }) {
  if (isDemo()) return mock.send({ fn, args, value, from: wallet.account, onStage });
  if (wallet.status !== "connected" || !wallet.account) throw new TxError("Connect your wallet first.", "wallet");
  if (wallet.chainId !== CONFIG.chainId) {
    onStage("network");
    const ok = await switchNetwork();
    if (!ok) throw new TxError("Your wallet is still on another network. Switch to GenLayer Studionet and try again.", "network");
  }
  const writer = createClient({ chain: studionet, account: wallet.account, provider: wallet.provider });
  onStage("wallet");
  let hash;
  try {
    hash = await writer.writeContract({ address: CONFIG.contract, functionName: fn, args, ...(value ? { value } : {}) });
  } catch (err) {
    if (err?.code === 4001 || /user rejected|denied|rejected the request/i.test(String(err?.message ?? err))) throw new TxError("You rejected the request in your wallet. Nothing was sent.", "rejected");
    throw new TxError(String(err?.shortMessage ?? err?.message ?? err).slice(0, 300), "send");
  }
  onStage("sent", { hash });
  const reader_ = rd();
  const started = Date.now();
  let delay = 3000, last = "";
  for (;;) {
    let tx = null;
    try { tx = await reader_.getTransaction({ hash }); } catch { /* not visible yet */ }
    const name = tx?.statusName ?? "";
    if (name && name !== last) { last = name; onStage(STAGE[name] ?? "queued", { hash, status: name }); }
    if (TERMINAL.has(name)) break;
    if (Date.now() - started > 20 * 60_000) throw new TxError("The network has not decided yet. The transaction may still go through; check it in the explorer.", "timeout");
    await sleep(delay);
    delay = Math.min(15000, Math.round(delay * 1.4));
  }
  invalidate();
  if (last === "UNDETERMINED") return { hash, status: last, ok: false, undetermined: true, detail: "" };
  if (last === "CANCELED" || last === "LEADER_TIMEOUT" || last === "VALIDATORS_TIMEOUT") return { hash, status: last, ok: false, detail: "" };
  let receipt = null;
  try { receipt = await reader_.waitForTransactionReceipt({ hash, status: "ACCEPTED", retries: 0, interval: 0 }); } catch {}
  const out = outcome(receipt);
  return { hash, status: last, ok: out.ok, known: out.known, detail: out.detail };
}
