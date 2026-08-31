#!/usr/bin/env python3
"""Build stocks-data.js from the curated source CSVs.

Reads   companies.csv    one row per company, year-range spans
        spx-returns.csv  S&P 500 total return per year (hand-entered)
        overrides.csv    hand-entered returns for delisted/broken tickers
Fetches daily adjusted closes per symbol (yfinance, Stooq fallback),
caching raw CSVs in cache/ so re-runs never re-hit the network.
Computes calendar-year returns  adjClose(EOY) / adjClose(prev EOY) - 1
and emits ../stocks-data.js (window.MDS_DATA = {...}).

Run from tools/:  python build_returns.py [--refresh SYMBOL] [--offline]
"""

import argparse
import csv
import io
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
OUT_JS = os.path.join(HERE, "..", "stocks-data.js")

YEAR_MIN, YEAR_MAX = 2000, 2025
SECTORS = [
    "Communication Services", "Consumer Discretionary", "Consumer Staples",
    "Energy", "Financials", "Health Care", "Industrials",
    "Information Technology", "Materials", "Real Estate", "Utilities",
]


def parse_span(span, what, row):
    span = (span or "").strip()
    if not span:
        return set()
    try:
        a, b = (span.split("-") + [span])[:2] if "-" in span else (span, span)
        a, b = int(a), int(b)
    except ValueError:
        sys.exit(f"bad {what} span {span!r} in row {row}")
    return set(range(max(a, YEAR_MIN), min(b, YEAR_MAX) + 1))


def load_companies():
    path = os.path.join(HERE, "companies.csv")
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            row = {k.strip(): (v or "").strip() for k, v in row.items()}
            if not row.get("ticker"):
                continue
            if row["sector"] not in SECTORS:
                sys.exit(f"bad sector {row['sector']!r} for {row['ticker']}")
            row["_years"] = parse_span(row["years"], "years", row["ticker"])
            row["_dow"] = parse_span(row["dow_years"], "dow_years", row["ticker"])
            if not row["_years"]:
                sys.exit(f"{row['ticker']}: empty years span")
            rows.append(row)
    tickers = [r["ticker"] for r in rows]
    dupes = {t for t in tickers if tickers.count(t) > 1}
    if dupes:
        sys.exit(f"duplicate tickers: {sorted(dupes)}")
    return rows


def load_spx():
    path = os.path.join(HERE, "spx-returns.csv")
    out = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            out[int(row["year"])] = float(row["return_pct"])
    missing = [y for y in range(YEAR_MIN, YEAR_MAX + 1) if y not in out]
    if missing:
        sys.exit(f"spx-returns.csv missing years: {missing}")
    return out


def load_overrides():
    path = os.path.join(HERE, "overrides.csv")
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            out[(int(row["year"]), row["ticker"].strip())] = float(row["return_pct"])
    return out


# ---------------------------------------------------------------- prices

def fetch_yahoo(symbol):
    import yfinance as yf
    df = yf.download(symbol, start="1998-12-01", end="2026-01-15",
                     auto_adjust=True, progress=False)
    if df is None or df.empty:
        return None
    # yfinance may return MultiIndex columns even for one symbol
    close = df["Close"]
    if hasattr(close, "columns"):
        close = close.iloc[:, 0]
    out = {}
    for ts, v in close.items():
        if v == v:  # not NaN
            out[str(ts.date())] = float(v)
    return out or None


def fetch_stooq(symbol):
    url = f"https://stooq.com/q/d/l/?s={symbol.lower()}.us&i=d"
    req = urllib.request.Request(url, headers={"User-Agent": "hedge-and-0 build"})
    try:
        raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    except Exception:
        return None
    if not raw.startswith("Date"):
        return None
    out = {}
    for row in csv.DictReader(io.StringIO(raw)):
        try:
            out[row["Date"]] = float(row["Close"])
        except (KeyError, ValueError):
            continue
    return out or None


