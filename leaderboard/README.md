# Leaderboard backend

Zero-dependency (Python stdlib + SQLite) score server for the shared daily
leaderboard. One row per (day, player name); resubmitting overwrites. The
all-time board is derived (best final bankroll per name).

## Deploy to kalshi-bots (same pattern as the Jeopardy leaderboard)

```bash
# from this repo's root, on the local machine
scp -r leaderboard kalshi-bots:~/hedge0-lb

ssh kalshi-bots
sudo cp ~/hedge0-lb/hedge0-lb.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hedge0-lb
curl -s localhost:8126/hedge0/health   # -> {"ok": true}
```

Then route it through the existing nginx HTTPS reverse proxy for
`32.194.248.231.nip.io` — add to `/etc/nginx/sites-available/leaderboard`
above the `location / {` block (DONE 2026-08-30):

```
location /hedge0/ {
    proxy_pass http://localhost:8126;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

Then `sudo nginx -t && sudo systemctl reload nginx`.

Verify from outside: `curl -s https://32.194.248.231.nip.io/hedge0/health`

The game front-end (game.js `LB_API`) already points at
`https://32.194.248.231.nip.io/hedge0` in production and
`http://localhost:8126/hedge0` when served from localhost.

## Run locally

```bash
python3 leaderboard/server.py            # port 8126, db hedge0-lb.db
```

## API

- `POST /hedge0/scores` — body `{seed, name, bankroll, picks}`; `seed` is the
  daily date `YYYY-MM-DD` (Pacific), `bankroll` is final integer dollars
  (0..$1T; scores are client-computed — honor system, like the Jeopardy
  board). Returns the updated daily board.
- `GET /hedge0/scores?seed=YYYY-MM-DD` — daily board, bankroll desc then
  submission time.
- `GET /hedge0/alltime` — best final bankroll per player (top 100), with the
  date it was set.
- `GET /hedge0/health`

Paths also work without the `/hedge0` prefix.
