/* ==========================================================================
   live-tracking.js — Live course map (Leaflet) with animated runners.
   Self-initialising. Reads window.EVENT_DATA.liveTracking (real TMII route +
   checkpoints from the organiser's KML) and animates demo runner markers along
   the real route, keeping a live leaderboard in sync.

   The ROUTE and timing points are the real surveyed course. Runner positions
   are a SIMULATION — on race day they come from the chip-timing feed.
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
  var animSeconds = CFG.animSeconds || 30;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clock(sec) { sec = Math.max(0, Math.round(sec)); return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---- Distance table for interpolating a position at fraction f ----------
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
    if (route.length === 0) return [0, 0];
    var target = Math.max(0, Math.min(1, frac)) * totalLen;
    for (var j = 1; j < route.length; j++) {
      if (cum[j] >= target) {
        var seg = cum[j] - cum[j - 1] || 1;
        var t = (target - cum[j - 1]) / seg;
        return [route[j - 1][0] + (route[j][0] - route[j - 1][0]) * t,
                route[j - 1][1] + (route[j][1] - route[j - 1][1]) * t];
      }
    }
    return route[route.length - 1];
  }

  function durationFor(r) { return animSeconds * (r.finishSec / leaderFinish); }
  function progressFor(r, elapsed) { return Math.min(elapsed / durationFor(r), 1); }
  function lastCheckpoint(p) {
    var last = checkpoints[0];
    for (var k = 0; k < checkpoints.length; k++) if (checkpoints[k].frac <= p + 1e-9) last = checkpoints[k];
    return last;
  }

  // ---- Leaflet map --------------------------------------------------------
  var map = null, runnerMarkers = [];
  var L = window.L;
  if (L) {
    map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics'
    }).addTo(map);
    // Optional place/road labels over the imagery (fails gracefully if blocked).
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, opacity: 0.9
    }).addTo(map);

    // Route: glow underlay + solid line.
    L.polyline(route, { color: '#0A0A0A', weight: 11, opacity: 0.45, lineJoin: 'round', lineCap: 'round' }).addTo(map);
    L.polyline(route, { color: '#1FE0D6', weight: 5, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }).addTo(map);

    // 200 m speed segment (highlighted).
    if (CFG.speed200) L.polyline(CFG.speed200, { color: '#FF4D4D', weight: 6, opacity: 0.95, lineCap: 'round' }).addTo(map)
      .bindTooltip('200 m Speed', { direction: 'top', className: 'lt-tip' });

    // Timing points.
    checkpoints.forEach(function (cp, idx) {
      var start = idx === 0, finish = idx === checkpoints.length - 1;
      var fill = start ? '#8CD867' : finish ? '#F2D024' : '#1FE0D6';
      L.circleMarker([cp.lat, cp.lng], { radius: start || finish ? 8 : 6, color: '#0A0A0A', weight: 2, fillColor: fill, fillOpacity: 1 })
        .addTo(map).bindTooltip(loc(cp.label), { permanent: true, direction: 'top', className: 'lt-tip' + (start || finish ? ' lt-tip--key' : '') });
    });

    // POIs (water station, etc.).
    (CFG.pois || []).forEach(function (p) {
      L.circleMarker([p.lat, p.lng], { radius: 6, color: '#0A0A0A', weight: 2, fillColor: '#2CA6E0', fillOpacity: 1 })
        .addTo(map).bindTooltip(loc(p.label), { direction: 'top', className: 'lt-tip lt-tip--poi' });
    });

    // Runner markers (divIcons; positioned each frame).
    runnerMarkers = runners.map(function (r) {
      var icon = L.divIcon({
        className: 'lt-rmark',
        html: '<span class="lt-rmark__halo" style="background:' + r.color + '"></span><span class="lt-rmark__dot" style="background:' + r.color + '"></span>',
        iconSize: [24, 24], iconAnchor: [12, 12]
      });
      return L.marker(latlngAt(0), { icon: icon, keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(map);
    });

    if (route.length) map.fitBounds(L.latLngBounds(route), { padding: [34, 34] });
    setTimeout(function () { map.invalidateSize(); }, 0);
  }

  function positionMarkers(elapsed) {
    if (!map) return;
    runners.forEach(function (r, idx) {
      var p = progressFor(r, elapsed);
      runnerMarkers[idx].setLatLng(latlngAt(p));
      var elm = runnerMarkers[idx].getElement && runnerMarkers[idx].getElement();
      if (elm) elm.classList.toggle('is-finished', p >= 1);
    });
  }

  // ---- Live board ---------------------------------------------------------
  function renderBoard(elapsed) {
    if (!board) return;
    var rows = runners.map(function (r) {
      var p = progressFor(r, elapsed);
      var cp = lastCheckpoint(p);
      var done = p >= 1;
      return { r: r, p: p, last: loc(cp.label), time: clock(p * r.finishSec),
        status: done ? (T.finished || 'Finished') : (p > 0 ? (T.running || 'Running') : (T.waiting || '')), done: done };
    }).sort(function (a, b) { return b.p - a.p; });

    var head = '<thead><tr><th>#</th><th>' + esc(T.bib || 'Bib') + '</th><th>' + esc(T.name || 'Name') +
      '</th><th>' + esc(T.last || 'Last Detected') + '</th><th>' + esc(T.clock || 'Time') + '</th></tr></thead>';
    var body = rows.map(function (row, idx) {
      return '<tr class="' + (row.done ? 'is-finished' : '') + '">' +
        '<td class="lt-pos">' + (idx + 1) + '</td>' +
        '<td><span class="lt-swatch" style="background:' + esc(row.r.color) + '"></span>' + esc(row.r.bib) + '</td>' +
        '<td class="lt-name">' + esc(row.r.name) + '</td>' +
        '<td>' + esc(row.last) + ' <span class="lt-status ' + (row.done ? 'lt-status--done' : 'lt-status--run') + '">' + esc(row.status) + '</span></td>' +
        '<td class="lt-time">' + esc(row.time) + '</td></tr>';
    }).join('');
    board.innerHTML = '<div class="lt-board__head">' + esc(T.board || 'Live Board') +
      ' <span class="lt-sim">' + esc(T.sim || 'SIMULATION') + '</span></div>' +
      '<div class="table-wrap"><table class="lt-table">' + head + '<tbody>' + body + '</tbody></table></div>';
  }

  // ---- Animation loop -----------------------------------------------------
  var elapsed = 0, lastTs = null, playing = false, raf = null, lastBoard = -1;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var toggleBtn = document.querySelector('[data-lt-toggle]');
  var restartBtn = document.querySelector('[data-lt-restart]');

  function allDone(e) { for (var i = 0; i < runners.length; i++) if (progressFor(runners[i], e) < 1) return false; return true; }
  function draw(e) {
    positionMarkers(e);
    if (lastBoard < 0 || Math.abs(e - lastBoard) >= 0.25 || allDone(e)) { renderBoard(e); lastBoard = e; }
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

  if (reduce) {
    draw(animSeconds * 0.45);
    setToggle(false);
  } else {
    draw(0);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { play(); io.disconnect(); } });
      }, { threshold: 0.3 });
      io.observe(mapEl);
    } else { play(); }
  }
})();
