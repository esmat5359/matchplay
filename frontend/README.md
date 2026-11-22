# Matchplay web app

Multi-page frontend for the **Matchplay** Intelligent Contract on **GenLayer Studionet**.

- Contract: `0xdd842644E5fEaba5c4FDB28d97236b5B58C5C69c` (default in `src/config.js`)
- Chain: GenLayer Studionet, chain id `61999`, currency GEN
- Source of the contract: https://github.com/reza9133/matchplay
- Author on X: https://x.com/amirhp771

## Pages

| Page | File | What it does |
|---|---|---|
| Home | `index.html` | Hero, how a match is judged, lifecycle, money calculator, latest rounds, video demo |
| Arena | `rounds.html` | Every round, filters, "My rounds" |
| Round | `round.html?id=N` | Entries, matches, judge reviews, and every action (enter, withdraw, top up, remove, start, cancel, play next, finalize, claim) |
| Host | `create.html` | Create a round with live validation and a payout preview |
| Account | `account.html` | Balance, claimable GEN, hosted and entered rounds |
| Ledger | `ledger.html` | `stats`, `solvency` and an on-demand `audit_books` |
| Docs | `docs.html` | Full documentation |
| Demo | `demo.html` | Click-to-play video and chapters |
| 404 | `404.html` | Not found page (used by Cloudflare Pages) |

## Wallet

Wallets are found with **EIP-6963** and used through **EIP-1193**. Connect and Disconnect work from the header:
Disconnect calls `wallet_revokePermissions` (where the wallet supports it), clears the session and does not reconnect silently next time.
If the wallet is on another chain the app shows a banner and a dialog, and switches with `wallet_switchEthereumChain` (adding the network first with `wallet_addEthereumChain` when needed).

## Run

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static site in dist/
```

Optional: copy `.env.example` to `.env` to change the contract address (`VITE_MATCHPLAY_ADDRESS`).

## Deploy on Cloudflare Pages

- Root directory: `frontend` (this folder)
- Build command: `npm run build`
- Output directory: `dist`

All nine pages are listed in `vite.config.js` under `build.rollupOptions.input`, so every page is built and none returns 404.

## Studionet notes the app follows

- A refused payable call (`create_round`, `enter`, `top_up`) leaves the attached GEN in the contract outside its books. `src/lib/validate.js` ports the contract's checks and the app also calls `would_steer` on the name and pitch before it attaches any value.
- `play_next` can end `UNDETERMINED` when validators do not agree strictly. Nothing changes and it can be retried at once. Only unreadable evidence pages (`tries > 0`) have the 120 second pause.
- The RPC allows about 500 requests an hour. `src/lib/chain.js` caches reads, counts requests (shown in the footer), refreshes slowly, pauses on hidden tabs and retries a rate-limited read once. Writes are never retried.

## Demo mode

Open any page with `?demo=1`. The app replaces its network layer with an in-browser copy of the contract rules and announces a pretend EIP-6963 wallet that starts on the wrong network. Nothing is sent anywhere. The video in `public/media` was recorded in this mode.

## Layout

```
src/config.js       contract, chain, links, rule limits
src/lib/wallet.js   EIP-6963 discovery, connect, disconnect, switch network
src/lib/chain.js    reads, writes, request budget, transaction polling
src/lib/validate.js browser port of the contract checks
src/lib/_steer.json the contract's steering regex, extracted from contracts/matchplay.py (_STEER)
src/lib/mock.js     demo mode (simulated contract + pretend wallet)
src/lib/ui.js       header, banners, dialogs, spinners, 3D helpers
src/pages/*.js      one script per page
public/img          background, Mochi, GenLayer logos
public/media        demo video and poster
```

## Not verified live

This app was built and tested in a sandbox without access to Studionet. Reads and writes follow the contract source and the `genlayer-js@1.1.8` API, and the whole interface was exercised in demo mode, but the first real transaction on Studionet should be tried by hand. The explorer link formats in `src/config.js` are a guess and easy to change.
