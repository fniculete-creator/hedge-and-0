# Hedge and 0

Start with **$1,000,000**. A wheel of years (2000–2025) spins; each landed
year shows the era's context (world event, gadget, car, president, and what
the S&P 500 did), then you pick the S&P 500 stock you think performed best
that calendar year. Your bankroll compounds by the pick's real
calendar-year return. Five spins; highest final fortune tops the
leaderboard.

**Daily challenge** — the board is seeded by the Pacific calendar date, so
everyone gets the same five years each day. One play per day.

Live: https://fniculete-creator.github.io/hedge-and-0/

## How it works

- `index.html` + `style.css` + `game.js` — the whole game, no build step.
- `stocks-data.js` — GENERATED. Per-year curated S&P 500 constituents
  (~100/year incl. famous blowups) with calendar-year returns
  (adjusted-close basis, dividends included) plus the S&P 500's own
  return. Built by `tools/build_returns.py`, gated by
  `tools/verify_returns.py`.
- `context-data.js` — per-year context cards. Images in `img/` come from
  Wikimedia Commons / US-government public-domain sources via
  `tools/fetch_images.py`; attributions in `CREDITS.md`.
- `leaderboard/` — zero-dependency Python/SQLite score server (port 8126,
  `/hedge0` prefix). See `leaderboard/README.md` for the deploy runbook.

## Local dev

```bash
python -m http.server 8300          # game at http://localhost:8300
python leaderboard/server.py        # leaderboard on :8126
```

`?seed=YYYY-MM-DD` previews another day's board (leaderboard posting is
disabled for overridden seeds).

## Rebuilding the data

```bash
cd tools
python build_returns.py             # fetch prices (cached), emit stocks-data.js
python verify_returns.py            # spot-checks + sanity gates — must pass
python fetch_images.py              # download/resize context images, CREDITS.md
```
