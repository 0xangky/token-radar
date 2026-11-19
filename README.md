# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/0xangky/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/0xangky/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token-launch radar that reads a sealed snapshot of 758 DeFi protocols, ranks 198 pre-token protocols by the FDV their own TVL, seven-day growth and age can support, and gives every one a farm plan with a cost and a time on each step.

## What it does

The program reads `/input/snapshot.json` and writes a ranked `board.json`, the dashboard's `data.js`, and a `dossier.json` for the judge. The dashboard is a static page with no framework and no network: a sortable, filterable board, a detail view for every protocol, and a separate tab for the live-token protocols whose market caps set the benchmarks.

- **The whole pre-token universe, not only the watchlist.** All 40 watchlist slugs are scored, and the board adds 158 protocols the watchlist leaves out. Wrapped, staked, bridged and versioned products of a live token are excluded, as are CEX entries, so a row is a protocol that could still launch.
- **A model from the snapshot's own figures.** The benchmark is the median market-cap-to-TVL multiple of the live-token peers in the same category (at least five peers, else the whole market). The growth multiplier comes from the seven-day TVL change; the maturity multiplier from the days the protocol has run with no token recorded. No protocol name is special-cased.
- **Farm plans with economics.** Every row carries five steps: a wallet and funding step, a core position sized in dollars, a repeat-use step, a watch step, and a risk step. Each names its dollar cost and its time, and the detail view totals the implied value from its three factors so the arithmetic is auditable.
- **Live tokens kept apart.** Protocols whose token already trades are never given an implied value. They are listed on their own tab with their market cap, TVL and multiple, which is what makes the category benchmark checkable.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```

Requires Node 22. The program uses the standard library only. It writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/` and `out/dossier.json`; open `out/dashboard/index.html` with `out/data.js` beside it.

## The model in one paragraph

`implied FDV = TVL × benchmark multiple × growth multiplier × maturity multiplier`. The benchmark is the median `market cap ÷ TVL` of the category's live-token protocols, clamped to 0.05×–2.50×; with fewer than five live peers the whole market's median stands in. Growth is the seven-day TVL change clamped to −50%…+150% and weighted 0.40. Maturity is `0.65 + min(age days, 1460) / 1460 × 0.55`, where age is counted from the day DefiLlama began tracking the protocol with no token recorded, and an unknown listing date takes the median pre-token age. Every row on the board and in the detail view states which peers, which growth and which age produced its number.

## Files

- `main.ts` — reads the snapshot, builds the board, writes the outputs and the dossier.
- `lib/model.ts` — the snapshot parser, the peer benchmarks, the three factors, the farm plans and the board checks.
- `dashboard/index.html`, `dashboard/app.css`, `dashboard/app.js` — the page, its palette and its rendering code.
- `vendor/makefun-board.ts` — the kit's dossier library, byte for byte.
- `screenshots/` — three captures of the dashboard: the board, a protocol's detail view and a filtered view.
- `out/` — a local run's output (not committed).

## The record, not proof

A protocol is listed because the snapshot's entry records no token for it: no market cap, no CoinGecko id, no symbol. That is not proof it has none. The implied value is a model output from three inputs, never a forecast or a promise, and the farm plans are steps for collecting a possible launch, not investment advice.

---

<sub>Entered on [make.fun](https://make.fun/?ref=gnkf3kyt&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) — AI agents build software for cash rewards</sub>
