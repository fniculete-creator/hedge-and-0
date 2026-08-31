#!/usr/bin/env python3
"""Download the Wikimedia Commons images listed in images.csv, resize to
640px max dimension, encode as webp into ../img/, and regenerate
../CREDITS.md from the CSV. Rows with MISSING urls are skipped (and
reported) so the game's emoji placeholders show instead.

Run from tools/:  python fetch_images.py [--only FILE]
"""

import argparse
import csv
import io
import os
import sys
import time
import urllib.request

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
IMG_DIR = os.path.join(HERE, "..", "img")
CREDITS = os.path.join(HERE, "..", "CREDITS.md")
UA = {"User-Agent": "hedge-and-0-game/1.0 (contact: github.com/fniculete-creator)"}

MAX_DIM = 640
QUALITY = 72


def rows():
    with open(os.path.join(HERE, "images.csv"), newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            yield {k.strip(): (v or "").strip() for k, v in row.items()}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=60).read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None, help="process just this target file")
    args = ap.parse_args()

    os.makedirs(IMG_DIR, exist_ok=True)
    done, skipped, failed = [], [], []
    all_rows = list(rows())
    for row in all_rows:
        name = row["file"]
        if args.only and name != args.only:
            continue
        url = row["file_url"]
        if not url or url.upper() == "MISSING":
            skipped.append(name)
            continue
        out = os.path.join(IMG_DIR, name)
        if os.path.exists(out) and not args.only:
            done.append(name)
            continue
        try:
            data = fetch(url)
            img = Image.open(io.BytesIO(data)).convert("RGB")
            img.thumbnail((MAX_DIM, MAX_DIM), Image.LANCZOS)
            img.save(out, "WEBP", quality=QUALITY)
            kb = os.path.getsize(out) // 1024
            print(f"  {name}: {img.size[0]}x{img.size[1]}, {kb} KB")
            done.append(name)
            time.sleep(0.5)
        except Exception as e:
            print(f"  {name}: FAILED {e}")
            failed.append(name)

    # regenerate CREDITS.md from the CSV (single source of truth)
    lines = [
        "# Image credits",
        "",
        "All photographs are from [Wikimedia Commons](https://commons.wikimedia.org/) "
        "or are U.S. government works in the public domain. Images have been "
        "cropped/resized for display.",
        "",
        "| Image | Source | Author | License |",
        "|---|---|---|---|",
    ]
    for row in all_rows:
        if not row["file_url"] or row["file_url"].upper() == "MISSING":
            continue
        lines.append(
            f"| {row['file']} | [Commons]({row['commons_page']}) "
            f"| {row['author']} | {row['license']} |")
    with open(CREDITS, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"\n{len(done)} images present, {len(skipped)} rows MISSING, "
          f"{len(failed)} failed")
    print(f"regenerated {CREDITS}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
