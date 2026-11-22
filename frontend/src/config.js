// One place for everything that points outside the app.
export const CONFIG = {
  // The Matchplay contract on GenLayer Studionet. Override with VITE_MATCHPLAY_ADDRESS at build time.
  contract: import.meta.env.VITE_MATCHPLAY_ADDRESS || "0xdd842644E5fEaba5c4FDB28d97236b5B58C5C69c",
  chainId: 61999, // GenLayer Studionet (genlayer-js: studionet.id)
  chainIdHex: "0xf22f",
  chainName: "GenLayer Studio Network",
  rpc: "https://studio.genlayer.com/api",
  explorer: "https://genlayer-explorer.vercel.app",
  studio: "https://studio.genlayer.com",
  currency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  rpcBudgetPerHour: 500, // Studionet rate limit, see the repo README
  github: "https://github.com/reza9133/matchplay",
  x: "https://x.com/amirhp771",
  genlayer: "https://www.genlayer.com",
  // Explorer deep links. Adjust here if the explorer changes its URL scheme.
  addressUrl: (a) => `https://genlayer-explorer.vercel.app/address/${a}`,
  txUrl: (h) => `https://genlayer-explorer.vercel.app/transactions/${h}`,
};
export const RULES = {
  MIN_POOL: 2n * 10n ** 15n, // 0.002 GEN
  MIN_BOND: 10n ** 15n, // 0.001 GEN
  MAX_AMOUNT: 10n ** 27n,
  MIN_ENTRIES: 3,
  MAX_ENTRIES: 8,
  TITLE: [3, 60],
  MISSION: [30, 1000],
  NAME: [2, 40],
  PITCH: [40, 600],
  MIN_PITCH_LETTERS: 20,
  REASON: [3, 160],
  MAX_URL: 300,
  WINDOW: [60, 30 * 86400],
  MAX_BAR: 90,
  RETRY_GAP: 120,
  MAX_TRIES: 3,
  LEVEL_FIT: [0, 25, 50, 75, 100],
};
export const STATE = ["Open", "Playing", "Done", "Cancelled"];
export const OUTCOME = ["A wins", "B wins", "Tie", "Nobody earns"];
export const BY = ["—", "Judge", "Voided", "Timed out"];
