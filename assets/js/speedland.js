/* ==========================================================================
   speedland.js — 200 m speed-test leaderboard (the "road to" trial).
   Self-initialising. Reads window.EVENT_DATA.speedland, fetches the feibot
   timing feed, and renders a searchable, city-filterable board.

   LIVE FEED — feibot "scores-data" endpoint. Confirmed envelope:
     { code, msg, race:{…}, item_check_points:[…], scores:[…] }
   Each scores[] row is one participant: bib, name, sex, city, item_name,
   total_score (gun time "HH:MM:SS"), net_score (chip time), finisher, plus
   per-lap splits (loop_a_format). normalize() maps a payload to rows; it also
   understands the older "teams-data" envelope as a fallback.

   THREE display modes, chosen automatically from the data each fetch:
     • leaderboard — any row has a time -> ranked by time (LIVE)
     • roster      — real names but no times yet -> start list by bib
     • sample      — only placeholder names / no data -> seeded demo field
   The raw payload is logged to the console on every fetch.
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
  // A "real" name is present and not just the bib repeated (feibot seeds
  // placeholder rows where name === bib, e.g. "001").
  function isRealName(e) { return e.name && String(e.name).trim() !== '' && String(e.name).trim() !== String(e.id); }
  function byBib(a, b) { var na = parseInt(a.id, 10), nb = parseInt(b.id, 10); if (!isNaN(na) && !isNaN(nb)) return na - nb; return String(a.id).localeCompare(String(b.id)); }
  function byTime(a, b) { return (a.timeSec == null ? 1e12 : a.timeSec) - (b.timeSec == null ? 1e12 : b.timeSec); }

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

  // scores-data: individual rows. Keep every row (timed or not); the display
  // mode decides what to show. Rank by chip (net) time, else gun time.
  function normalizeScores(scores) {
    var out = [];
    var itemFilter = (CFG.api && CFG.api.itemFilter) ? String(CFG.api.itemFilter).toLowerCase() : null;
    scores.forEach(function (s) {
      if (!s) return;
      if (itemFilter) {
        var it = String(s.item_name || s.item || '').toLowerCase();
        if (it.indexOf(itemFilter) < 0) return; // keep only the configured item (e.g. the 200 m sprint)
      }
      var raw = notEmpty(s.net_score) ? s.net_score : (notEmpty(s.total_score) ? s.total_score : null);
      var timeSec = toSeconds(raw);
      if (timeSec != null && timeSec <= 0) timeSec = null; // treat 0 as "no time yet"
      var bib = notEmpty(s.bib) ? String(s.bib) : (s.id != null ? String(s.id) : '');
      var nm = s.name != null ? String(s.name).trim() : '';
      var splits = [];
      if (Array.isArray(s.loop_a_format)) {
        splits = s.loop_a_format.map(function (l) { return { label: 'Lap ' + l.lap_number, totalSec: toSeconds(l.total_time) }; });
      } else if (Array.isArray(s.loop_a)) {
        splits = s.loop_a.map(function (t, i) { return { label: 'Lap ' + (i + 1), totalSec: toSeconds(t) }; });
      }
      splits = splits.filter(function (x) { return x.totalSec != null; });
      out.push({
        id: bib,
        name: nm || bib || ('#' + (s.id || '')),
        city: normalizeCity(s.city),
        gender: s.sex || s.gender || null,
        timeSec: timeSec,
        pace: notEmpty(s.pace) ? s.pace : null,
        status: s.finisher,
        item: s.item_name || null,
        splits: splits
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
      if (timeSec != null && timeSec <= 0) timeSec = null;
      var id = pickField(row, ['bib', 'no', 'number']); if (id == null) id = ref;
      out.push({
        id: id, name: F(['name', 'team_name', 'teamName', 'title', 'team', 'group', 'nama']) || ('#' + (id != null ? id : out.length + 1)),
        city: normalizeCity(F(['city', 'location', 'region', 'venue', 'kota'])), gender: F(['sex', 'gender']) || null, timeSec: timeSec, splits: []
      });
    });
    return out;
  }

  // ---- State & rendering --------------------------------------------------
  var entries = [];
  var lastList = [];   // rows currently painted (index -> entry), for row clicks
  var mode = 'sample'; // 'live' | 'roster' | 'sample'
  var current = 'overall';
  var query = '';

  // Stamp an overall rank (position by time) on every entry — for the modal.
  function reindex() {
    entries.slice().sort(byTime).forEach(function (e, i) { e._overallRank = i + 1; });
  }
  function useDemo() { entries = (CFG.demo || []).slice(); mode = 'sample'; reindex(); }

  // Cities actually present in the current data (so single-city / no-city
  // feeds don't show empty city tabs).
  function citiesPresent() {
    var seen = {};
    entries.forEach(function (e) { if (e.city) seen[e.city] = 1; });
    return (D.cities || []).slice().sort(function (a, b) { return a.order - b.order; })
      .filter(function (c) { return seen[c.key]; });
  }

  function ranked() {
    var list = entries.slice();
    if (current !== 'overall') list = list.filter(function (e) { return e.city === current; });
    list.sort(mode === 'roster' ? byBib : byTime);
    if (query) {
      var q = query.toLowerCase();
      list = list.filter(function (e) { return String(e.name || '').toLowerCase().indexOf(q) >= 0 || String(e.id || '').toLowerCase().indexOf(q) >= 0; });
    }
    return list;
  }

  function paint() {
    var isOverall = current === 'overall';
    var roster = mode === 'roster';
    var list = ranked();
    lastList = list;
    var firstCol = roster ? T.bib : T.rank;
    var head = isOverall ? [firstCol, T.team, T.city, T.time] : [firstCol, T.team, T.time];
    var body = list.map(function (e, idx) {
      var rowClass = 'sl-row', firstCell;
      if (roster) {
        firstCell = '<td data-label="' + esc(T.bib) + '" class="rank">' + esc(e.id) + '</td>';
      } else {
        var rank = idx + 1;
        if (!query && rank <= 3) rowClass += ' sl-podium-' + rank;
        firstCell = '<td data-label="' + esc(T.rank) + '" class="rank">' + rank + '</td>';
      }
      var cityCell = isOverall ? '<td data-label="' + esc(T.city) + '">' + esc(cityLabel(e.city)) + '</td>' : '';
      var timeCell = '<td data-label="' + esc(T.time) + '" class="num sl-time">' + (e.timeSec != null ? fmtTime(e.timeSec) : '—') + '</td>';
      return '<tr class="' + rowClass + '" tabindex="0" role="button" data-idx="' + idx + '" aria-label="' + esc(e.name) + '">' +
        firstCell + '<td data-label="' + esc(T.team) + '">' + esc(e.name) + '</td>' + cityCell + timeCell + '</tr>';
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
    var cities = citiesPresent();
    if (current !== 'overall' && cities.map(function (c) { return c.key; }).indexOf(current) < 0) current = 'overall';
    var views = [{ k: 'overall', label: T.overall }].concat(cities.map(function (c) { return { k: c.key, label: c.name }; }));
    filtersEl.innerHTML = views.map(function (v) {
      return '<button class="gallery-filter" type="button" data-sl-view="' + esc(v.k) + '" aria-pressed="' + (v.k === current) + '">' + esc(v.label) + '</button>';
    }).join('');
  }
  function wireFilters() {
    if (!filtersEl) return;
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
    var label = kind === 'live' ? T.live : kind === 'roster' ? T.roster : kind === 'loading' ? T.loading : T.sample;
    var cls = kind === 'live' ? 'sl-status--live' : kind === 'roster' ? 'sl-status--roster' : 'sl-status--sample';
    statusEl.className = 'sl-status ' + cls;
    statusEl.textContent = label;
    // The "sample field" note only applies while the board shows the demo.
    if (noteEl) noteEl.hidden = (kind !== 'sample');
  }

  // ---- Participant detail modal (reuses the .modal / .rd-* component) ------
  var slModal, slBody, slLastFocus;
  function genderLabel(g) { if (!g) return '—'; g = String(g).toUpperCase(); return g === 'M' ? T.male : g === 'F' ? T.female : g; }

  function splitTable(splits) {
    if (!splits || !splits.length) return '';
    var prev = 0, rows = '';
    for (var i = 0; i < splits.length; i++) {
      var sp = splits[i];
      if (sp.totalSec == null) continue;
      var delta = sp.totalSec - prev; prev = sp.totalSec;
      rows += '<tr><td>' + esc(sp.label) + '</td><td class="num">' + fmtTime(delta) + '</td><td class="num">' + fmtTime(sp.totalSec) + '</td></tr>';
    }
    if (!rows) return '';
    return '<div class="rd-splits"><h3>' + esc(T.splits) + '</h3><div class="table-wrap"><table class="rd-table"><thead><tr><th>' + esc(T.point) + '</th><th class="num">' + esc(T.split) + '</th><th class="num">' + esc(T.total) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  function buildModal() {
    if (slModal) return;
    slModal = document.createElement('div');
    slModal.className = 'modal'; slModal.id = 'sl-modal';
    slModal.setAttribute('role', 'dialog'); slModal.setAttribute('aria-modal', 'true'); slModal.setAttribute('aria-labelledby', 'sl-modal-name');
    slModal.innerHTML = '<div class="modal__overlay" data-close></div><div class="modal__dialog modal__dialog--wide"><button class="modal__close" type="button" data-close aria-label="' + esc(T.close) + '">✕</button><div data-sl-detail></div></div>';
    document.body.appendChild(slModal);
    slBody = slModal.querySelector('[data-sl-detail]');
    slModal.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeDetail(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && slModal.classList.contains('is-open')) closeDetail(); });
  }

  function openDetail(e) {
    if (!e) return;
    buildModal();
    var cat = e.item || (CFG.distanceM ? CFG.distanceM + ' m' : '—');
    var rank = e._overallRank && e.timeSec != null ? '#' + e._overallRank : '—';
    slBody.innerHTML =
      '<span class="rd-bib">' + esc(e.id || '—') + '</span>' +
      '<h2 class="rd-name" id="sl-modal-name">' + esc(e.name || '') + '</h2>' +
      '<div class="rd-top">' +
        '<div class="rd-finish">' +
          '<span class="rd-finish__label">' + esc(cat) + '</span>' +
          '<span class="rd-finish__time">' + (e.timeSec != null ? fmtTime(e.timeSec) : '—') + '</span>' +
          '<div class="rd-ranks">' +
            '<span>' + esc(T.rank) + '<b>' + rank + '</b></span>' +
            '<span>' + esc(T.city) + '<b>' + esc(cityLabel(e.city)) + '</b></span>' +
            '<span>' + esc(T.pace) + '<b>' + esc(e.pace || '—') + '</b></span>' +
          '</div>' +
        '</div>' +
        '<div class="rd-meta">' +
          '<div><dt>' + esc(T.city) + '</dt><dd>' + esc(cityLabel(e.city)) + '</dd></div>' +
          '<div><dt>' + esc(T.gender) + '</dt><dd>' + esc(genderLabel(e.gender)) + '</dd></div>' +
          '<div><dt>' + esc(T.category) + '</dt><dd>' + esc(cat) + '</dd></div>' +
          '<div><dt>' + esc(T.status) + '</dt><dd>' + esc(e.timeSec != null ? T.finished : T.registered) + '</dd></div>' +
        '</div>' +
      '</div>' +
      splitTable(e.splits);
    slLastFocus = document.activeElement;
    slModal.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
    var c = slModal.querySelector('.modal__close'); if (c) c.focus();
  }

  function closeDetail() {
    if (!slModal) return;
    slModal.classList.remove('is-open');
    document.documentElement.style.overflow = ''; document.body.style.overflow = '';
    if (slLastFocus && slLastFocus.focus) slLastFocus.focus();
  }

  function wireDetail() {
    mount.addEventListener('click', function (e) { var tr = e.target.closest('.sl-row[data-idx]'); if (tr) openDetail(lastList[+tr.getAttribute('data-idx')]); });
    mount.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { var tr = e.target.closest('.sl-row[data-idx]'); if (tr) { e.preventDefault(); openDetail(lastList[+tr.getAttribute('data-idx')]); } }
    });
  }

  // ---- Live feed ----------------------------------------------------------
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

  function apply(live) {
    var timed = live.filter(function (e) { return e.timeSec != null; });
    var named = live.filter(isRealName);
    if (timed.length) { entries = timed; mode = 'live'; reindex(); setStatus('live'); }
    else if (named.length) { entries = named; mode = 'roster'; setStatus('roster'); }
    else { useDemo(); setStatus('sample'); }
    renderFilters();
    paint();
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
      apply([].concat.apply([], lists));
      if (CFG.api && CFG.api.pollMs > 0) setTimeout(fetchLive, CFG.api.pollMs);
    })['catch'](function (err) {
      try { console.warn('[Speedland] feibot fetch failed — showing sample field.', err); } catch (e) {}
      if (!entries.length || mode === 'sample') { useDemo(); setStatus('sample'); renderFilters(); paint(); }
    });
  }

  // ---- Boot ---------------------------------------------------------------
  useDemo();
  wireFilters();
  renderFilters();
  renderSearch();
  wireDetail();
  paint();
  setStatus('sample');
  fetchLive();
})();
