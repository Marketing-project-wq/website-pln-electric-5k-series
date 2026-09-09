/* ==========================================================================
   speedland.js — 200 m speed-test leaderboard (the "road to" trial).
   Self-initialising. Reads window.EVENT_DATA.speedland, fetches the feibot
   "teams-data" endpoint, and renders a searchable, city-filterable board.

   The vendor envelope is confirmed as:
     { code: "ok", msg: "ok", teams: [], team_scores: [] }
   The arrays are empty until the trial is timed, and the SHAPE OF EACH ROW
   inside teams[] / team_scores[] is not yet known. normalize() below is the
   single place that maps those rows into leaderboard entries — it tries the
   most likely field names and is safe to adjust once real data appears (open
   the browser console: the raw payload is logged on every fetch).

   While the feed is empty / unreachable, the board falls back to the seeded
   SAMPLE field in data.js so the layout is always populated.
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

  // Format a 200 m time (seconds) as "SS.hh" or, if over a minute, "M:SS.hh".
  function fmt200(sec) {
    if (sec == null || isNaN(sec)) return '—';
    sec = Math.max(0, Number(sec));
    var m = Math.floor(sec / 60);
    var s = sec - m * 60;
    if (m > 0) return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
    return s.toFixed(2);
  }

  // ---- feibot payload -> leaderboard entries ------------------------------
  // ONE place to maintain. Each entry: { id, name, city, timeSec }.
  function pickField(obj, names) {
    if (!obj) return undefined;
    for (var i = 0; i < names.length; i++) if (obj[names[i]] != null) return obj[names[i]];
    return undefined;
  }

  // Parse a time value into seconds. Accepts a number (seconds; large values
  // are treated as milliseconds) or a string ("mm:ss.hh", "ss.hh", "ss,hh").
  // NOTE: confirm the vendor's unit once real rows arrive.
  function toSeconds(v) {
    if (v == null) return null;
    if (typeof v === 'number') {
      if (!isFinite(v)) return null;
      return v > 300 ? v / 1000 : v; // a 200 m split is never > 300 s -> ms
    }
    var str = String(v).trim();
    if (!str) return null;
    if (str.indexOf(':') >= 0) {
      var p = str.split(':');
      return (parseFloat(p[0]) || 0) * 60 + (parseFloat(p[1].replace(',', '.')) || 0);
    }
    var n = parseFloat(str.replace(',', '.'));
    return isNaN(n) ? null : (n > 300 ? n / 1000 : n);
  }

  function normalizeCity(v) {
    if (!v) return null;
    var s = String(v).toLowerCase();
    if (s.indexOf('jak') >= 0 || s.indexOf('jkt') >= 0) return 'jakarta';
    if (s.indexOf('yog') >= 0 || s.indexOf('jog') >= 0 || s.indexOf('diy') >= 0) return 'yogyakarta';
    if (s.indexOf('bal') >= 0 || s.indexOf('dps') >= 0 || s.indexOf('den') >= 0) return 'bali';
    return null; // unknown -> still counts in Overall, just no city filter
  }

  function normalize(payload) {
    if (!payload) return [];
    var teams = payload.teams || payload.data && payload.data.teams || [];
    var scores = payload.team_scores || payload.data && payload.data.team_scores || [];
    if (!Array.isArray(teams)) teams = [];
    if (!Array.isArray(scores)) scores = [];

    // Index teams by id so score rows can borrow their name/city.
    var teamById = {};
    teams.forEach(function (t) {
      var id = pickField(t, ['id', 'team_id', 'teamId', 'uid', 'no']);
      if (id != null) teamById[String(id)] = t;
    });

    var source = scores.length ? scores : teams;
    var out = [];
    source.forEach(function (row) {
      var ref = pickField(row, ['team_id', 'teamId', 'id', 'team', 'tid']);
      var team = (ref != null && teamById[String(ref)]) ? teamById[String(ref)] : (scores.length ? null : row);
      function F(names) { var a = pickField(row, names); return a != null ? a : (team ? pickField(team, names) : undefined); }

      var name = F(['name', 'team_name', 'teamName', 'title', 'team', 'group', 'nama']);
      var city = normalizeCity(F(['city', 'location', 'region', 'venue', 'kota']));
      var timeSec = toSeconds(F(['time', 'duration', 'result', 'best', 'best_time', 'bestTime', 'seconds', 'sec', 'elapsed', 'score', 'ms', 'millis']));
      var id = pickField(row, ['bib', 'no', 'number']);
      if (id == null) id = ref;
      if (timeSec == null) return; // no usable time -> skip
      out.push({ id: id, name: name || ('#' + (id != null ? id : out.length + 1)), city: city, timeSec: timeSec });
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
        '<td data-label="' + esc(T.time) + '" class="num sl-time">' + fmt200(e.timeSec) + '</td>' +
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
  function fetchLive() {
    if (!CFG.api || !CFG.api.url) return;
    setStatus('loading');
    fetch(CFG.api.url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (payload) {
        try { console.info('[Speedland] feibot raw payload:', payload); } catch (e) {}
        var live = normalize(payload);
        if (live.length) { entries = live; setStatus('live'); }
        else { useDemo(); setStatus('sample'); }
        paint();
        if (CFG.api.pollMs > 0) setTimeout(fetchLive, CFG.api.pollMs);
      })
      .catch(function (err) {
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
