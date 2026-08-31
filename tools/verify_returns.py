#!/usr/bin/env python3
"""Verify the generated stocks-data.js against published figures and
sanity bounds. Run after build_returns.py; the data isn't shippable
until this prints ALL CHECKS PASSED.

Checks:
  1. ~20 embedded spot-checks of widely published calendar-year returns
     (tolerance +-4pp — adjusted-close vs published total-return wiggle).
  2. Sanity bounds: r < -95 must be an override (x flag); |r| > 150 must
     be on the embedded whitelist of known monster years.
  3. Coverage: >= 80 stocks/year, Dow count 20-32/year, sectors valid,
     no duplicate (year,ticker).
  4. S&P line present for every year.
"""

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
JS = os.path.join(HERE, "..", "stocks-data.js")

# (year, ticker, published_return_pct) — widely published figures
SPOT_CHECKS = [
    (2000, "MSFT", -62.8), (2000, "AAPL", -71.1), (2000, "AMZN", -79.6),
    (2001, "MSFT", 52.7),
    (2002, "AMZN", 74.6),
    (2003, "AMZN", 178.6), (2003, "NVDA", 100.0),
    (2007, "AAPL", 133.5),
    (2008, "AAPL", -56.9), (2008, "C", -77.2),   (2008, "MCD", 8.5),
    (2009, "AAPL", 147.0),
    (2013, "NFLX", 297.6), (2013, "META", 105.3),
    (2015, "AMZN", 117.8), (2015, "NFLX", 134.4),
    (2019, "AAPL", 88.9),
    (2020, "TSLA", 743.4), (2020, "AAPL", 82.3),
    (2022, "META", -64.2), (2022, "NVDA", -50.3),
    (2023, "NVDA", 238.9), (2023, "META", 194.1),
    (2024, "NVDA", 171.2),
]
TOL = 4.0  # percentage points

# (year, ticker) pairs allowed to exceed |150%|
BIG_MOVE_WHITELIST = {
    (2003, "AMZN"), (2009, "F"), (2013, "NFLX"), (2015, "NFLX"),
    (2020, "TSLA"), (2023, "NVDA"), (2024, "NVDA"), (2023, "META"),
    (2009, "AAPL"), (2024, "PLTR"), (2024, "VST"),
    # verified monster years (all widely documented)
    (2001, "BBY"), (2001, "NVDA"), (2003, "GLW"), (2003, "FCX"),
    (2003, "YHOO"), (2004, "AAPL"), (2009, "AMZN"), (2009, "AMD"),
    (2009, "EXPE"), (2009, "FCX"), (2009, "MU"), (2010, "NFLX"),
    (2013, "BBY"), (2013, "MU"), (2016, "NVDA"), (2021, "DVN"),
    (2025, "MU"), (2025, "NEM"),
}

SECTORS = {
    "Communication Services", "Consumer Discretionary", "Consumer Staples",
    "Energy", "Financials", "Health Care", "Industrials",
    "Information Technology", "Materials", "Real Estate", "Utilities",
}


def load():
    raw = open(JS, encoding="utf-8").read()
    m = re.search(r"window\.MDS_DATA\s*=\s*(\{.*\});", raw, re.S)
    if not m:
        sys.exit("cannot parse stocks-data.js")
    return json.loads(m.group(1))


def main():
    data = load()
    years = data["years"]
    problems, reviews = [], []

    # 1. spot checks
    for y, t, expected in SPOT_CHECKS:
        yo = years.get(str(y))
        row = next((s for s in yo["stocks"] if s["t"] == t), None) if yo else None
        if row is None:
            problems.append(f"spot-check MISSING: {t} {y}")
            continue
        if abs(row["r"] - expected) > TOL:
            problems.append(
                f"spot-check FAIL: {t} {y} got {row['r']} expected ~{expected}")

    # 2. bounds
    for ys, yo in years.items():
        y = int(ys)
        for s in yo["stocks"]:
            if s["r"] < -95 and not s.get("x"):
                problems.append(f"{s['t']} {y}: {s['r']}% but not an override")
            if abs(s["r"]) > 150 and (y, s["t"]) not in BIG_MOVE_WHITELIST:
                reviews.append(f"{s['t']} {y}: {s['r']}% — verify & whitelist")

    # 3. coverage / structure
    for y in range(2000, 2026):
        yo = years.get(str(y))
        if yo is None:
            problems.append(f"year {y} missing")
            continue
        n = len(yo["stocks"])
        dow = sum(s["dow"] for s in yo["stocks"])
        if n < 80:
            problems.append(f"{y}: only {n} stocks")
        if not (20 <= dow <= 32):
            problems.append(f"{y}: dow count {dow}")
        seen = set()
        for s in yo["stocks"]:
            if s["s"] not in SECTORS:
                problems.append(f"{s['t']} {y}: bad sector {s['s']!r}")
            if s["t"] in seen:
                problems.append(f"{y}: duplicate {s['t']}")
            seen.add(s["t"])
        if "sp500" not in yo or not isinstance(yo["sp500"], (int, float)):
            problems.append(f"{y}: missing sp500")

    if reviews:
        print(f"{len(reviews)} big moves needing manual review/whitelist:")
        for r in reviews:
            print("  " + r)
    if problems:
        print(f"\n{len(problems)} PROBLEMS:")
        for p in problems:
            print("  " + p)
        sys.exit(1)
    if reviews:
        print("\nNo hard failures, but review the big moves above "
              "(add to BIG_MOVE_WHITELIST once confirmed).")
        sys.exit(2)
    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    main()
