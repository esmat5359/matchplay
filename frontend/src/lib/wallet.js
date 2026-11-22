// Wallet discovery and connection through EIP-6963 (multi-injected provider discovery) and EIP-1193.
// No window.ethereum guessing: every installed wallet announces itself, the person picks one, and everything after that
// (account, chain, signing) goes through that provider only.
import { CONFIG } from "../config.js";

const LS_LAST = "mp.wallet.last"; // rdns of the wallet used last time
const LS_OFF = "mp.wallet.off"; // "1" once the person pressed Disconnect: do not reconnect silently
const providers = new Map(); // uuid -> { info, provider }
const subs = new Set();
let current = null; // { info, provider, handlers }

export const wallet = { status: "disconnected", account: null, chainId: null, info: null, provider: null, error: null };

const emit = (why) => subs.forEach((f) => { try { f(wallet, why); } catch (e) { console.error(e); } });
export const onWallet = (f) => { subs.add(f); return () => subs.delete(f); };
export const listProviders = () => [...providers.values()];
export const isWrongNetwork = () => wallet.status === "connected" && wallet.chainId !== CONFIG.chainId;

const LEGACY_ICON = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#110fff"/><path d="M8 12h16v10H8z" fill="none" stroke="#fff" stroke-width="2"/><circle cx="21" cy="17" r="1.6" fill="#fff"/></svg>');

/** Ask every wallet to announce itself. Safe to call more than once. */
export function discover() {
  window.addEventListener("eip6963:announceProvider", (e) => {
    const d = e.detail;
    if (!d?.info?.uuid || !d.provider) return;
    providers.set(d.info.uuid, d);
    emit("providers");
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  // Older wallets that never announce: offer window.ethereum once the announcement window has passed.
  setTimeout(() => {
    if (!providers.size && window.ethereum) {
      providers.set("legacy", { info: { uuid: "legacy", name: "Browser wallet", icon: LEGACY_ICON, rdns: "legacy.injected" }, provider: window.ethereum });
      emit("providers");
    }
  }, 500);
}

const hexToInt = (h) => (typeof h === "string" ? parseInt(h, 16) : Number(h));

function attach(d) {
  const p = d.provider;
  const handlers = {
    accountsChanged: (accs) => {
      if (!accs || !accs.length) return drop("accounts-empty");
      wallet.account = accs[0];
      emit("account");
    },
    chainChanged: (id) => { wallet.chainId = hexToInt(id); emit("chain"); },
    disconnect: () => drop("provider-disconnect"),
  };
  for (const [k, f] of Object.entries(handlers)) p.on?.(k, f);
  current = { ...d, handlers };
}
function detach() {
  if (!current) return;
  for (const [k, f] of Object.entries(current.handlers)) (current.provider.removeListener ?? current.provider.off)?.call(current.provider, k, f);
  current = null;
}
function drop(why) {
  detach();
  Object.assign(wallet, { status: "disconnected", account: null, chainId: null, info: null, provider: null, error: null });
  emit(why);
}

function adopt(d, account, chainId) {
  detach();
  attach(d);
  Object.assign(wallet, { status: "connected", account, chainId, info: d.info, provider: d.provider, error: null });
  try { localStorage.setItem(LS_LAST, d.info.rdns || d.info.uuid); localStorage.removeItem(LS_OFF); } catch {}
  emit("connected");
}

/** Open the wallet's own account prompt. */
export async function connect(uuid) {
  const d = providers.get(uuid);
  if (!d) throw new Error("That wallet is not available any more. Reload the page and try again.");
  wallet.status = "connecting"; wallet.error = null; emit("connecting");
  try {
    const accs = await d.provider.request({ method: "eth_requestAccounts" });
    if (!accs?.length) throw new Error("The wallet returned no account.");
    const chainId = hexToInt(await d.provider.request({ method: "eth_chainId" }));
    adopt(d, accs[0], chainId);
    return accs[0];
  } catch (err) {
    wallet.status = "disconnected";
    wallet.error = err?.code === 4001 ? "You closed the wallet prompt without connecting." : String(err?.message ?? err);
    emit("error");
    throw err;
  }
}

/**
 * Disconnect. The EIP-1193 standard has no disconnect call, so this does what is possible: ask the wallet to revoke this
 * site's account permission (wallet_revokePermissions, supported by MetaMask and others), forget the session here and
 * remember the choice so the page does not reconnect silently next time.
 */
export async function disconnect() {
  const p = current?.provider;
  try { await p?.request?.({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); } catch { /* not supported: local disconnect only */ }
  try { localStorage.setItem(LS_OFF, "1"); } catch {}
  drop("disconnected");
}

/** Reconnect without a prompt if the person connected before and has not pressed Disconnect. */
export async function autoReconnect() {
  let last, off;
  try { last = localStorage.getItem(LS_LAST); off = localStorage.getItem(LS_OFF); } catch {}
  if (!last || off === "1") return;
  const deadline = Date.now() + 1500;
  let d;
  while (Date.now() < deadline) {
    d = listProviders().find((x) => (x.info.rdns || x.info.uuid) === last);
    if (d) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!d) return;
  try {
    const accs = await d.provider.request({ method: "eth_accounts" }); // no prompt
    if (accs?.length) adopt(d, accs[0], hexToInt(await d.provider.request({ method: "eth_chainId" })));
  } catch { /* stay disconnected */ }
}

/** Ask the wallet to move to Studionet (adds the network first when the wallet does not know it). */
export async function switchNetwork() {
  const p = wallet.provider;
  if (!p) throw new Error("Connect your wallet first.");
  const params = {
    chainId: CONFIG.chainIdHex,
    chainName: CONFIG.chainName,
    nativeCurrency: CONFIG.currency,
    rpcUrls: [CONFIG.rpc],
    blockExplorerUrls: [CONFIG.explorer],
  };
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CONFIG.chainIdHex }] });
  } catch (err) {
    const unknown = err?.code === 4902 || err?.code === -32603 || /unrecognized|not been added|unknown chain|add.*chain/i.test(String(err?.message ?? ""));
    if (!unknown) throw err;
    await p.request({ method: "wallet_addEthereumChain", params: [params] });
  }
  wallet.chainId = hexToInt(await p.request({ method: "eth_chainId" }));
  if (wallet.chainId !== CONFIG.chainId) await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CONFIG.chainIdHex }] });
  wallet.chainId = hexToInt(await p.request({ method: "eth_chainId" }));
  emit("chain");
  return wallet.chainId === CONFIG.chainId;
}
