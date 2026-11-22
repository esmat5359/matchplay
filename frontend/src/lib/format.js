const WEI = 10n ** 18n;

/** wei (bigint|string|number) -> "1.2345" (trimmed). */
export function fmtGen(wei, dp = 4) {
  let v;
  try { v = BigInt(wei ?? 0); } catch { return "0"; }
  const neg = v < 0n; if (neg) v = -v;
  const whole = v / WEI;
  let frac = (v % WEI).toString().padStart(18, "0");
  const full = frac.replace(/0+$/, "");
  frac = frac.slice(0, dp).replace(/0+$/, "");
  if (!frac && full && whole === 0n) frac = "0".repeat(Math.max(0, dp - 1)) + "1"; // tiny amount: show "<"
  const s = whole.toLocaleString("en-US") + (frac ? "." + frac : "");
  return (neg ? "-" : "") + s;
}
/** "0.002" -> 2000000000000000n, or null if it is not a plain decimal with at most 18 places. */
export function parseGen(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const [w, f = ""] = t.split(".");
  if (f.length > 18) return null;
  return BigInt(w || "0") * WEI + BigInt((f + "0".repeat(18)).slice(0, 18) || "0");
}
export const short = (a, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : "");
export const sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const nowSec = () => Math.floor(Date.now() / 1000);
export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
export const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pairs = (n) => (n * (n - 1)) / 2;
/** Deterministic gradient avatar from an address. */
export function avatar(addr, size = 28) {
  const h = parseInt((addr || "0x0").slice(2, 8), 16) || 0;
  const a = h % 360, b = (h * 7) % 360;
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:conic-gradient(from ${a}deg,hsl(${a} 80% 55%),hsl(${b} 85% 60%),hsl(${(a + 120) % 360} 80% 55%),hsl(${a} 80% 55%))"></span>`;
}