def get_closes(symbol, offline=False, refresh=False):
    """{date_str: adjusted close} for a symbol, cached on disk."""
    os.makedirs(CACHE, exist_ok=True)
    cache_path = os.path.join(CACHE, symbol.replace("/", "_") + ".csv")
    if os.path.exists(cache_path) and not refresh:
        out = {}
        with open(cache_path, newline="", encoding="utf-8") as f:
            for row in csv.reader(f):
                if len(row) == 2:
                    out[row[0]] = float(row[1])
        return out or None
    if offline:
        return None
    closes, source = None, None
    try:
        closes, source = fetch_yahoo(symbol), "yahoo"
    except Exception as e:
        print(f"  {symbol}: yahoo error {e}")
    if not closes:
        closes, source = fetch_stooq(symbol), "stooq"
    if not closes:
        print(f"  {symbol}: NO DATA from yahoo or stooq")
        return None
    with open(cache_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        for d in sorted(closes):
            w.writerow([d, f"{closes[d]:.6f}"])
    print(f"  {symbol}: fetched {len(closes)} rows from {source}")
    time.sleep(1.0)
    return closes


def year_end_close(closes, year):
    """Last close in December of `year` (None if the series doesn't reach)."""
    best = None
    prefix = f"{year}-12-"
    for d in closes:
        if d.startswith(prefix) and (best is None or d > best):
            best = d
    return closes[best] if best else None


def first_date(closes):
    return min(closes) if closes else None


# ---------------------------------------------------------------- build

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true",
                    help="cache only; never hit the network")
    ap.add_argument("--refresh", default=None,
                    help="re-fetch one symbol even if cached")
    args = ap.parse_args()

    companies = load_companies()
    spx = load_spx()
    overrides = load_overrides()
    print(f"{len(companies)} companies, {len(overrides)} overrides")

    # returns[(year, ticker)] = (pct, approx)
    returns = {}
    warned = []
    for c in companies:
        sym = c["yahoo_symbol"] or c["ticker"]
        closes = None
        if sym.upper() != "NONE":
            closes = get_closes(sym, offline=args.offline,
                                refresh=(args.refresh == sym))
        fd = first_date(closes) if closes else None
        for y in sorted(c["_years"]):
            key = (y, c["ticker"])
            if key in overrides:
                returns[key] = (overrides[key], True)
                continue
            if not closes:
                warned.append(f"{c['ticker']} {y}: no price data and no override")
                continue
            prev = year_end_close(closes, y - 1)
            cur = year_end_close(closes, y)
            if prev is None or cur is None:
                # IPO'd mid-period or series ends early — skip the year
                warned.append(f"{c['ticker']} {y}: incomplete series (first data {fd})")
                continue
            returns[key] = (round((cur / prev - 1) * 100, 1), False)

    # assemble per-year blob
    years_obj = {}
    for y in range(YEAR_MIN, YEAR_MAX + 1):
        stocks = []
        for c in companies:
            if y not in c["_years"]:
                continue
            key = (y, c["ticker"])
            if key not in returns:
                continue
            pct, approx = returns[key]
            row = {"t": c["ticker"], "n": c["name"], "s": c["sector"],
                   "dow": 1 if y in c["_dow"] else 0, "r": pct}
            if approx:
                row["x"] = 1
            if c.get("note"):
                row["note"] = c["note"]
            stocks.append(row)
        stocks.sort(key=lambda s: s["n"].lower())
        years_obj[str(y)] = {"sp500": spx[y], "stocks": stocks}

    # report
    print("\nPer-year coverage:")
    bad = False
    for y in range(YEAR_MIN, YEAR_MAX + 1):
        n = len(years_obj[str(y)]["stocks"])
        dow = sum(s["dow"] for s in years_obj[str(y)]["stocks"])
        flag = ""
        if n < 80:
            flag, bad = "  << UNDER 80", True
        if not (20 <= dow <= 32):
            flag += f"  << DOW COUNT {dow}"
            bad = True
        print(f"  {y}: {n} stocks, {dow} dow{flag}")
    if warned:
        print(f"\n{len(warned)} warnings:")
        for w in warned[:40]:
            print("  " + w)
        if len(warned) > 40:
            print(f"  ... and {len(warned) - 40} more")

    blob = {
        "generated": time.strftime("%Y-%m-%d"),
        "returnBasis": "adjusted-close (dividends included)",
        "sectors": SECTORS,
        "years": years_obj,
    }
    js = "window.MDS_DATA = " + json.dumps(blob, ensure_ascii=False,
                                           separators=(",", ":")) + ";\n"
    with open(OUT_JS, "w", encoding="utf-8") as f:
        f.write("/* GENERATED by tools/build_returns.py — do not edit by hand. */\n")
        f.write(js)
    print(f"\nwrote {OUT_JS} ({len(js)//1024} KB)")
    if bad:
        print("COVERAGE PROBLEMS — see << flags above")
        sys.exit(1)


if __name__ == "__main__":
    main()
