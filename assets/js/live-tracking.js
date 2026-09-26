/* ==========================================================================
   live-tracking.js — Live course map (Leaflet) + live board from real timing.

   Data: public pln-5k endpoint
     ?mode=track&slug=pln-jakarta&limit=100[&q=…]
   -> { on_course, finished, total, rows:[{ bib, name, category, finished,
        last_label, last_time, last_distance_m, cp_count, checkpoints }] }
   Rows arrive sorted: furthest along first, then fastest.

   Positions are NOT tracked by GPS. The only fact we have is the last timing
   mat each runner crossed, so the map shows runners AT that mat (KM 1–4 or
   Finish), one marker per mat with a count. No interpolation, no animation
   between mats, no guessed positions. There is no simulated data.

   Board polls every 20 s, paused while the tab is hidden. Search goes to the
   server (&q=); the page never filters the field itself.
   Requires Leaflet (vendored at /assets/vendor/leaflet/).
   ========================================================================== */
(function () {
  'use strict';

  var mapEl = document.querySelector('[data-live-map]');
  var D = window.EVENT_DATA;
  if (!mapEl || !D || !D.liveTracking) return;

  var API = 'https://cpvzwqptzcxnwzfzgrmt.supabase.co/functions/v1/pln-5k';
  var SLUG = 'pln-jakarta';
  var LIMIT = 100;
  var POLL_MS = 20000;

  var LANG = D.LANG || 'id';
  var isID = LANG === 'id';
  var CFG = D.liveTracking;
  var T = (CFG.ui && CFG.ui[LANG]) || {};
  var loc = D.loc || function (o) { return o ? (o[LANG] != null ? o[LANG] : o.id) : ''; };
  var board = document.querySelector('[data-live-board]');

  var S = isID ? {
    onCourse: 'di lintasan', finished: 'finis',
    runners: function (n, plus) { return n + (plus ? '+' : '') + ' pelari'; },
    empty: 'Belum ada pelari yang terdeteksi. Papan terisi begitu pelari pertama melewati KM 1.',
    noMatch: 'Peserta tidak ditemukan.',
    loading: 'Memuat data langsung…',
    offline: 'Data langsung belum bisa dimuat. Halaman ini akan mencoba lagi otomatis.',
    search: 'Cari No. BIB atau nama…', searchLabel: 'Cari peserta',
    partial: 'Jumlah dengan tanda + adalah jumlah minimal: papan hanya memuat pelari terdepan.'
  } : {
    onCourse: 'on course', finished: 'finished',
    runners: function (n, plus) { return n + (plus ? '+' : '') + (n === 1 && !plus ? ' runner' : ' runners'); },
    empty: 'No runners detected yet. The board fills once the first runner crosses KM 1.',
    noMatch: 'No participant found.',
    loading: 'Loading live data…',
    offline: 'Live data can\'t be loaded right now. This page will try again automatically.',
    search: 'Search bib or name…', searchLabel: 'Search participants',
    partial: 'Counts marked + are minimums: the board only loads the runners furthest ahead.'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var route = CFG.route || [];
  var checkpoints = (CFG.checkpoints || []).slice().sort(function (a, b) { return a.frac - b.frac; });
  // Timing mats a runner can be placed at (KM 1–4 + Finish), keyed by distance.
  var mats = checkpoints.filter(function (cp) { return cp.dist; });
  var matByDist = {};
  mats.forEach(function (cp) { matByDist[cp.dist] = cp; });
  var FINISH_DIST = mats.length ? mats[mats.length - 1].dist : 5000;

  // The mat a row was last detected at, or null when it can't be told for
  // sure (then the runner stays on the board but is not placed on the map).
  function matOf(r) {
    if (r.finished) return matByDist[FINISH_DIST] || null;
    var d = Number(r.last_distance_m);
    if (d && matByDist[d]) return matByDist[d];
    var m = /^\s*KM\s*(\d+)\s*$/i.exec(String(r.last_label || ''));
    if (m && matByDist[Number(m[1]) * 1000]) return matByDist[Number(m[1]) * 1000];
    if (/^\s*FINISH\s*$/i.test(String(r.last_label || ''))) return matByDist[FINISH_DIST] || null;
    return null;
  }

  // ---- Map ----------------------------------------------------------------
  var map = null, L = window.L, matMarkers = {}, hlMarker = null;
  if (L) {
    map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.9 }).addTo(map);

    L.polyline(route, { color: '#0A0A0A', weight: 11, opacity: 0.45, lineJoin: 'round', lineCap: 'round' }).addTo(map);
    L.polyline(route, { color: '#1FE0D6', weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);
    if (CFG.speed200) L.polyline(CFG.speed200, { color: '#FF4D4D', weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(map).bindTooltip('200 m Speed', { direction: 'top', className: 'lt-tip' });

    // Label placement so the counts stay readable on small screens: Finish
    // sits just below Start, and KM 2 / KM 3 are close together.
    var TIP_DIR = { 3000: 'bottom', 5000: 'bottom' };
    checkpoints.forEach(function (cp, idx) {
      var start = idx === 0, finish = idx === checkpoints.length - 1;
      var mk = L.circleMarker([cp.lat, cp.lng], { radius: start || finish ? 8 : 6, color: '#0A0A0A', weight: 2, fillColor: start ? '#8CD867' : finish ? '#F2D024' : '#1FE0D6', fillOpacity: 1 })
        .addTo(map).bindTooltip(esc(loc(cp.label)), { permanent: true, direction: TIP_DIR[cp.dist] || 'top', className: 'lt-tip' + (start || finish ? ' lt-tip--key' : '') });
      if (cp.dist) matMarkers[cp.dist] = mk;
    });
    (CFG.pois || []).forEach(function (p) {
      L.circleMarker([p.lat, p.lng], { radius: 6, color: '#0A0A0A', weight: 2, fillColor: '#2CA6E0', fillOpacity: 1 }).addTo(map).bindTooltip(esc(loc(p.label)), { direction: 'top', className: 'lt-tip lt-tip--poi' });
    });

    // Spotlight for a selected runner: sits ON their last mat, never between.
    hlMarker = L.marker([checkpoints[0].lat, checkpoints[0].lng], {
      icon: L.divIcon({ className: 'lt-hl', html: '<span class="lt-hl__pulse"></span><span class="lt-hl__dot"></span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      interactive: false, keyboard: false, zIndexOffset: 2000, opacity: 0
    }).addTo(map);

    // Extra room on the left: Start/Finish sit at the route's west edge and
    // their labels ("Finish · 1,234 runners") must not be clipped.
    if (route.length) map.fitBounds(L.latLngBounds(route), { paddingTopLeft: [110, 44], paddingBottomRight: [34, 34] });
    setTimeout(function () { map.invalidateSize(); }, 0);
  }

  // One label per mat: "KM 2 · 143 runners" (count with "+" when the loaded
  // rows don't cover the whole field). Finish uses the exact `finished` total.
  function updateMap(all) {
    if (!map) return;
    var counts = {};
    all.rows.forEach(function (r) { var m = matOf(r); if (m) counts[m.dist] = (counts[m.dist] || 0) + 1; });
    var partial = all.rows.length < all.total;
    mats.forEach(function (cp) {
      var mk = matMarkers[cp.dist]; if (!mk) return;
      var n, plus = false;
      if (cp.dist === FINISH_DIST && typeof all.finished === 'number') n = all.finished;
      else { n = counts[cp.dist] || 0; plus = partial && n > 0; }
      var label = esc(loc(cp.label)) + (n > 0 ? ' · ' + esc(S.runners(n, plus)) : '');
      mk.setTooltipContent(label);
      mk.setStyle({ radius: n > 0 ? 9 : (cp.dist === FINISH_DIST ? 8 : 6) });
    });
    if (partialEl) partialEl.hidden = !(partial && all.rows.some(function (r) { return !r.finished; }));
  }

  // ---- Board --------------------------------------------------------------
  var rowsEl, countEl, emptyEl, searchEl, partialEl, wrapEl;
  var query = '', selectedBib = null;
  var latestAll = null;      // unfiltered response (map, header, ranks)
  var latestBoard = null;    // response for the current search (or the unfiltered one)
  var loaded = false, offline = false;

  function buildBoard() {
    if (!board) return;
    board.innerHTML =
      '<div class="lt-board__head">' + esc(T.board || 'Live Board') + ' <span class="lt-count" data-lt-count></span></div>' +
      '<div class="lt-search"><input type="search" class="lt-search__input" data-lt-search placeholder="' + esc(S.search) + '" aria-label="' + esc(S.searchLabel) + '" autocomplete="off"></div>' +
      '<div class="table-wrap lt-board__scroll" data-lt-wrap><table class="lt-table"><thead><tr><th>#</th><th>' +
        esc(T.bib || 'Bib') + '</th><th>' + esc(T.name || 'Name') + '</th><th>' + esc(T.last || 'Last Detected') +
        '</th><th class="lt-time">' + esc(T.clock || 'Time') + '</th></tr></thead><tbody data-lt-rows></tbody></table></div>' +
      '<p class="lt-empty" data-lt-empty hidden></p>' +
      '<p class="lt-partial" data-lt-partial hidden>' + esc(S.partial) + '</p>';
    rowsEl = board.querySelector('[data-lt-rows]');
    countEl = board.querySelector('[data-lt-count]');
    emptyEl = board.querySelector('[data-lt-empty]');
    searchEl = board.querySelector('[data-lt-search]');
    partialEl = board.querySelector('[data-lt-partial]');
    wrapEl = board.querySelector('[data-lt-wrap]');
    var deb;
    searchEl.addEventListener('input', function () {
      clearTimeout(deb);
      var v = searchEl.value.trim();
      deb = setTimeout(function () { if (v !== query) { query = v; refresh(); } }, 350);
    });
    rowsEl.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-bib]'); if (!tr) return;
      var bib = tr.getAttribute('data-bib');
      select(selectedBib === bib ? null : bib);
    });
    rowsEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var tr = e.target.closest('tr[data-bib]'); if (!tr) return;
      e.preventDefault(); var bib = tr.getAttribute('data-bib'); select(selectedBib === bib ? null : bib);
    });
  }

  function renderBoard() {
    if (!rowsEl) return;
    if (countEl) countEl.textContent = latestAll
      ? '· ' + latestAll.on_course + ' ' + S.onCourse + ' · ' + latestAll.finished + ' ' + S.finished : '';
    var msg = '';
    var rows = latestBoard ? latestBoard.rows : [];
    if (!loaded) msg = offline ? S.offline : S.loading;
    else if (!rows.length) msg = query ? S.noMatch : S.empty;
    emptyEl.textContent = msg;
    emptyEl.hidden = !msg;
    wrapEl.hidden = !!msg;
    if (msg) { rowsEl.innerHTML = ''; return; }

    // "#" = place in the whole field (server order). For a search result that
    // isn't among the loaded leaders the place is unknown, so it shows "–".
    var place = {};
    if (latestAll) latestAll.rows.forEach(function (r, i) { place[r.bib] = i + 1; });
    rowsEl.innerHTML = rows.map(function (r, i) {
      var pos = query ? (place[r.bib] || '–') : i + 1;
      return '<tr data-bib="' + esc(r.bib) + '" tabindex="0" class="' + (r.bib === selectedBib ? 'is-selected ' : '') + (r.finished ? 'is-finished' : '') + '">' +
        '<td class="lt-pos">' + pos + '</td>' +
        '<td>' + esc(r.bib) + '</td>' +
        '<td class="lt-name">' + esc(r.name || '—') + '</td>' +
        '<td>' + (r.finished
          ? '<span class="lt-status lt-status--done">' + esc(T.finished || 'FINISHED') + '</span>'
          : esc(r.last_label || '—')) + '</td>' +
        '<td class="lt-time">' + esc(r.last_time || '—') + '</td></tr>';
    }).join('');
  }

  function findRow(bib) {
    var lists = [latestBoard, latestAll];
    for (var i = 0; i < lists.length; i++) {
      if (!lists[i]) continue;
      for (var j = 0; j < lists[i].rows.length; j++) if (lists[i].rows[j].bib === bib) return lists[i].rows[j];
    }
    return null;
  }
  function placeSpotlight(pan) {
    if (!hlMarker) return;
    var r = selectedBib != null ? findRow(selectedBib) : null;
    var m = r ? matOf(r) : null;
    if (m) { hlMarker.setLatLng([m.lat, m.lng]); hlMarker.setOpacity(1); if (pan && map) map.panTo([m.lat, m.lng], { animate: true }); }
    else hlMarker.setOpacity(0);
  }
  function select(bib) { selectedBib = bib; renderBoard(); placeSpotlight(true); }

  // ---- Fetch / poll ---------------------------------------------------------
  function fetchTrack(q) {
    var url = API + '?mode=track&slug=' + SLUG + '&limit=' + LIMIT + (q ? '&q=' + encodeURIComponent(q) : '');
    return fetch(url, { cache: 'no-store' }).then(function (res) {
      if (res.status === 404) return { on_course: 0, finished: 0, total: 0, rows: [] }; // event not set up yet
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (j) {
      return {
        on_course: Number(j && j.on_course) || 0,
        finished: Number(j && j.finished) || 0,
        total: Number(j && j.total) || 0,
        rows: (j && Array.isArray(j.rows)) ? j.rows : []
      };
    });
  }
  var seq = 0;
  function refresh() {
    var my = ++seq, q = query;
    // Always load the unfiltered leaders (map, header, places); when searching,
    // load the matches for the board as well.
    Promise.all([fetchTrack(''), q ? fetchTrack(q) : null]).then(function (res) {
      if (my !== seq) return;
      latestAll = res[0];
      latestBoard = q ? res[1] : res[0];
      loaded = true; offline = false;
      renderBoard(); updateMap(latestAll); placeSpotlight(false);
    }, function () {
      if (my !== seq) return;
      if (!loaded) { offline = true; renderBoard(); }
      // otherwise keep showing the last good data
    });
  }

  var timer = null;
  function start() { if (!timer && !document.hidden) timer = setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS); }
  function stop() { clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else { refresh(); start(); } });

  buildBoard();
  renderBoard();
  refresh();
  start();
})();
