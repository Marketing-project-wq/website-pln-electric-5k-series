/* ==========================================================================
   speedland.js — Landstrike 200 m leaderboard (file name kept so shared
   links and cached pages keep working).

   Data: the public pln-5k endpoint, one event per city:
     ?mode=list&slug=<city slug>&limit=100[&offset=…]
   Rows: bib, name, sex, category, rank, time, time_ms, status.
   A 404 {"error":"event not found"} (or an empty list) is the normal state
   until that city's Landstrike Race Day — shown as a polite waiting message.
   No sample data, no timing-vendor calls from the browser.

   Categories: MALE / FEMALE (filter chips + ALL). Rank is computed within
   each category, fastest first, in both the city and the overall view.
   ========================================================================== */
(function () {
  'use strict';

  var mount = document.querySelector('[data-speedland-board]');
  if (!mount) return;

  var LANG = (window.EVENT_DATA && window.EVENT_DATA.LANG) || document.documentElement.lang || 'id';
  var API = 'https://cpvzwqptzcxnwzfzgrmt.supabase.co/functions/v1/pln-5k';
  var PAGE = 100;       // rows per request
  var MAX_PAGES = 10;   // safety cap per city (1,000 runners)
  var POLL_MS = 30000;

  // City -> Landstrike event slug. Add a city by adding a line here; it gets
  // its own tab and is merged into OVERALL automatically.
  var CITIES = [
    { key: 'jakarta', name: 'Jakarta', slug: 'pln-landstrike-jakarta' }
    // { key: 'yogyakarta', name: 'Yogyakarta', slug: 'pln-landstrike-yogya' },
    // { key: 'bali',       name: 'Bali',       slug: 'pln-landstrike-bali' }
  ];
  var CATS = ['MALE', 'FEMALE'];

  var T = LANG === 'id' ? {
    overall: 'Keseluruhan', all: 'Semua',
    search: 'Cari nama atau No. BIB…', searchLabel: 'Cari peserta',
    waiting: 'Hasil akan tampil di sini setelah Race Day Landstrike.',
    noMatch: 'Peserta tidak ditemukan.',
    noneInCat: 'Belum ada catatan waktu di kategori ini.',
    loading: 'Memuat…',
    offline: 'Hasil belum bisa dimuat saat ini. Halaman ini akan mencoba lagi otomatis.',
    live: 'LANGSUNG', bib: 'BIB'
  } : {
    overall: 'Overall', all: 'All',
    search: 'Search name or bib…', searchLabel: 'Search participants',
    waiting: 'Results will appear here after Landstrike Race Day.',
    noMatch: 'No participant found.',
    noneInCat: 'No times in this category yet.',
    loading: 'Loading…',
    offline: 'Results can\'t be loaded right now. This page will try again automatically.',
    live: 'LIVE', bib: 'BIB'
  };
  // Column headers stay English on both pages (same as Race Results).
  var COL = { rank: 'Rank', who: 'Participant', time: '200 M' };

  var filtersEl = document.querySelector('[data-speedland-filters]');
  var searchEl = document.querySelector('[data-speedland-search]');
  var statusEl = document.querySelector('[data-speedland-status]');

  var state = { view: 'overall', cat: '', q: '', data: {}, loaded: false, offline: false };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function catOf(r) {
    var c = String(r.category || '').toUpperCase().trim();
    if (c.indexOf('FEMALE') === 0) return 'FEMALE';
    if (c.indexOf('MALE') === 0) return 'MALE';
    var s = String(r.sex || '').toUpperCase().trim();
    if (/^(F|FEMALE|P|W)/.test(s)) return 'FEMALE';
    if (/^(M|MALE|L)/.test(s)) return 'MALE';
    return '';
  }
  function timeKey(r) { return typeof r.time_ms === 'number' ? r.time_ms : Infinity; }

  // ---- Fetch ----------------------------------------------------------------
  // Resolves to rows ([] when the event doesn't exist yet); rejects only on
  // real network/server failures.
  function fetchCity(city) {
    var rows = [];
    function page(n) {
      var url = API + '?mode=list&slug=' + encodeURIComponent(city.slug) + '&limit=' + PAGE + '&offset=' + (n * PAGE);
      return fetch(url, { cache: 'no-store' }).then(function (r) {
        if (r.status === 404) return { rows: [] };            // event not created yet
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (j) {
        var got = (j && j.rows) || [];
        rows = rows.concat(got);
        if (got.length === PAGE && n + 1 < MAX_PAGES) return page(n + 1);
        return rows;
      });
    }
    return page(0);
  }
  function refresh() {
    return Promise.all(CITIES.map(function (c) {
      return fetchCity(c).then(function (rows) { return { key: c.key, rows: rows, ok: true }; },
                               function () { return { key: c.key, ok: false }; });
    })).then(function (res) {
      var anyOk = false;
      res.forEach(function (x) {
        if (!x.ok) return;               // keep whatever that city showed last time
        anyOk = true;
        state.data[x.key] = x.rows.filter(function (r) { return r.status === 'ok' && r.time; })
          .map(function (r) { return { bib: r.bib, name: r.name, time: r.time, time_ms: r.time_ms, cat: catOf(r), city: x.key }; });
      });
      state.offline = !anyOk && !state.loaded;
      state.loaded = state.loaded || anyOk;
      paint();
    });
  }

  // ---- Ranking & rendering --------------------------------------------------
  // Competition ranking inside each category: equal times share a rank.
  function ranked(rows) {
    var out = rows.slice().sort(function (a, b) { return timeKey(a) - timeKey(b); });
    var n = {}, last = {};
    out.forEach(function (r) {
      var k = r.cat || '?';
      n[k] = (n[k] || 0) + 1;
      r.rank = last[k] && last[k].t === timeKey(r) ? last[k].rank : n[k];
      last[k] = { t: timeKey(r), rank: r.rank };
    });
    return out;
  }
  function cityName(key) { for (var i = 0; i < CITIES.length; i++) if (CITIES[i].key === key) return CITIES[i].name; return key; }
  function message(text) { mount.innerHTML = '<p class="results-message">' + esc(text) + '</p>'; }

  function paint() {
    var overall = state.view === 'overall';
    var all = [];
    Object.keys(state.data).forEach(function (k) { if (overall || k === state.view) all = all.concat(state.data[k]); });
    var any = all.length > 0;

    if (statusEl) {
      statusEl.textContent = any ? T.live : '';
      statusEl.className = 'sl-status sl-status--live';
      statusEl.hidden = !any;
    }

    if (!state.loaded) { message(state.offline ? T.offline : T.loading); return; }
    if (!any) { message(T.waiting); return; }

    var list = ranked(all);
    if (state.cat) list = list.filter(function (r) { return r.cat === state.cat; });
    if (state.q) {
      var q = state.q.toLowerCase();
      list = list.filter(function (r) { return String(r.bib).toLowerCase().indexOf(q) >= 0 || String(r.name || '').toLowerCase().indexOf(q) >= 0; });
    }
    if (!list.length) { message(state.q ? T.noMatch : T.noneInCat); return; }

    var multiCity = overall && CITIES.length > 1;
    mount.innerHTML = '<div class="table-wrap"><table class="data data--speedland"><thead><tr>' +
      '<th>' + COL.rank + '</th><th>' + COL.who + '</th><th class="num">' + COL.time + '</th></tr></thead><tbody>' +
      list.map(function (r) {
        return '<tr' + (r.rank <= 3 ? ' class="sl-podium-' + r.rank + '"' : '') + '>' +
          '<td data-label="' + COL.rank + '" class="rank">' + r.rank + '</td>' +
          '<td data-label="' + COL.who + '"><strong>' + esc(r.name) + '</strong>' +
            '<span class="sl-meta">' + T.bib + ' ' + esc(r.bib) + (multiCity ? ' · ' + esc(cityName(r.city)) : '') +
            (r.cat ? ' <span class="cat-badge">' + r.cat + '</span>' : '') + '</span></td>' +
          '<td data-label="' + COL.time + '" class="num sl-time">' + esc(r.time) + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  // ---- Controls ---------------------------------------------------------------
  function chips(items, attr, current) {
    return items.map(function (c) {
      return '<button class="gallery-filter" type="button" ' + attr + '="' + esc(c.k) + '" aria-pressed="' + (c.k === current) + '">' + esc(c.label.toUpperCase()) + '</button>';
    }).join('');
  }
  if (filtersEl) {
    filtersEl.innerHTML =
      '<div class="sl-chips" role="group">' + chips([{ k: 'overall', label: T.overall }].concat(CITIES.map(function (c) { return { k: c.key, label: c.name }; })), 'data-view', state.view) + '</div>' +
      '<div class="sl-chips" role="group">' + chips([{ k: '', label: T.all }].concat(CATS.map(function (c) { return { k: c, label: c }; })), 'data-cat', state.cat) + '</div>';
    filtersEl.addEventListener('click', function (e) {
      var v = e.target.closest('[data-view]'), c = e.target.closest('[data-cat]');
      if (v) { state.view = v.getAttribute('data-view'); filtersEl.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === v)); }); }
      else if (c) { state.cat = c.getAttribute('data-cat'); filtersEl.querySelectorAll('[data-cat]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === c)); }); }
      else return;
      paint();
    });
  }
  if (searchEl) {
    searchEl.innerHTML = '<input type="search" class="results-search__input" placeholder="' + esc(T.search) + '" aria-label="' + esc(T.searchLabel) + '" autocomplete="off">';
    searchEl.querySelector('input').addEventListener('input', function () { state.q = this.value.trim(); paint(); });
  }

  // ---- Polling (paused while the tab is hidden) -------------------------------
  var timer = null;
  function start() { if (!timer && !document.hidden) timer = setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS); }
  function stop() { clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else { refresh(); start(); } });

  paint();
  refresh();
  start();
})();
