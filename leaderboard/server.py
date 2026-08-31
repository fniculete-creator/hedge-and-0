#!/usr/bin/env python3
"""Hedge and 0 leaderboard server.

A tiny zero-dependency (stdlib-only) score server backing the game's
shared daily leaderboard. One row per (daily seed, player name); a
resubmission by the same name for the same day overwrites the old score.

    POST /hedge0/scores    {"seed": "2026-08-30", "name": "Filip",
                         "bankroll": 2481309, "picks": "01:ENE:-99.6|..."}
    GET  /hedge0/scores?seed=2026-08-30      daily board
    GET  /hedge0/alltime                     best final bankroll per player
    GET  /hedge0/health

Both paths also work without the /hedge0 prefix, so the server runs
identically standalone (localhost dev) or behind a reverse proxy that
forwards the full /hedge0/* path.

Run:  python3 server.py [--port 8126] [--db hedge0-lb.db]
"""

import argparse
import json
import re
import sqlite3
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

SEED_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NAME_MAX = 20
PICKS_MAX = 400
BANKROLL_MAX = 1_000_000_000_000  # $1T — generous ceiling; honor system

db_lock = threading.Lock()
db = None  # set in main()


def init_db(path):
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS scores (
             seed       TEXT NOT NULL,
             name_key   TEXT NOT NULL,
             name       TEXT NOT NULL,
             bankroll   INTEGER NOT NULL,
             picks      TEXT NOT NULL DEFAULT '',
             updated_at TEXT NOT NULL DEFAULT (datetime('now')),
             PRIMARY KEY (seed, name_key)
           )"""
    )
    conn.commit()
    return conn


def board(seed):
    rows = db.execute(
        """SELECT name, bankroll, picks, updated_at FROM scores
           WHERE seed = ? ORDER BY bankroll DESC, updated_at ASC""",
        (seed,),
    ).fetchall()
    return {
        "seed": seed,
        "entries": [
            {"name": r[0], "bankroll": r[1], "picks": r[2], "ts": r[3]}
            for r in rows
        ],
    }


def alltime():
    # SQLite guarantees bare columns come from the MAX(bankroll) row.
    rows = db.execute(
        """SELECT name, MAX(bankroll) AS bankroll, seed, updated_at
           FROM scores GROUP BY name_key
           ORDER BY bankroll DESC, updated_at ASC LIMIT 100"""
    ).fetchall()
    return {
        "entries": [
            {"name": r[0], "bankroll": r[1], "seed": r[2], "ts": r[3]}
            for r in rows
        ],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "Hedge0LB/1"

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def _route(self):
        path = urlparse(self.path).path.rstrip("/")
        if path.startswith("/hedge0"):
            path = path[len("/hedge0"):] or "/"
        return path

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        path = self._route()
        if path == "/health":
            return self._send(200, {"ok": True})
        if path == "/scores":
            qs = parse_qs(urlparse(self.path).query)
            seed = (qs.get("seed") or [""])[0]
            if not SEED_RE.match(seed):
                return self._send(400, {"error": "bad seed"})
            with db_lock:
                return self._send(200, board(seed))
        if path == "/alltime":
            with db_lock:
                return self._send(200, alltime())
        return self._send(404, {"error": "not found"})

    def do_POST(self):
        if self._route() != "/scores":
            return self._send(404, {"error": "not found"})
        try:
            length = min(int(self.headers.get("Content-Length", 0)), 10_000)
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._send(400, {"error": "bad json"})

        seed = data.get("seed", "")
        name = str(data.get("name", "")).strip()[:NAME_MAX]
        picks = str(data.get("picks", ""))[:PICKS_MAX]
        try:
            bankroll = int(data.get("bankroll"))
        except (TypeError, ValueError):
            return self._send(400, {"error": "bad bankroll"})

        if not SEED_RE.match(seed):
            return self._send(400, {"error": "bad seed"})
        if not name:
            return self._send(400, {"error": "name required"})
        if not (0 <= bankroll <= BANKROLL_MAX):
            return self._send(400, {"error": "bad bankroll"})

        with db_lock:
            db.execute(
                """INSERT INTO scores (seed, name_key, name, bankroll, picks)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT (seed, name_key) DO UPDATE SET
                     name = excluded.name, bankroll = excluded.bankroll,
                     picks = excluded.picks, updated_at = datetime('now')""",
                (seed, name.lower(), name, bankroll, picks),
            )
            db.commit()
            self._send(200, board(seed))

    def log_message(self, fmt, *args):  # quiet journald
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8126)
    ap.add_argument("--db", default="hedge0-lb.db")
    args = ap.parse_args()

    global db
    db = init_db(args.db)
    print(f"Hedge and 0 leaderboard on :{args.port}, db={args.db}")
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
