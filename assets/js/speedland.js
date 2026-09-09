/* ==========================================================================
   speedland.js — 200 m speed-test leaderboard (the "road to" trial).
   Self-initialising. Reads window.EVENT_DATA.speedland, fetches the feibot
   timing feed, and renders a searchable, city-filterable board.

   LIVE FEED — feibot "scores-data" endpoint. Confirmed envelope:
     { code, msg, race:{…}, item_check_points:[…], scores:[…] }
   Each scores[] row is one participant. The fields used here:
     bib, name, sex, city, item_name,
     total_score (gun time, "HH:MM:SS"), net_score (chip time, "HH:MM:SS"),
     finisher (status flag), finish_time.
   normalize() below is the single place that maps a payload to leaderboard
   rows. It also still understands the older "teams-data" envelope
   ({ teams, team_scores }) as a fallback. The raw payload is logged to the
   console on every fetch.

   The board falls back to the seeded SAMPLE field in data.js whenever no feed
   is configured, the feed is empty, or it is unreachable — so the layout is
   always populated.
   ========================================================================== */
(function () {
  'use strict';

  var mount = document.querySelector('[data-speedland-board]');
  var D = window.EVENT_DATA;
  if (!mount || !D || !D.speedland) return;

  var LANG = D.LANG || 'id';
  var CFG = D.speedland;
  var T = (CFG.ui && CFG.ui[LANG]) || {};

  var filtersEl = document.querySelector('[data-speedland-filters]');
  var searchEl = document.querySelector('[data-speedland-search]');
  var statusEl = document.querySelector('[data-speedland-status]');
  var noteEl = document.querySelector('[data-speedland-note]');

  var CITY_NAME = {};
  (D.cities || []).forEach(function (c) { CITY_NAME[c.key] = c.name; });

  // ---- Small helpers ------------------------------------------------------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function cityLabel(key) { return key && CITY_NAME[key] ? CITY_NAME[key] : '—'; }
  function notEmpty(v) { return v != null && v !== ''; }

  // Parse a clock string / number into seconds.
  //   "HH:MM:SS(.hh)" -> h*3600 + m*60 + s   ·   "MM:SS(.hh)" -> m*60 + s
  //   "SS(.hh)" or a number -> as-is (seconds). Comma decimals accepted.
  function toSeconds(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var str = String(v).trim();
    if (!str) return null;
    if (str.indexOf(':') >= 0) {
      var parts = str.split(':');
      var sec = 0;
      for (var i = 0; i < parts.length; i++) sec = sec * 60 + (parseFloat(parts[i].replace(',', '.')) || 0);
      return sec;
    }
    var n = parseFloat(str.replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  // Seconds -> clean display: "27", "27.48", "5:45", "1:02.10", "1:56:21".
  function fmtTime(sec) {
    if (sec == null || isNaN(sec)) return '—';
    sec = Math.max(0, Number(sec));
    var totalHund = Math.round(sec * 100);
    var hund = totalHund % 100;
    var totalSec = (totalHund - hund) / 100;
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    var frac = hund > 0 ? '.' + p2(hund) : '';
    if (h > 0) return h + ':' + p2(m) + ':' + p2(s) + frac;
    if (m > 0) return m + ':' + p2(s) + frac;
    return s + frac;
  }

  function normalizeCity(v) {
    if (!v) return null;
    var s = String(v).toLowerCase();
    if (s.indexOf('jak') >= 0 || s.indexOf('jkt') >= 0) return 'jakarta';
    if (s.indexOf('yog') >= 0 || s.indexOf('jog') >= 0 || s.indexOf('diy') >= 0) return 'yogyakarta';
    if (s.indexOf('bal') >= 0 || s.indexOf('dps') >= 0 || s.indexOf('den') >= 0) return 'bali';
    return null; // unknown -> still counts in Overall, just no city filter
  }

  // ---- feibot payload -> leaderboard entries ------------------------------
  // ONE place to maintain. Each entry: { id, name, city, gender, timeSec, … }.
  function normalize(payload) {
    if (!payload) return [];
    var scores = payload.scores || (payload.data && payload.data.scores);
    if (Array.isArray(scores)) return normalizeScores(scores);
    return normalizeTeams(payload); // legacy "teams-data" fallback
  }

  // scores-data: individual results. Rank by chip (net) time, else gun time.
  function normalizeScores(scores) {
    var out = [];
    scores.forEach(function (s) {
      if (!s) return;
      var raw = notEmpty(s.net_score) ? s.net_score : (notEmpty(s.total_score) ? s.total_score : null);
      var timeSec = toSeconds(raw);
      if (timeSec == null || timeSec <= 0) return; // no time yet (DNS / not finished) -> skip
      var bib = notEmpty(s.bib) ? String(s.bib) : (s.id != null ? String(s.id) : '');
      var nm = s.name != null ? String(s.name).trim() : '';
      out.push({
        id: bib,
        name: nm || bib || ('#' + (s.id || '')),
        city: normalizeCity(s.city),
        gender: s.sex || s.gender || null,
        timeSec: timeSec,
        status: s.finisher,
        item: s.item_name || null
      });
    });
    return out;
  }

  // teams-data: { teams:[], team_scores:[] } — kept for compatibility.
  function pickField(obj, names) {
    if (!obj) return undefined;
    for (var i = 0; i < names.length; i++) if (obj[names[i]] != null) return obj[names[i]];
    return undefined;
  }
  function normalizeTeams(payload) {
    var teams = payload.teams || (payload.data && payload.data.teams) || [];
    var scores = payload.team_scores || (payload.data && payload.data.team_scores) || [];
    if (!Array.isArray(teams)) teams = [];
    if (!Array.isArray(scores)) scores = [];
    var teamById = {};
    teams.forEach(function (t) { var id = pickField(t, ['id', 'team_id', 'teamId', 'uid', 'no']); if (id != null) teamById[String(id)] = t; });
    var source = scores.length ? scores : teams;
    var out = [];
    source.forEach(function (row) {
      var ref = pickField(row, ['team_id', 'teamId', 'id', 'team', 'tid']);
      var team = (ref != null && teamById[String(ref)]) ? teamById[String(ref)] : (scores.length ? null : row);
      function F(names) { var a = pickField(row, names); return a != null ? a : (team ? pickField(team, names) : undefined); }
      var timeSec = toSeconds(F(['net_score', 'total_score', 'time', 'duration', 'result', 'best', 'best_time', 'score', 'seconds', 'elapsed']));
      if (timeSec == null || timeSec <= 0) return;
      var id = pickField(row, ['bib', 'no', 'number']); if (id == null) id = ref;
      out.push({
        id: id, name: F(['name', 'team_name', 'teamName', 'title', 'team', 'group', 'nama']) || ('#' + (id != null ? id : out.length + 1)),
        city: normalizeCity(F(['city', 'location', 'region', 'venue', 'kota'])), gender: F(['sex', 'gender']) || null, timeSec: timeSec
      });
    });
    return out;
  }

  // ---- State & rendering --------------------------------------------------
  var entries = [];
  var current = 'overall';
  var query = '';

  function useDemo() { entries = (CFG.demo || []).slice(); }

  function ranked() {
    var list = entries.slice();
    if (current !== 'overall') list = list.filter(function (e) { return e.city === current; });
    list.sort(function (a, b) { return a.timeSec - b.timeSec; });
    if (query) {
      var q = query.toLowerCase();
      list = list.filter(function (e) { return String(e.name || '').toLowerCase().indexOf(q) >= 0 || String(e.id || '').toLowerCase().indexOf(q) >= 0; });
    }
    return list;
  }

  function paint() {
    var isOverall = current === 'overall';
    var list = ranked();
    var head = isOverall ? [T.rank, T.team, T.city, T.time] : [T.rank, T.team, T.time];
    var body = list.map(function (e, idx) {
      var rank = idx + 1;
      var podium = (!query && rank <= 3) ? ' sl-podium-' + rank : '';
      var cityCell = isOverall ? '<td data-label="' + esc(T.city) + '">' + esc(cityLabel(e.city)) + '</td>' : '';
      return '<tr class="sl-row' + podium + '">' +
        '<td data-label="' + esc(T.rank) + '" class="rank">' + rank + '</td>' +
        '<td data-label="' + esc(T.team) + '">' + esc(e.name) + '</td>' +
        cityCell +
        '<td data-label="' + esc(T.time) + '" class="num sl-time">' + fmtTime(e.timeSec) + '</td>' +
      '</tr>';
    }).join('');
    if (!list.length) body = '<tr><td class="sl-empty" colspan="' + head.length + '">' + esc(T.empty) + '</td></tr>';
    mount.innerHTML = '<div class="table-wrap results-scroll"><table class="data data--speedland"><thead><tr><th>' + head.join('</th><th>') + '</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function syncFilters() {
    if (!filtersEl) return;
    filtersEl.querySelectorAll('[data-sl-view]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-sl-view') === current));
    });
  }

  function renderFilters() {
    if (!filtersEl) return;
    var views = [{ k: 'overall', label: T.overall }].concat(
      (D.cities || []).slice().sort(function (a, b) { return a.order - b.order; })
        .map(function (c) { return { k: c.key, label: c.name }; })
    );
    filtersEl.innerHTML = views.map(function (v) {
      return '<button class="gallery-filter" type="button" data-sl-view="' + esc(v.k) + '" aria-pressed="' + (v.k === current) + '">' + esc(v.label) + '</button>';
    }).join('');
    filtersEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sl-view]');
      if (!b) return;
      current = b.getAttribute('data-sl-view');
      syncFilters();
      paint();
    });
  }

  function renderSearch() {
    if (!searchEl) return;
    searchEl.innerHTML = '<input type="search" class="results-search__input" placeholder="' + esc(T.search) + '" aria-label="' + esc(T.search) + '">';
    var inp = searchEl.querySelector('input');
    inp.addEventListener('input', function () { query = inp.value.trim(); paint(); });
  }

  function setStatus(kind) {
    if (!statusEl) return;
    var label = kind === 'live' ? T.live : kind === 'loading' ? T.loading : T.sample;
    statusEl.className = 'sl-status ' + (kind === 'live' ? 'sl-status--live' : 'sl-status--sample');
    statusEl.textContent = label;
    // The "sample field" note only applies while the board is not live.
    if (noteEl) noteEl.hidden = (kind === 'live');
  }

  // ---- Live feed ----------------------------------------------------------
  // Which endpoint(s) to fetch: per-city tokens if set, else a single url,
  // else the vendor sample feed when opted in with ?speedland=sample.
  function feedTargets() {
    var api = CFG.api || {};
    var targets = [];
    if (api.byCity) Object.keys(api.byCity).forEach(function (k) { if (api.byCity[k]) targets.push({ url: api.byCity[k], city: k }); });
    if (!targets.length && api.url) targets.push({ url: api.url });
    if (!targets.length && api.sampleUrl) {
      try {
        var qs = new URLSearchParams(location.search);
        if ((qs.get('speedland') || qs.get('feed')) === 'sample') targets.push({ url: api.sampleUrl });
      } catch (e) {}
    }
    return targets;
  }

  function fetchLive() {
    var targets = feedTargets();
    if (!targets.length) return; // no feed configured -> stay on demo
    setStatus('loading');
    Promise.all(targets.map(function (t) {
      return fetch(t.url, { headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (payload) {
          try { console.info('[Speedland] feibot payload (' + (t.city || 'all') + '):', payload); } catch (e) {}
          var rows = normalize(payload);
          if (t.city) rows.forEach(function (row) { if (!row.city) row.city = t.city; });
          return rows;
        });
    })).then(function (lists) {
      var live = [].concat.apply([], lists);
      if (live.length) { entries = live; setStatus('live'); }
      else { useDemo(); setStatus('sample'); }
      paint();
      if (CFG.api && CFG.api.pollMs > 0) setTimeout(fetchLive, CFG.api.pollMs);
    })['catch'](function (err) {
      try { console.warn('[Speedland] feibot fetch failed — showing sample field.', err); } catch (e) {}
      if (!entries.length) useDemo();
      setStatus('sample');
      paint();
    });
  }

  // ---- Boot ---------------------------------------------------------------
  useDemo();
  renderFilters();
  renderSearch();
  paint();
  setStatus('sample');
  fetchLive();
})();
