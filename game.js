/* Hedge and 0 — start with $1,000,000, spin the wheel of years, and pick
   the S&P 500 stock you think performed best that calendar year. Five
   spins; your bankroll compounds by each pick's real calendar-year
   return. Daily challenge: the board is seeded by the Pacific calendar
   date, so everyone gets the same five years and can compare fortunes.

   Data: stocks-data.js (window.MDS_DATA) + context-data.js
   (window.MDS_CONTEXT). Leaderboard: leaderboard/server.py. */

(function () {
  "use strict";

  const DATA = window.MDS_DATA;
  const CONTEXT = window.MDS_CONTEXT || {};
  const YEARS = Object.keys(DATA.years).map(Number).sort((a, b) => a - b);
  const SPINS = Math.min(5, YEARS.length);
  const START_BANKROLL = 1_000_000;
  const SLICE = 360 / YEARS.length;
  const WHEEL_COLORS = ["--wheel-a", "--wheel-b", "--wheel-c", "--wheel-d"];
  const CTX_SLOTS = [
    { key: "event",     label: "World event",   ph: "\u{1F4F0}" },
    { key: "gadget",    label: "The gadget",    ph: "\u{1F50C}" },
    { key: "car",       label: "The car",       ph: "\u{1F3CE}️" },
    { key: "president", label: "The president", ph: "\u{1F1FA}\u{1F1F8}" },
  ];

  const STORAGE_GAME = "hedge0-game";
  const STORAGE_NAME = "hedge0-name";

  // Shared daily leaderboard backend (leaderboard/server.py). Local dev
  // hits a locally-run server; anywhere else, the kalshi-bots box.
  const LB_API = /^(localhost|127\.|192\.168\.)/.test(location.hostname)
    ? `http://${location.hostname}:8126/hedge0`
    : "https://32.194.248.231.nip.io/hedge0";

  let state = null;        // persistent game state
  let wheelRotation = 0;   // cumulative rotation (deg), always increases
  let spinning = false;
  let spinFallback = null; // safety timeout if transitionend never fires
  let filters = { q: "", sector: null, dowOnly: false };
  let selectedTicker = null;
  let bankrollAnim = null; // rAF handle for the count-up

  /* ---------- seeded RNG (house idiom) ---------- */
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seedStr) { return mulberry32(xmur3(seedStr)()); }

  function pickDistinct(rng, count, max) {
    const picked = new Set();
    while (picked.size < count) picked.add(Math.floor(rng() * max));
    return [...picked];
  }

  /* ---------- game day (midnight Pacific, PinPoint convention) ---------- */
  const gameDayFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  function pacificToday() { return gameDayFormat.format(new Date()); }

  // ?seed=YYYY-MM-DD overrides the date for testing; overridden games
  // never post to the leaderboard.
  function currentSeed() {
    const q = new URLSearchParams(location.search).get("seed");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return { seed: q, overridden: q !== pacificToday() };
    return { seed: pacificToday(), overridden: false };
  }

  /* ---------- game state ---------- */
  function buildGame(seed, overridden) {
    const rng = makeRng("hedge0:" + seed);
    const years = pickDistinct(rng, SPINS, YEARS.length).map((i) => YEARS[i]);
    // Pre-rolled spin theatre: extra full turns + a small intra-slice
    // jitter per spin, drawn from the same daily stream so every player
    // watches the identical spin.
    const spins = years.map(() => ({
      k: 4 + Math.floor(rng() * 3),
      jit: (rng() * 2 - 1) * (SLICE * 0.3),
    }));
    return {
      seed, overridden, years, spins,
      spinIndex: 0,
      picks: [],            // {y, t, r}
      bankroll: START_BANKROLL,
      done: false,
    };
  }

  function save() {
    try { localStorage.setItem(STORAGE_GAME, JSON.stringify(state)); } catch (e) {}
  }
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_GAME)); } catch (e) { return null; }
  }

  /* ---------- helpers ---------- */
  const $ = (id) => document.getElementById(id);
  function fmt$(n) { return "$" + Math.round(n).toLocaleString("en-US"); }
  function fmtPct(r) { return (r > 0 ? "+" : "") + r.toFixed(1) + "%"; }
  function updown(r) { return r >= 0 ? "up" : "down"; }
  function stocksOf(y) { return DATA.years[String(y)].stocks; }
  function sp500Of(y) { return DATA.years[String(y)].sp500; }
  function findStock(y, t) { return stocksOf(y).find((s) => s.t === t); }
  function playerName() { return ($("player-name").value || "").trim(); }
  function shortYear(y) { return "'" + String(y).slice(2); }

  /* ---------- setup screen ---------- */
  // Anti-cheat: an in-progress game found at page load means the player
  // left mid-run (reload, closed tab). The run ends where it stood —
  // no resuming to research picks between spins.
  function forfeitIfAbandoned() {
    const saved = loadSaved();
    if (saved && saved.seed === currentSeed().seed && !saved.done) {
      saved.done = true;
      saved.forfeited = true;
      try { localStorage.setItem(STORAGE_GAME, JSON.stringify(saved)); } catch (e) {}
    }
  }

  function initSetup() {
    try { $("player-name").value = localStorage.getItem(STORAGE_NAME) || ""; } catch (e) {}
    const { seed } = currentSeed();
    const saved = loadSaved();
    const playedToday = saved && saved.seed === seed && saved.done;
    $("played-note").classList.toggle("hidden", !playedToday);
    if (playedToday && saved.forfeited) {
      $("played-note").textContent = "Your run ended when you left the page mid-game — new wheel at midnight Pacific.";
    }
    $("start-daily").textContent = playedToday ? "See Today's Results" : "Spin Today's Wheel";
  }

  function startGame() {
    try { localStorage.setItem(STORAGE_NAME, playerName()); } catch (e) {}
    const { seed, overridden } = currentSeed();
    const saved = loadSaved();
    if (saved && saved.seed === seed) {
      state = saved; // resume today's game (finished or mid-run)
    } else {
      state = buildGame(seed, overridden);
      save();
    }
    $("setup-screen").classList.add("hidden");
    if (state.done) { showResults(); return; }
    $("game-screen").classList.remove("hidden");
    renderHeader();
    showWheel();
  }

  /* ---------- header ---------- */
  function renderHeader() {
    $("game-date").textContent = "Daily game · " + state.seed;
    $("spin-chip").textContent = `Spin ${Math.min(state.spinIndex + 1, SPINS)} of ${SPINS}`;
    $("bankroll-chip").textContent = fmt$(state.bankroll);
  }

  /* ---------- wheel ---------- */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function buildWheel() {
    const landed = new Set(state.picks.map((p) => p.y));
    const stops = [];
    for (let i = 0; i < YEARS.length; i++) {
      const color = landed.has(YEARS[i])
        ? cssVar("--wheel-done")
        : cssVar(WHEEL_COLORS[i % WHEEL_COLORS.length]);
      stops.push(`${color} ${(i * SLICE).toFixed(3)}deg ${((i + 1) * SLICE).toFixed(3)}deg`);
    }
    const wheel = $("wheel");
    wheel.style.background = `conic-gradient(${stops.join(", ")})`;
    // (re)build labels
    wheel.querySelectorAll(".wheel-slice").forEach((el) => el.remove());
    for (let i = 0; i < YEARS.length; i++) {
      const wrap = document.createElement("div");
      wrap.className = "wheel-slice" + (landed.has(YEARS[i]) ? " done" : "");
      wrap.style.transform = `rotate(${((i + 0.5) * SLICE).toFixed(3)}deg)`;
      const span = document.createElement("span");
      span.textContent = shortYear(YEARS[i]);
      const mid = (i + 0.5) * SLICE;
      if (mid > 90 && mid < 270) span.style.transform = "rotate(180deg)";
      wrap.appendChild(span);
      wheel.appendChild(wrap);
    }
  }

  function showWheel() {
    $("context-panel").classList.add("hidden");
    $("picker-panel").classList.add("hidden");
    $("confirm-bar").classList.add("hidden");
    $("wheel-panel").classList.remove("hidden");
    $("spin-btn").disabled = false;
    $("wheel-hint").textContent = state.spinIndex === 0
      ? "Spin to land on a year…"
      : "Spin again — landed years are crossed off.";
    renderHeader();
    buildWheel();
  }

  function spin() {
    if (spinning || state.spinIndex >= SPINS) return;
    spinning = true;
    $("spin-btn").disabled = true;

    const year = state.years[state.spinIndex];
    const yi = YEARS.indexOf(year);
    const theatre = state.spins[state.spinIndex] || { k: 4, jit: 0 };

    // Rotate so the landed slice's center sits under the 12 o'clock
    // pointer: rotation must satisfy (yi + 0.5) * SLICE + R === 0 (mod 360).
    const target = ((-(yi + 0.5) * SLICE + theatre.jit) % 360 + 360) % 360;
    const delta = ((target - (wheelRotation % 360)) % 360 + 360) % 360;
    wheelRotation += 360 * theatre.k + delta;

    const wheel = $("wheel");
    wheel.style.transition = "transform 4.2s cubic-bezier(0.12, 0.8, 0.2, 1)";
    // Force a style flush so the transition reliably kicks in.
    void wheel.offsetWidth;
    wheel.style.transform = `rotate(${wheelRotation}deg)`;

    const land = () => {
      if (!spinning) return;
      spinning = false;
      if (spinFallback) { clearTimeout(spinFallback); spinFallback = null; }
      wheel.removeEventListener("transitionend", land);
      showContext(year);
    };
    wheel.addEventListener("transitionend", land);
    spinFallback = setTimeout(land, 5000); // safety net
  }

  /* ---------- year context ---------- */
  function showContext(year) {
    $("wheel-panel").classList.add("hidden");
    $("picker-panel").classList.add("hidden");
    $("context-panel").classList.remove("hidden");

    $("ctx-year").textContent = year;
    const sp = sp500Of(year);
    $("ctx-sp").innerHTML =
      `The S&amp;P 500 returned <b class="${updown(sp)}">${fmtPct(sp)}</b> in ${year}.`;

    const ctx = CONTEXT[String(year)] || {};
    const cards = $("ctx-cards");
    cards.innerHTML = "";
    for (const slot of CTX_SLOTS) {
      const info = ctx[slot.key] || {};
      const card = document.createElement("div");
      card.className = "ctx-card";

      let media;
      if (info.img) {
        media = document.createElement("img");
        if (slot.key === "president") media.className = "portrait";
        media.src = info.img;
        media.alt = slot.label + " " + year;
        media.loading = "lazy";
        media.addEventListener("error", () => {
          const ph = document.createElement("div");
          ph.className = "ph";
          ph.textContent = slot.ph;
          media.replaceWith(ph);
        });
      } else {
        media = document.createElement("div");
        media.className = "ph";
        media.textContent = slot.ph;
      }
      card.appendChild(media);

      const cap = document.createElement("div");
      cap.className = "cap";
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = slot.label;
      const v = document.createElement("div");
      v.className = "v";
      v.textContent = slot.key === "president"
        ? (info.name || "—")
        : (info.text || "—");
      cap.appendChild(k);
      cap.appendChild(v);
      card.appendChild(cap);
      cards.appendChild(card);
    }
  }

  /* ---------- stock picker ---------- */
  function showPicker() {
    const year = state.years[state.spinIndex];
    filters = { q: "", sector: null, dowOnly: false };
    selectedTicker = null;
    $("stock-search").value = "";
    $("dow-toggle").checked = false;
    $("pick-year-title").textContent = year;
    $("context-panel").classList.add("hidden");
    $("picker-panel").classList.remove("hidden");
    $("confirm-bar").classList.add("hidden");
    renderChips(year);
    renderStockList(year);
  }

  function renderChips(year) {
    const present = new Set(stocksOf(year).map((s) => s.s));
    const sectors = DATA.sectors.filter((s) => present.has(s));
    const box = $("sector-chips");
    box.innerHTML = "";
    const all = document.createElement("button");
    all.className = "chip" + (filters.sector === null ? " active" : "");
    all.textContent = "All sectors";
    all.addEventListener("click", () => { filters.sector = null; renderChips(year); renderStockList(year); });
    box.appendChild(all);
    for (const s of sectors) {
      const chip = document.createElement("button");
      chip.className = "chip" + (filters.sector === s ? " active" : "");
      chip.textContent = s;
      chip.addEventListener("click", () => {
        filters.sector = filters.sector === s ? null : s;
        renderChips(year); renderStockList(year);
      });
      box.appendChild(chip);
    }
  }

  function renderStockList(year) {
    const list = $("stock-list");
    list.innerHTML = "";
    const q = filters.q.toLowerCase();
    const rows = stocksOf(year)
      .filter((s) => !filters.dowOnly || s.dow)
      .filter((s) => filters.sector === null || s.s === filters.sector)
      .filter((s) => !q || s.n.toLowerCase().includes(q) || s.t.toLowerCase().includes(q))
      .sort((a, b) => a.n.localeCompare(b.n));
    if (!rows.length) {
      list.innerHTML = "<div class='list-empty'>No matches — loosen the filters.</div>";
      return;
    }
    for (const s of rows) {
      const card = document.createElement("div");
      card.className = "stock-card" + (selectedTicker === s.t ? " selected" : "");
      // Deliberately no note/return shown pre-pick — that would spoil it.
      card.innerHTML =
        `<span class="tick"></span><span class="nm"></span>` +
        (s.dow ? `<span class="dow-tag">DOW</span>` : "") +
        `<span class="sec"></span>`;
      card.querySelector(".tick").textContent = s.t;
      card.querySelector(".nm").textContent = s.n;
      card.querySelector(".sec").textContent = s.s;
      card.addEventListener("click", () => selectStock(year, s.t));
      list.appendChild(card);
    }
  }

  function selectStock(year, ticker) {
    selectedTicker = ticker;
    renderStockList(year);
    const s = findStock(year, ticker);
    $("confirm-text").innerHTML =
      `Invest <b>${fmt$(state.bankroll)}</b> in <b></b>?`;
    $("confirm-text").querySelectorAll("b")[1].textContent = `${s.n} (${s.t})`;
    $("confirm-bar").classList.remove("hidden");
  }

  /* ---------- reveal ---------- */
  function animateBankroll(from, to, els, done) {
    if (bankrollAnim) cancelAnimationFrame(bankrollAnim);
    const DUR = 1400;
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      const t = Math.min(1, (now - start) / DUR);
      const v = from + (to - from) * ease(t);
      for (const el of els) el.textContent = fmt$(v);
      if (t < 1) bankrollAnim = requestAnimationFrame(step);
      else { bankrollAnim = null; if (done) done(); }
    };
    bankrollAnim = requestAnimationFrame(step);
  }

  function lockIn() {
    const year = state.years[state.spinIndex];
    const s = findStock(year, selectedTicker);
    if (!s) return;

    const oldBank = state.bankroll;
    const newBank = Math.round(oldBank * (1 + s.r / 100));
    state.picks.push({ y: year, t: s.t, r: s.r });
    state.bankroll = newBank;
    state.spinIndex += 1;
    state.done = state.picks.length >= SPINS;
    save();

    // Reveal content
    const sp = sp500Of(year);
    const all = stocksOf(year);
    const best = all.reduce((a, b) => (b.r > a.r ? b : a));
    const rank = 1 + all.filter((o) => o.r > s.r).length;
    const approx = s.x ? "≈" : "";

    $("rev-year").textContent = year;
    const beatMarket = s.r >= sp;
    const verdict = $("rev-verdict");
    verdict.textContent =
      s.r >= 25 ? "\u{1F4B0} Big year!" :
      s.r >= 0 ? "\u{1F4C8} In the green." :
      s.r > -50 ? "\u{1F4C9} Ouch." :
      "\u{1F4A5} Wipeout.";
    verdict.className = "rev-verdict " + (s.r >= 0 ? "good" : "bad");

    $("rev-pick-line").innerHTML = `You put it all on <b></b> in ${year}.`;
    $("rev-pick-line").querySelector("b").textContent = `${s.n} (${s.t})`;
    const ret = $("rev-return");
    ret.textContent = approx + fmtPct(s.r);
    ret.className = "rev-return tnum " + updown(s.r);
    $("rev-bankroll-line").textContent = fmt$(oldBank);

    const note = $("rev-note");
    if (s.note) { note.textContent = s.note; note.classList.remove("hidden"); }
    else note.classList.add("hidden");

    $("rev-best").innerHTML = `Best pick: <b></b> ${fmtPct(best.r)}`;
    $("rev-best").querySelector("b").textContent = `${best.n} (${best.t})`;
    $("rev-rank").innerHTML = `Your pick ranked <b>${rank}</b> of ${all.length}.`;
    $("rev-sp").innerHTML = `The S&amp;P 500 did <b>${fmtPct(sp)}</b> — you ${beatMarket ? "beat" : "trailed"} the market.`;

    $("next-btn").textContent = state.done ? "See Final Results" : "Next Spin";
    $("picker-panel").classList.add("hidden");
    $("confirm-bar").classList.add("hidden");
    $("reveal-modal").classList.remove("hidden");

    // Animate both the modal line and the header chip
    const chip = $("bankroll-chip");
    chip.className = "tnum bump " + updown(newBank - oldBank);
    animateBankroll(oldBank, newBank, [$("rev-bankroll-line"), chip], () => {
      chip.classList.remove("bump");
    });
    renderHeaderSpinOnly();
  }

  function renderHeaderSpinOnly() {
    $("spin-chip").textContent = `Spin ${Math.min(state.spinIndex + 1, SPINS)} of ${SPINS}`;
  }

  function nextSpin() {
    $("reveal-modal").classList.add("hidden");
    $("bankroll-chip").className = "tnum";
    if (state.done) showResults();
    else showWheel();
  }

  /* ---------- results ---------- */
  function benchmark() {
    let b = START_BANKROLL;
    for (const p of state.picks) b *= 1 + sp500Of(p.y) / 100;
    return Math.round(b);
  }

  function emojiLine() {
    return state.picks.map((p) => (p.r >= sp500Of(p.y) ? "\u{1F7E9}" : "\u{1F7E5}")).join("");
  }

  function shareText() {
    const pct = (state.bankroll / START_BANKROLL - 1) * 100;
    return [
      `Hedge and 0 ${state.seed}`,
      `${fmt$(state.bankroll)} (${fmtPct(pct)}) ${emojiLine()}`,
      state.picks.map((p) => shortYear(p.y)).join(" ") +
        ` · S&P would've made ${fmt$(benchmark())}`,
      "https://hedge-and-0.vercel.app/",
    ].join("\n");
  }

  function showResults() {
    $("game-screen").classList.add("hidden");
    $("reveal-modal").classList.add("hidden");

    const pct = (state.bankroll / START_BANKROLL - 1) * 100;
    $("res-bankroll").textContent = fmt$(state.bankroll);
    const sub = $("res-sub");
    sub.textContent = state.forfeited
      ? `Run ended after ${state.picks.length} of ${SPINS} spins — you left the page. ${emojiLine()}`
      : `${fmtPct(pct)} on your $1,000,000 · ${emojiLine()}`;
    sub.className = "results-sub " + updown(pct);
    $("res-bench").textContent =
      `Just holding the S&P 500 those ${SPINS} years: ${fmt$(benchmark())}`;

    const recap = $("res-recap");
    recap.innerHTML = "";
    let running = START_BANKROLL;
    for (const p of state.picks) {
      running = Math.round(running * (1 + p.r / 100));
      const s = findStock(p.y, p.t);
      const row = document.createElement("div");
      row.className = "recap-row";
      row.innerHTML =
        `<span class="ry">${shortYear(p.y)}</span><span class="rt"></span>` +
        `<span class="rr tnum ${updown(p.r)}">${fmtPct(p.r)}</span>` +
        `<span class="rb tnum">${fmt$(running)}</span>`;
      row.querySelector(".rt").textContent = s ? `${s.n} (${s.t})` : p.t;
      recap.appendChild(row);
    }

    $("results-modal").classList.remove("hidden");
    setResultsTab("daily");
  }

  function copyResults() {
    const text = shareText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        $("copy-results").textContent = "Copied!";
        setTimeout(() => { $("copy-results").textContent = "Copy Results to Share"; }, 1500);
      });
    } else {
      prompt("Copy your results:", text);
    }
  }

  function backToMenu() {
    // Keep the saved (finished) game so the one-play-per-day guard holds.
    $("results-modal").classList.add("hidden");
    $("game-screen").classList.add("hidden");
    $("setup-screen").classList.remove("hidden");
    initSetup();
  }

  /* ---------- leaderboard ---------- */
  function picksCompact() {
    return state.picks
      .map((p) => `${String(p.y).slice(2)}:${p.t}:${p.r}`)
      .join("|");
  }

  async function submitScore() {
    const res = await fetch(LB_API + "/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seed: state.seed, name: playerName(),
        bankroll: state.bankroll, picks: picksCompact(),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("submit failed: " + res.status);
    return res.json();
  }

  async function fetchDaily(seed) {
    const res = await fetch(`${LB_API}/scores?seed=${encodeURIComponent(seed)}`,
      { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("fetch failed: " + res.status);
    return res.json();
  }

  async function fetchAlltime() {
    const res = await fetch(`${LB_API}/alltime`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error("fetch failed: " + res.status);
    return res.json();
  }

  function renderLbList(el, entries, highlight, showDates) {
    el.innerHTML = "";
    if (!entries.length) {
      el.innerHTML = "<div class='lb-empty'>No fortunes yet — be the first!</div>";
      return;
    }
    const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
    let rank = 0, prev = null;
    entries.forEach((e, i) => {
      if (e.bankroll !== prev) { rank = i + 1; prev = e.bankroll; }
      const row = document.createElement("div");
      row.className = "lb-row" +
        (highlight && e.name.toLowerCase() === highlight.toLowerCase() ? " me" : "");
      const badge = rank <= 3 ? medals[rank - 1] : rank + ".";
      row.innerHTML =
        `<span class="lb-rank">${badge}</span>` +
        `<span class="lb-name"></span>` +
        (showDates && e.seed ? `<span class="lb-sub">${e.seed}</span>` : "") +
        `<span class="lb-score tnum">${fmt$(e.bankroll)}</span>`;
      row.querySelector(".lb-name").textContent = e.name;
      el.appendChild(row);
    });
  }

  function loadBoard(listEl, tab, canSubmit) {
    listEl.innerHTML = "<div class='lb-empty'>Loading…</div>";
    const { seed } = currentSeed();
    let p;
    if (tab === "alltime") {
      p = fetchAlltime().then((b) => renderLbList(listEl, b.entries, playerName(), true));
    } else if (canSubmit) {
      p = submitScore().then((b) => renderLbList(listEl, b.entries, playerName(), false));
    } else {
      p = fetchDaily(seed).then((b) => renderLbList(listEl, b.entries, playerName(), false));
    }
    p.catch(() => {
      listEl.innerHTML = "<div class='lb-empty'>Leaderboard unavailable right now.</div>";
    });
  }

  let resultsTab = "daily";
  function setResultsTab(tab) {
    resultsTab = tab;
    $("res-tab-daily").classList.toggle("active", tab === "daily");
    $("res-tab-alltime").classList.toggle("active", tab === "alltime");
    const canSubmit = tab === "daily" && !!playerName() && state && state.done && !state.overridden;
    $("lb-no-name").classList.toggle("hidden", !!playerName());
    loadBoard($("res-lb-list"), tab, canSubmit);
  }

  let lbTab = "daily";
  function setLbTab(tab) {
    lbTab = tab;
    $("lb-tab-daily").classList.toggle("active", tab === "daily");
    $("lb-tab-alltime").classList.toggle("active", tab === "alltime");
    loadBoard($("lb-list"), tab, false);
  }

  function openLeaderboard() {
    $("lb-date").textContent = "Daily game · " + currentSeed().seed;
    $("lb-modal").classList.remove("hidden");
    setLbTab("daily");
  }

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    forfeitIfAbandoned();
    initSetup();
    $("start-daily").addEventListener("click", startGame);
    $("show-lb").addEventListener("click", openLeaderboard);
    $("lb-close").addEventListener("click", () => $("lb-modal").classList.add("hidden"));
    $("spin-btn").addEventListener("click", spin);
    $("to-picker-btn").addEventListener("click", showPicker);
    $("stock-search").addEventListener("input", (e) => {
      filters.q = e.target.value;
      renderStockList(state.years[state.spinIndex]);
    });
    $("dow-toggle").addEventListener("change", (e) => {
      filters.dowOnly = e.target.checked;
      renderStockList(state.years[state.spinIndex]);
    });
    $("confirm-btn").addEventListener("click", lockIn);
    $("next-btn").addEventListener("click", nextSpin);
    $("copy-results").addEventListener("click", copyResults);
    $("back-to-menu").addEventListener("click", backToMenu);
    $("res-tab-daily").addEventListener("click", () => setResultsTab("daily"));
    $("res-tab-alltime").addEventListener("click", () => setResultsTab("alltime"));
    $("lb-tab-daily").addEventListener("click", () => setLbTab("daily"));
    $("lb-tab-alltime").addEventListener("click", () => setLbTab("alltime"));
  });
})();
