/* ==========================================================================
   live-tracking.js — DEMO course map with animated runners.
   Self-initialising (like countdown.js / accordion.js). Reads the demo config
   from data.js (window.EVENT_DATA.liveTracking) and animates marker dots along
   the SVG route path (#lt-route), keeping a live "leaderboard" in sync.

   This is a SIMULATION. On race day the runner positions come from the chip
   timing feed (feibot API) and the route path is replaced with the real course.
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

  var route = mapEl.querySelector('#lt-route');
  var cpLayer = mapEl.querySelector('[data-lt-checkpoints]');
  var runnerLayer = mapEl.querySelector('[data-lt-runners]');
  var board = document.querySelector('[data-live-board]');
  if (!route || !cpLayer || !runnerLayer) return;

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
    return e;
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clock(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return pad2(m) + ':' + pad2(s);
  }
  function esc(str) {
    return String(str).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var LEN = route.getTotalLength();
  var checkpoints = CFG.checkpoints || [];
  var maxKm = checkpoints.length ? checkpoints[checkpoints.length - 1].km : 5;
  var runners = (CFG.runners || []).map(function (r) { return r; });
  var leaderFinish = runners.reduce(function (m, r) { return Math.min(m, r.finishSec); }, Infinity);
  var animSeconds = CFG.animSeconds || 26;

  // Distance (km) -> point on the path.
  function pointAtKm(km) { return route.getPointAtLength((km / maxKm) * LEN); }

  // ---- Draw checkpoints (the antenna/decoder timing points) ---------------
  checkpoints.forEach(function (cp, i) {
    var p = pointAtKm(cp.km);
    var isStart = i === 0, isFinish = i === checkpoints.length - 1;
    var fill = isStart ? '#8CD867' : isFinish ? '#F2D024' : 'var(--color-ink, #0A0A0A)';
    var g = svg('g', { 'class': 'lt-cp' });
    g.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 9, 'class': 'lt-cp__ring' }));
    g.appendChild(svg('circle', { cx: p.x, cy: p.y, r: 5.5, 'class': 'lt-cp__dot', fill: fill }));
    var label = isStart || isFinish ? loc(cp.label) : String(cp.km);
    var txt = svg('text', {
      x: p.x, y: p.y - 15, 'class': 'lt-cp__label' + (isStart || isFinish ? ' lt-cp__label--key' : ''),
      'text-anchor': 'middle'
    });
    txt.textContent = label;
    g.appendChild(txt);
    cpLayer.appendChild(g);
  });

  // ---- Create runner markers ----------------------------------------------
  var markers = runners.map(function (r) {
    var g = svg('g', { 'class': 'lt-runner' });
    g.appendChild(svg('circle', { r: 11, 'class': 'lt-runner__pulse', fill: r.color }));
    g.appendChild(svg('circle', { r: 6, 'class': 'lt-runner__dot', fill: r.color }));
    var t = svg('text', { 'class': 'lt-runner__bib', 'text-anchor': 'middle', y: -14 });
    t.textContent = r.bib;
    g.appendChild(t);
    runnerLayer.appendChild(g);
    return g;
  });

  function durationFor(r) { return animSeconds * (r.finishSec / leaderFinish); }
  function progressFor(r, elapsed) { return Math.min(elapsed / durationFor(r), 1); }
  function lastCheckpoint(km) {
    var last = checkpoints[0];
    for (var i = 0; i < checkpoints.length; i++) if (checkpoints[i].km <= km + 1e-6) last = checkpoints[i];
    return last;
  }

  function positionMarkers(elapsed) {
    runners.forEach(function (r, i) {
      var p = progressFor(r, elapsed);
      var pt = route.getPointAtLength(p * LEN);
      markers[i].setAttribute('transform', 'translate(' + pt.x.toFixed(2) + ',' + pt.y.toFixed(2) + ')');
      markers[i].setAttribute('class', 'lt-runner' + (p >= 1 ? ' is-finished' : ''));
    });
  }

  // ---- Live board ---------------------------------------------------------
  function renderBoard(elapsed) {
    if (!board) return;
    var rows = runners.map(function (r) {
      var p = progressFor(r, elapsed);
      var km = p * maxKm;
      var cp = lastCheckpoint(km);
      var done = p >= 1;
      return {
        r: r, p: p, km: km,
        last: loc(cp.label),
        time: clock(p * r.finishSec),
        status: done ? (T.finished || 'Finished') : (p > 0 ? (T.running || 'Running') : (T.waiting || '')),
        done: done
      };
    }).sort(function (a, b) { return b.p - a.p; });

    var head = '<thead><tr><th>#</th><th>' + esc(T.bib || 'Bib') + '</th><th>' + esc(T.name || 'Name') +
      '</th><th>' + esc(T.last || 'Last Detected') + '</th><th>' + esc(T.clock || 'Time') + '</th></tr></thead>';
    var body = rows.map(function (row, idx) {
      return '<tr class="' + (row.done ? 'is-finished' : '') + '">' +
        '<td class="lt-pos">' + (idx + 1) + '</td>' +
        '<td><span class="lt-swatch" style="background:' + esc(row.r.color) + '"></span>' + esc(row.r.bib) + '</td>' +
        '<td class="lt-name">' + esc(row.r.name) + '</td>' +
        '<td>' + esc(row.last) + ' <span class="lt-status ' + (row.done ? 'lt-status--done' : 'lt-status--run') + '">' + esc(row.status) + '</span></td>' +
        '<td class="lt-time">' + esc(row.time) + '</td>' +
      '</tr>';
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

  function allDone(e) {
    for (var i = 0; i < runners.length; i++) if (progressFor(runners[i], e) < 1) return false;
    return true;
  }
  function draw(e) {
    positionMarkers(e);
    if (lastBoard < 0 || Math.abs(e - lastBoard) >= 0.25 || allDone(e)) { renderBoard(e); lastBoard = e; }
  }
  function setToggle(isPlaying) {
    if (!toggleBtn) return;
    toggleBtn.textContent = isPlaying ? (T.pause || 'Pause') : (T.play || 'Play');
    toggleBtn.setAttribute('aria-pressed', String(isPlaying));
  }
  function tick(ts) {
    if (lastTs == null) lastTs = ts;
    elapsed += (ts - lastTs) / 1000; lastTs = ts;
    draw(elapsed);
    if (playing && !allDone(elapsed)) { raf = requestAnimationFrame(tick); }
    else { playing = false; setToggle(false); }
  }
  function play() {
    if (playing) return;
    if (allDone(elapsed)) elapsed = 0;
    playing = true; lastTs = null; setToggle(true);
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false; if (raf) cancelAnimationFrame(raf);
    setToggle(false);
  }
  function restart() { pause(); elapsed = 0; draw(0); play(); }

  if (toggleBtn) toggleBtn.addEventListener('click', function () { playing ? pause() : play(); });
  if (restartBtn) restartBtn.addEventListener('click', restart);

  // Initial frame.
  if (reduce) {
    // Static, mid-race snapshot; let the viewer opt in to motion via controls.
    draw(animSeconds * 0.45);
    setToggle(false);
  } else {
    draw(0);
    // Auto-play when scrolled into view (once).
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { play(); io.disconnect(); }
        });
      }, { threshold: 0.35 });
      io.observe(mapEl);
    } else {
      play();
    }
  }
})();
