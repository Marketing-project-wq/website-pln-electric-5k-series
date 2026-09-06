/* ==========================================================================
   live-tracking.js — Live course map (Leaflet) with a full runner field.
   Self-initialising. Reads window.EVENT_DATA.liveTracking (real TMII route +
   checkpoints + a ~200-runner demo field) and animates every runner along the
   real route on a canvas layer, with a searchable live leaderboard.

   Route + timing points are the real surveyed course. Runner positions are a
   SIMULATION — on race day they come from the chip-timing feed.
   Requires Leaflet (vendored at /assets/vendor/leaflet/).
   ========================================================================== */
(function () {
  'use strict';

  var mapEl = document.querySelector('[data-live-map]');
  var D = window.EVENT_DATA;
  if (!mapEl || !D || !D.liveTracking) return;

  var LANG = D.LANG || 'id';
  var CFG = D.liveTracking;
  var T = (CFG.ui && CFG.ui[LANG]) || {};
  var loc = D.loc || function (o) { return o ? (o[LANG] != null ? o[LANG] : o.id) : ''; };
  var board = document.querySelector('[data-live-board]');

  var route = CFG.route || [];
  var checkpoints = (CFG.checkpoints || []).slice().sort(function (a, b) { return a.frac - b.frac; });
  var runners = CFG.runners || [];
  var leaderFinish = runners.reduce(function (m, r) { return Math.min(m, r.finishSec); }, Infinity);
  var animSeconds = CFG.animSeconds || 24;
  var TOP_N = 12, MAX_RESULTS = 40;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clock(sec) { sec = Math.max(0, Math.round(sec)); return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function tier(r) { return r.finishSec < 1200 ? '#8CD867' : r.finishSec < 1800 ? '#22C3D6' : '#3FA9F5'; }
  var HL = '#F2D024';

  // ---- Route distance table (interpolate a latlng at fraction f) ----------
  function hav(a, b) {
    var R = 6371000, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180;
    var la1 = a[0] * Math.PI / 180, la2 = b[0] * Math.PI / 180;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  var cum = [0];
  for (var i = 1; i < route.length; i++) cum.push(cum[i - 1] + hav(route[i - 1], route[i]));
  var totalLen = cum[cum.length - 1] || 1;
  function latlngAt(frac) {
    if (!route.length) return [0, 0];
    var target = Math.max(0, Math.min(1, frac)) * totalLen;
    for (var j = 1; j < route.length; j++) {
      if (cum[j] >= target) {
        var seg = cum[j] - cum[j - 1] || 1, t = (target - cum[j - 1]) / seg;
        return [route[j - 1][0] + (route[j][0] - route[j - 1][0]) * t, route[j - 1][1] + (route[j][1] - route[j - 1][1]) * t];
      }
    }
    return route[route.length - 1];
  }
  function durationFor(r) { return animSeconds * (r.finishSec / leaderFinish); }
  function progressFor(r, e) { return Math.min(e / durationFor(r), 1); }
  function lastCheckpoint(p) {
    var last = checkpoints[0];
    for (var k = 0; k < checkpoints.length; k++) if (checkpoints[k].frac <= p + 1e-9) last = checkpoints[k];
    return last;
  }

  // ---- Map ----------------------------------------------------------------
  var map = null, dots = [], hlMarker = null, selectedBib = null;
  var L = window.L;
  if (L) {
    map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
    }).addTo(map);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.9 }).addTo(map);

    L.polyline(route, { color: '#0A0A0A', weight: 11, opacity: 0.45, lineJoin: 'round', lineCap: 'round' }).addTo(map);
    L.polyline(route, { color: '#1FE0D6', weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);
    if (CFG.speed200) L.polyline(CFG.speed200, { color: '#FF4D4D', weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(map).bindTooltip('200 m Speed', { direction: 'top', className: 'lt-tip' });

    checkpoints.forEach(function (cp, idx) {
      var start = idx === 0, finish = idx === checkpoints.length - 1;
      L.circleMarker([cp.lat, cp.lng], { radius: start || finish ? 8 : 6, color: '#0A0A0A', weight: 2, fillColor: start ? '#8CD867' : finish ? '#F2D024' : '#1FE0D6', fillOpacity: 1 })
        .addTo(map).bindTooltip(loc(cp.label), { permanent: true, direction: 'top', className: 'lt-tip' + (start || finish ? ' lt-tip--key' : '') });
    });
    (CFG.pois || []).forEach(function (p) {
      L.circleMarker([p.lat, p.lng], { radius: 6, color: '#0A0A0A', weight: 2, fillColor: '#2CA6E0', fillOpacity: 1 }).addTo(map).bindTooltip(loc(p.label), { direction: 'top', className: 'lt-tip lt-tip--poi' });
    });

    // Runner field on a fast canvas renderer.
    var canvas = L.canvas({ padding: 0.5 });
    dots = runners.map(function (r) {
      return L.circleMarker(latlngAt(0), { renderer: canvas, radius: 4, weight: 0, fillColor: tier(r), fillOpacity: 0.85 }).addTo(map);
    });

    // Highlight marker (follows the selected runner).
    hlMarker = L.marker(latlngAt(0), {
      icon: L.divIcon({ className: 'lt-hl', html: '<span class="lt-hl__pulse"></span><span class="lt-hl__dot"></span>', iconSize: [26, 26], iconAnchor: [13, 13] }),
      interactive: false, keyboard: false, zIndexOffset: 2000, opacity: 0
    }).addTo(map);

    if (route.length) map.fitBounds(L.latLngBounds(route), { padding: [34, 34] });
    setTimeout(function () { map.invalidateSize(); }, 0);
  }

  function selectedIndex() {
    if (selectedBib == null) return -1;
    for (var i = 0; i < runners.length; i++) if (runners[i].bib === selectedBib) return i;
    return -1;
  }
  // Dot styling. With nothing focused, every runner shows clearly. Once a
  // runner is clicked (selectedBib) OR a search is active (query), the focused
  // runner(s) stay bright and everyone else fades to a faint "shadow".
  function applyDotStyles() {
    if (!map) return;
    var focus = !!query || selectedBib != null;
    for (var i = 0; i < runners.length; i++) {
      var r = runners[i], d = dots[i];
      var sel = r.bib === selectedBib;
      var match = query && (r.bib.indexOf(query) >= 0 || r.name.toLowerCase().indexOf(query) >= 0);
      if (!focus) {
        d.setStyle({ radius: 5, weight: 1, color: 'rgba(0,0,0,0.55)', fillColor: tier(r), fillOpacity: 0.95 });
      } else if (sel) {
        d.setStyle({ radius: 8, weight: 2, color: '#0A0A0A', fillColor: HL, fillOpacity: 1 });
        d.bringToFront();
      } else if (match) {
        d.setStyle({ radius: 6, weight: 1, color: '#0A0A0A', fillColor: tier(r), fillOpacity: 1 });
        d.bringToFront();
      } else {
        d.setStyle({ radius: 3, weight: 0, fillColor: '#8792A0', fillOpacity: 0.14 });   // bayangan
      }
    }
    if (hlMarker) hlMarker.setOpacity(selectedIndex() >= 0 ? 1 : 0);
  }

  function positionMarkers(elapsed) {
    if (!map) return;
    for (var i = 0; i < runners.length; i++) dots[i].setLatLng(latlngAt(progressFor(runners[i], elapsed)));
    var idx = selectedIndex();
    if (idx >= 0 && hlMarker) hlMarker.setLatLng(latlngAt(progressFor(runners[idx], elapsed)));
  }

  // ---- Board (built once; only rows + count update) -----------------------
  var rowsEl = null, countEl = null, emptyEl = null, searchEl = null, query = '';
  function buildBoard() {
    if (!board) return;
    board.innerHTML =
      '<div class="lt-board__head">' + esc(T.board || 'Live Board') +
        ' <span class="lt-count" data-lt-count></span> <span class="lt-sim">' + esc(T.sim || 'SIMULATION') + '</span></div>' +
      '<div class="lt-search"><input type="search" class="lt-search__input" data-lt-search placeholder="' +
        esc(LANG === 'id' ? 'Cari No. BIB atau nama…' : 'Search bib or name…') + '" aria-label="' +
        esc(LANG === 'id' ? 'Cari peserta' : 'Search participants') + '" autocomplete="off"></div>' +
      '<div class="table-wrap lt-board__scroll"><table class="lt-table"><thead><tr><th>#</th><th>' +
        esc(T.bib || 'Bib') + '</th><th>' + esc(T.name || 'Name') + '</th><th>' + esc(T.last || 'Last Detected') +
        '</th><th>' + esc(T.clock || 'Time') + '</th></tr></thead><tbody data-lt-rows></tbody></table></div>' +
      '<p class="lt-empty" data-lt-empty hidden>' + esc(LANG === 'id' ? 'Peserta tidak ditemukan.' : 'No participant found.') + '</p>';
    rowsEl = board.querySelector('[data-lt-rows]');
    countEl = board.querySelector('[data-lt-count]');
    emptyEl = board.querySelector('[data-lt-empty]');
    searchEl = board.querySelector('[data-lt-search]');
    if (countEl) countEl.textContent = '· ' + runners.length + ' ' + (LANG === 'id' ? 'peserta' : 'participants');
    if (searchEl) searchEl.addEventListener('input', function () { query = searchEl.value.trim().toLowerCase(); renderRows(lastElapsed); applyDotStyles(); });
    if (rowsEl) rowsEl.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-bib]'); if (!tr) return;
      var bib = tr.getAttribute('data-bib');
      selectRunner(selectedBib === bib ? null : bib);
    });
  }

  function renderRows(elapsed) {
    if (!rowsEl) return;
    // Rank the whole field by progress, then filter/slice for display.
    var all = runners.map(function (r) {
      var p = progressFor(r, elapsed);
      return { r: r, p: p };
    }).sort(function (a, b) { return b.p - a.p; });

    var list = all, filtered = false;
    if (query) {
      filtered = true;
      list = all.filter(function (x) { return x.r.bib.indexOf(query) >= 0 || x.r.name.toLowerCase().indexOf(query) >= 0; });
    }
    var shown = list.slice(0, filtered ? MAX_RESULTS : TOP_N);

    if (emptyEl) emptyEl.hidden = !(filtered && shown.length === 0);
    rowsEl.innerHTML = shown.map(function (x, i) {
      var p = x.p, done = p >= 1, rank = all.indexOf(x) + 1;
      var last = loc(lastCheckpoint(p).label);
      var status = done ? (T.finished || 'Finished') : (p > 0 ? (T.running || 'Running') : (T.waiting || ''));
      return '<tr data-bib="' + esc(x.r.bib) + '" class="' + (x.r.bib === selectedBib ? 'is-selected ' : '') + (done ? 'is-finished' : '') + '">' +
        '<td class="lt-pos">' + rank + '</td>' +
        '<td><span class="lt-swatch" style="background:' + tier(x.r) + '"></span>' + esc(x.r.bib) + '</td>' +
        '<td class="lt-name">' + esc(x.r.name) + '</td>' +
        '<td>' + esc(last) + ' <span class="lt-status ' + (done ? 'lt-status--done' : 'lt-status--run') + '">' + esc(status) + '</span></td>' +
        '<td class="lt-time">' + clock(p * x.r.finishSec) + '</td></tr>';
    }).join('');
  }

  function selectRunner(bib) {
    selectedBib = bib;
    applyDotStyles();
    var idx = selectedIndex();
    if (idx >= 0 && map) { var ll = latlngAt(progressFor(runners[idx], lastElapsed)); hlMarker.setLatLng(ll); map.panTo(ll, { animate: true }); }
    renderRows(lastElapsed);
  }

  // ---- Animation ----------------------------------------------------------
  var elapsed = 0, lastElapsed = 0, lastTs = null, playing = false, raf = null, lastBoard = -1;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var toggleBtn = document.querySelector('[data-lt-toggle]');
  var restartBtn = document.querySelector('[data-lt-restart]');

  function allDone(e) { for (var i = 0; i < runners.length; i++) if (progressFor(runners[i], e) < 1) return false; return true; }
  function draw(e) {
    lastElapsed = e;
    positionMarkers(e);
    if (lastBoard < 0 || Math.abs(e - lastBoard) >= 0.25 || allDone(e)) { renderRows(e); lastBoard = e; }
  }
  function setToggle(on) { if (toggleBtn) { toggleBtn.textContent = on ? (T.pause || 'Pause') : (T.play || 'Play'); toggleBtn.setAttribute('aria-pressed', String(on)); } }
  function tick(ts) {
    if (lastTs == null) lastTs = ts;
    elapsed += (ts - lastTs) / 1000; lastTs = ts;
    draw(elapsed);
    if (playing && !allDone(elapsed)) raf = requestAnimationFrame(tick);
    else { playing = false; setToggle(false); }
  }
  function play() { if (playing) return; if (allDone(elapsed)) elapsed = 0; playing = true; lastTs = null; setToggle(true); raf = requestAnimationFrame(tick); }
  function pause() { playing = false; if (raf) cancelAnimationFrame(raf); setToggle(false); }
  function restart() { pause(); elapsed = 0; draw(0); play(); }

  if (toggleBtn) toggleBtn.addEventListener('click', function () { playing ? pause() : play(); });
  if (restartBtn) restartBtn.addEventListener('click', restart);

  buildBoard();
  applyDotStyles();
  if (reduce) { draw(animSeconds * 0.5); setToggle(false); }
  else {
    draw(0);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) { entries.forEach(function (en) { if (en.isIntersecting) { play(); io.disconnect(); } }); }, { threshold: 0.3 });
      io.observe(mapEl);
    } else { play(); }
  }
})();
