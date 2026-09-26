/* ==========================================================================
   Race Results page — live data from the public pln-5k results endpoint.
   - Category Champions  : ?mode=podium&top=5
   - Results table       : ?mode=list (50 rows per page, server-side ?q= search)
   - Review lookup       : ?mode=one&bib= (list only returns status "ok" rows)
   - Runner detail modal : ?mode=one&bib= (click a name / row)
   - Finisher certificate: drawn client-side on <canvas> over the city PNG,
                           downloaded from the detail modal.
   The endpoint is intentionally public (no auth, open CORS). Never put timing
   provider tokens or Supabase keys in this repo, and never call the timing
   provider directly from the browser.
   ========================================================================== */
(function () {
  'use strict';
  var mount = document.querySelector('[data-results]');
  if (!mount) return;

  var LANG = (window.EVENT_DATA && window.EVENT_DATA.LANG) || document.documentElement.lang || 'id';
  var isID = LANG === 'id';
  var API = 'https://cpvzwqptzcxnwzfzgrmt.supabase.co/functions/v1/pln-5k';
  var PAGE = 50;          // rows per page
  var MAX_LIMIT = 200;    // server caps ?limit at 200
  var POLL_MS = 30000;

  // City -> results slug. A city's tab is enabled as soon as it has a slug:
  // for Yogyakarta / Bali set slug to 'pln-yogya' / 'pln-bali' and drop in
  // assets/certificate-<key>.png.
  var CITIES = [
    { key: 'jakarta',    name: 'Jakarta',    slug: 'pln-jakarta' },
    { key: 'yogyakarta', name: 'Yogyakarta', slug: null },
    { key: 'bali',       name: 'Bali',       slug: null }
  ];
  function certSrc(city) { return '/assets/certificate-' + city.key + '.png'; }

  var CATEGORIES = [
    { key: 'MALE OPEN',     top: 5 },
    { key: 'FEMALE OPEN',   top: 5 },
    { key: 'MALE MASTER',   top: 3, master: true },
    { key: 'FEMALE MASTER', top: 3, master: true }
  ];

  var T = isID ? {
    allCats: 'Semua Kategori',
    search: 'Cari No. BIB atau nama…', searchLabel: 'Cari peserta',
    overall: 'Keseluruhan',
    cityPending: 'Hasil Yogyakarta dan Bali belum tersedia — tab akan aktif setelah Race Day kota tersebut. Tab Keseluruhan aktif setelah hasil kota lain masuk.',
    notYet: 'Hasil belum tersedia',
    live: 'Lomba sedang berlangsung. Hasil akan muncul di sini secara otomatis begitu pelari pertama finis — halaman ini diperbarui sendiri setiap 30 detik.',
    catEmpty: 'Belum ada finisher di kategori ini.',
    noMatch: 'Peserta tidak ditemukan. Coba No. BIB atau ejaan nama lain.',
    noneInCat: 'Belum ada finisher di kategori ini.',
    loading: 'Memuat hasil…',
    error: 'Hasil gagal dimuat. Mencoba lagi otomatis…',
    more: 'Muat lebih banyak',
    updated: 'Diperbarui',
    review: 'Sedang ditinjau',
    reviewNote: 'Hasil peserta ini sedang ditinjau panitia. Ketuk namanya untuk detail.',
    ages: 'Usia 40+'
  } : {
    allCats: 'All Categories',
    search: 'Search bib or name…', searchLabel: 'Search participants',
    overall: 'Overall',
    cityPending: 'Yogyakarta and Bali results are not available yet — their tabs switch on after each city\'s Race Day. Overall switches on once another city has results.',
    notYet: 'Results not available yet',
    live: 'The race is in progress. Results appear here automatically as soon as the first runner finishes — this page refreshes itself every 30 seconds.',
    catEmpty: 'No finishers in this category yet.',
    noMatch: 'No participant found. Try a bib number or another spelling of the name.',
    noneInCat: 'No finishers in this category yet.',
    loading: 'Loading results…',
    error: 'Could not load results. Retrying automatically…',
    more: 'Load more',
    updated: 'Updated',
    review: 'Under review',
    reviewNote: 'This runner\'s result is being reviewed by the race committee. Tap the name for details.',
    ages: 'Ages 40+'
  };
  // Column headers, the runner modal and the certificate stay English on both pages.
  var COL = { rank: 'Rank', bib: 'Bib No.', name: 'Name', cat: 'Category', time: 'Time' };
  var M = {
    loading: 'Loading runner…',
    notFound: 'Runner not found.',
    error: 'Could not load this runner. Please try again.',
    retry: 'Try again',
    close: 'Close',
    bib: 'BIB',
    finish: 'Finish Time', rank: 'Rank', pace: 'Pace', team: 'Team', splits: 'Split Times',
    of: 'of',
    review: 'This result is under review by the race committee. Time and rank will appear once the review is complete.',
    download: 'DOWNLOAD CERTIFICATE',
    reviewCert: 'The certificate is available once the review is complete.',
    certMissing: 'The certificate template is not available yet. Please try again later.',
    certFail: 'Could not create the certificate. Please try again.'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(name, cls) { return '<svg class="' + (cls || 'icon') + '" aria-hidden="true"><use href="/assets/img/icons/sprite.svg#' + name + '"></use></svg>'; }

  function api(params) {
    var qs = Object.keys(params).filter(function (k) { return params[k] !== '' && params[k] != null; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(API + '?' + qs, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ---- State --------------------------------------------------------------
  var city = CITIES[0];
  var state = { q: '', cat: '', rows: [], hasMore: false, extra: null, hasAnyFinisher: null, error: false, loading: true };
  var seq = 0;      // guards against out-of-order responses

  // ---- Static chrome: city tabs, category chips, search -------------------
  var filters = document.querySelector('[data-results-filters]');
  var searchMount = document.querySelector('[data-results-search]');
  var podiumMount = document.querySelector('[data-podium]');
  var statusEl = document.querySelector('[data-results-status]');

  if (filters) {
    var tabs = [{ k: 'overall', label: T.overall, on: false }].concat(CITIES.map(function (c) { return { k: c.key, label: c.name, on: !!c.slug }; }));
    filters.innerHTML = tabs.map(function (t) {
      var active = t.k === city.key;
      return '<button class="gallery-filter" type="button" data-city="' + t.k + '" aria-pressed="' + active + '"' +
        (t.on ? '' : ' disabled aria-disabled="true" title="' + esc(T.notYet) + '"') + '>' + esc(t.label.toUpperCase()) + '</button>';
    }).join('') + '<p class="results-cities-note">' + esc(T.cityPending) + '</p>';
    filters.addEventListener('click', function (e) {
      var b = e.target.closest('[data-city]');
      if (!b || b.disabled) return;
      var next = CITIES.filter(function (c) { return c.key === b.getAttribute('data-city') && c.slug; })[0];
      if (!next || next === city) return;
      city = next;
      filters.querySelectorAll('[data-city]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      refreshAll();
    });
  }

  if (searchMount) {
    searchMount.innerHTML =
      '<input type="search" class="results-search__input" placeholder="' + esc(T.search) + '" aria-label="' + esc(T.searchLabel) + '" autocomplete="off">' +
      '<div class="results-cats" role="group" aria-label="' + esc(COL.cat) + '">' +
        [{ k: '', label: T.allCats }].concat(CATEGORIES.map(function (c) { return { k: c.key, label: c.key }; })).map(function (c) {
          return '<button type="button" class="gallery-filter" data-cat="' + esc(c.k) + '" aria-pressed="' + (c.k === '' ) + '">' + esc(c.label.toUpperCase()) + '</button>';
        }).join('') +
      '</div>';
    var input = searchMount.querySelector('input');
    var deb;
    input.addEventListener('input', function () {
      clearTimeout(deb);
      var v = input.value.trim();
      deb = setTimeout(function () { if (v !== state.q) { state.q = v; loadList(false); } }, 350);
    });
    searchMount.querySelector('.results-cats').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      state.cat = b.getAttribute('data-cat');
      searchMount.querySelectorAll('[data-cat]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      loadList(false);
    });
  }

  // ---- Podium -------------------------------------------------------------
  function initials(name) {
    var p = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '';
    return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  function avatar(name, size) {
    var ini = initials(name);
    return '<span class="podium-avatar podium-avatar--fallback' + (size ? ' podium-avatar--' + size : '') + '">' +
      (ini ? '<span class="podium-avatar__initials">' + esc(ini) + '</span>' : icon('i-run', 'podium-avatar__icon')) + '</span>';
  }
  function ordinal(rank) {
    if (isID) return 'Juara ' + rank;
    var s = ['th', 'st', 'nd', 'rd'], v = rank % 100;
    return rank + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function column(e, place) {
    if (!e) return '<div class="podium-col podium-col--' + place + '"></div>';
    return '<div class="podium-col podium-col--' + place + '">' +
      '<div class="podium-person">' + avatar(e.name) +
        '<span class="podium-name">' + esc(e.name) + '</span>' +
        '<span class="podium-time">' + esc(e.time) + '</span>' +
      '</div>' +
      '<div class="podium-riser podium-riser--' + place + '"><span class="podium-rank">' + place + '</span></div>' +
    '</div>';
  }
  function runnerRow(e) {
    return '<li class="podium-runner">' +
      '<span class="podium-runner__rank">' + ordinal(e.rank) + '</span>' + avatar(e.name, 'sm') +
      '<span class="podium-runner__name">' + esc(e.name) + '</span>' +
      '<span class="podium-runner__time">' + esc(e.time) + '</span>' +
    '</li>';
  }
  function renderPodium(rows) {
    if (!podiumMount) return;
    if (!rows.length) {
      podiumMount.innerHTML = '<article class="podium-block podium-block--empty podium-block--live"><p class="podium-empty">' + esc(T.live) + '</p></article>';
      return;
    }
    podiumMount.innerHTML = CATEGORIES.map(function (cat) {
      var head = '<div class="podium-block__head"><h3 class="podium-block__title">' + esc(cat.key) + '</h3>' +
        (cat.master ? '<span class="podium-block__sub">' + esc(T.ages) + '</span>' : '') + '</div>';
      var entries = rows.filter(function (r) { return r.category === cat.key && r.rank >= 1 && r.rank <= cat.top; })
        .sort(function (a, b) { return a.rank - b.rank; });
      if (!entries.length) return '<article class="podium-block podium-block--empty">' + head + '<p class="podium-empty">' + esc(T.catEmpty) + '</p></article>';
      var by = {}; entries.forEach(function (e) { if (!by[e.rank]) by[e.rank] = e; });
      var extras = entries.filter(function (e) { return e.rank >= 4; });
      return '<article class="podium-block">' + head +
        '<div class="podium-stage">' + column(by[2], 2) + column(by[1], 1) + column(by[3], 3) + '</div>' +
        (extras.length ? '<ul class="podium-runners">' + extras.map(runnerRow).join('') + '</ul>' : '') +
      '</article>';
    }).join('');
  }
  function loadPodium() {
    var s = city.slug;
    return api({ mode: 'podium', top: 5, slug: s }).then(function (j) {
      if (s !== city.slug) return;
      var rows = j.podium || [];
      state.hasAnyFinisher = rows.length > 0;
      renderPodium(rows);
      stamp(j.event);
    });
  }

  // ---- Results table ------------------------------------------------------
  function rowHtml(r) {
    var ok = r.status === 'ok';
    return '<tr class="results-row" data-bib="' + esc(r.bib) + '">' +
      '<td data-label="' + COL.rank + '" class="rank">' + (ok && r.rank != null ? esc(r.rank) : '–') + '</td>' +
      '<td data-label="' + COL.bib + '"><span class="bib">' + esc(r.bib) + '</span></td>' +
      '<td data-label="' + COL.name + '"><button type="button" class="results-name" data-open="' + esc(r.bib) + '">' + esc(r.name) + '</button>' +
        (ok ? '' : ' <span class="results-review">' + esc(T.review) + '</span>') + '</td>' +
      '<td data-label="' + COL.cat + '">' + (r.category ? '<span class="cat-badge">' + esc(r.category) + '</span>' : '–') + '</td>' +
      '<td data-label="' + COL.time + '" class="num">' + (ok && r.time ? esc(r.time) : '–') + '</td>' +
    '</tr>';
  }
  function message(text) { return '<p class="results-message">' + esc(text) + '</p>'; }

  var tableDirty = false;
  function renderTable() {
    // Never repaint the table under an open runner modal (polling keeps
    // fetching; the latest state is painted when the modal closes).
    if (modalOpen) { tableDirty = true; return; }
    tableDirty = false;
    var list = state.rows.slice();
    if (state.extra && !list.some(function (r) { return r.bib === state.extra.bib; })) list.unshift(state.extra);

    if (!list.length) {
      var msg;
      if (state.error) msg = T.error;
      else if (state.loading) msg = T.loading;
      else if (state.q) msg = T.noMatch;
      else if (state.hasAnyFinisher === false || !state.cat) msg = T.live;
      else msg = T.noneInCat;
      mount.innerHTML = message(msg);
      return;
    }
    var head = [COL.rank, COL.bib, COL.name, COL.cat, COL.time];
    mount.innerHTML =
      (state.extra && state.extra.status !== 'ok' ? '<p class="note results-review-note">' + esc(T.reviewNote) + '</p>' : '') +
      '<div class="table-wrap"><table class="data data--results"><thead><tr><th>' + head.join('</th><th>') + '</th></tr></thead><tbody>' +
      list.map(rowHtml).join('') + '</tbody></table></div>' +
      (state.error ? message(T.error) : '') +
      (state.hasMore ? '<div class="results-more"><button class="btn btn--sm btn--ghost" type="button" data-more>' + esc(T.more) + '</button></div>' : '');
  }

  // Fetch `count` rows from offset 0 (in chunks of MAX_LIMIT), used for the
  // first page and for refreshing everything already on screen while polling.
  function fetchRows(count) {
    var out = [], s = city.slug, q = state.q, cat = state.cat;
    function step(off) {
      var lim = Math.min(MAX_LIMIT, count - off);
      return api({ mode: 'list', slug: s, limit: lim, offset: off, q: q, category: cat }).then(function (j) {
        var rows = j.rows || [];
        out = out.concat(rows);
        stamp(j.event);
        if (rows.length === lim && off + lim < count) return step(off + lim);
        return { rows: out, full: rows.length === lim };
      });
    }
    return step(0);
  }
  // Rows with status other than "ok" are excluded from ?mode=list, so a
  // bib search also asks ?mode=one to surface runners under review.
  function fetchExtra() {
    if (!/^\d+$/.test(state.q)) return Promise.resolve(null);
    return api({ mode: 'one', slug: city.slug, bib: state.q }).then(function (j) { return j.runner || null; }, function () { return null; });
  }

  function loadList(keepCount) {
    var my = ++seq;
    var count = keepCount ? Math.max(PAGE, state.rows.length) : PAGE;
    if (!keepCount) { state.rows = []; state.extra = null; state.hasMore = false; state.loading = true; renderTable(); }
    return Promise.all([fetchRows(count), fetchExtra()]).then(function (res) {
      if (my !== seq) return;
      state.rows = res[0].rows;
      state.hasMore = res[0].full;
      state.extra = res[1];
      state.error = false; state.loading = false;
      renderTable();
    }, function () {
      if (my !== seq) return;
      state.error = true; state.loading = false;
      renderTable();
    });
  }
  function loadMore(btn) {
    var my = seq, s = city.slug;
    btn.disabled = true;
    api({ mode: 'list', slug: s, limit: PAGE, offset: state.rows.length, q: state.q, category: state.cat }).then(function (j) {
      if (my !== seq) return;
      var rows = j.rows || [];
      var have = {}; state.rows.forEach(function (r) { have[r.bib] = 1; });
      state.rows = state.rows.concat(rows.filter(function (r) { return !have[r.bib]; }));
      state.hasMore = rows.length === PAGE;
      state.error = false;
      renderTable();
    }, function () { btn.disabled = false; });
  }

  mount.addEventListener('click', function (e) {
    var more = e.target.closest('[data-more]');
    if (more) { loadMore(more); return; }
    var tr = e.target.closest('tr[data-bib]');
    if (tr) openRunner(tr.getAttribute('data-bib'), tr.querySelector('[data-open]'));
  });

  function stamp(ev) {
    if (!statusEl || !ev || !ev.last_fetched_at) return;
    var d = new Date(ev.last_fetched_at);
    if (isNaN(d)) return;
    statusEl.textContent = T.updated + ' ' + d.toLocaleTimeString(isID ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // ---- Runner detail modal ------------------------------------------------
  var modalOpen = false, modalSeq = 0, lastTrigger = null, lastBib = null;
  var modal = document.createElement('div');
  modal.className = 'modal rr-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'rr-title');
  modal.setAttribute('lang', 'en');
  modal.innerHTML =
    '<div class="modal__overlay" data-close></div>' +
    '<div class="modal__dialog rr-dialog">' +
      '<button class="modal__close rr-close" type="button" data-close aria-label="' + M.close + '"><span aria-hidden="true">&times;</span></button>' +
      '<div class="rr-body" data-rr-body></div>' +
    '</div>';
  document.body.appendChild(modal);
  var mBody = modal.querySelector('[data-rr-body]');
  var mDialog = modal.querySelector('.rr-dialog');

  // Scroll lock: keep the page where it is while the modal is open.
  var savedOverflow = null;
  function lockPage(on) {
    var h = document.documentElement, b = document.body;
    if (on) {
      savedOverflow = [h.style.overflow, b.style.overflow];
      h.style.overflow = 'hidden'; b.style.overflow = 'hidden';
    } else if (savedOverflow) {
      h.style.overflow = savedOverflow[0]; b.style.overflow = savedOverflow[1];
      savedOverflow = null;
    }
  }

  function stat(label, value, extra) {
    return '<div class="rr-stat"><dt>' + esc(label) + '</dt><dd>' + value + (extra ? '<span class="rr-stat__sub">' + extra + '</span>' : '') + '</dd></div>';
  }
  function renderRunner(r) {
    var ok = r.status === 'ok';
    var html =
      '<h2 id="rr-title" class="rr-name">' + esc(r.name || '') + '</h2>' +
      '<p class="rr-bib"><span>' + M.bib + '</span> ' + esc(r.bib) + '</p>' +
      (r.category ? '<span class="rr-cat">' + esc(r.category) + '</span>' : '');
    if (ok) {
      var stats = stat(M.finish, '<span class="rr-time">' + esc(r.time || '–') + '</span>');
      if (r.rank != null) {
        stats += stat(M.rank, esc(r.rank) + (r.category_size != null ? ' <small>' + M.of + ' ' + esc(r.category_size) + '</small>' : ''), r.category ? esc(r.category) : '');
      }
      if (r.pace) stats += stat(M.pace, esc(r.pace) + (r.pace_unit ? ' <small>' + esc(r.pace_unit) + '</small>' : ''));
      if (r.team) stats += stat(M.team, esc(r.team));
      html += '<dl class="rr-stats">' + stats + '</dl>';
      var cps = Array.isArray(r.checkpoints) ? r.checkpoints.filter(function (c) { return c && c.label && c.time; }) : [];
      if (cps.length) {
        html += '<section class="rr-splits"><h3>' + M.splits + '</h3><ol class="rr-split-list">' +
          cps.map(function (c) { return '<li><span>' + esc(c.label) + '</span><b>' + esc(c.time) + '</b></li>'; }).join('') +
        '</ol></section>';
      }
    } else {
      if (r.team) html += '<dl class="rr-stats">' + stat(M.team, esc(r.team)) + '</dl>';
      html += '<p class="rr-review" role="status">' + M.review + '</p>';
    }
    html += '<div class="rr-actions">' +
      '<button class="btn rr-cert" type="button" data-cert' + (ok ? '' : ' disabled aria-disabled="true"') + '>' + icon('i-download') + ' ' + M.download + '</button>' +
      (ok ? '' : '<p class="rr-hint">' + M.reviewCert + '</p>') +
      '<p class="rr-hint rr-cert-msg" data-cert-msg role="alert" hidden></p>' +
    '</div>';
    mBody.innerHTML = html;
    var btn = mBody.querySelector('[data-cert]');
    if (ok) btn.addEventListener('click', function () {
      var msg = mBody.querySelector('[data-cert-msg]');
      msg.hidden = true;
      btn.disabled = true;
      downloadCertificate(r, city).catch(function (e) { msg.textContent = e.message; msg.hidden = false; })
        .then(function () { btn.disabled = false; });
    });
  }
  function fetchRunner(bib) {
    var my = ++modalSeq;
    mBody.innerHTML = '<h2 id="rr-title" class="rr-name rr-name--muted">' + M.bib + ' ' + esc(bib) + '</h2>' +
      '<p class="rr-loading" role="status"><span class="rr-spinner" aria-hidden="true"></span>' + M.loading + '</p>';
    api({ mode: 'one', slug: city.slug, bib: bib }).then(function (j) {
      if (my !== modalSeq || !modalOpen) return;
      if (!j || !j.runner) { mBody.innerHTML = '<h2 id="rr-title" class="rr-name">' + M.notFound + '</h2>'; return; }
      renderRunner(j.runner);
    }, function () {
      if (my !== modalSeq || !modalOpen) return;
      mBody.innerHTML = '<h2 id="rr-title" class="rr-name rr-name--muted">' + M.bib + ' ' + esc(bib) + '</h2>' +
        '<p class="rr-review" role="alert">' + M.error + '</p>' +
        '<div class="rr-actions"><button class="btn btn--ghost" type="button" data-retry>' + M.retry + '</button></div>';
      mBody.querySelector('[data-retry]').addEventListener('click', function () { fetchRunner(bib); });
    });
  }
  function openRunner(bib, trigger) {
    if (!bib) return;
    lastTrigger = trigger || document.activeElement;
    lastBib = bib;
    if (!modalOpen) { modalOpen = true; lockPage(true); modal.classList.add('is-open'); }
    mDialog.scrollTop = 0;
    fetchRunner(bib);
    modal.querySelector('.rr-close').focus();
  }
  function closeRunner() {
    if (!modalOpen) return;
    modalOpen = false; modalSeq++;
    modal.classList.remove('is-open');
    lockPage(false);
    if (tableDirty) renderTable();
    // The row may have been repainted while the modal was open: focus the
    // current button for the same bib, falling back to the original trigger.
    var target = null;
    if (lastBib != null) {
      mount.querySelectorAll('[data-open]').forEach(function (b) { if (!target && b.getAttribute('data-open') === lastBib) target = b; });
    }
    if (!target && lastTrigger && document.contains(lastTrigger)) target = lastTrigger;
    if (target && target.focus) target.focus();
  }
  modal.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeRunner(); });
  document.addEventListener('keydown', function (e) {
    if (!modalOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); closeRunner(); return; }
    if (e.key === 'Tab') {
      // Keep keyboard focus inside the dialog.
      var f = Array.prototype.filter.call(mDialog.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // ---- Polling (paused while the tab is hidden) ---------------------------
  var timer = null;
  function refreshAll(keep) {
    loadPodium().catch(function () { if (podiumMount && !podiumMount.children.length) podiumMount.innerHTML = '<article class="podium-block podium-block--empty"><p class="podium-empty">' + esc(T.error) + '</p></article>'; });
    return loadList(!!keep);
  }
  function startPolling() {
    if (timer || document.hidden) return;
    timer = setInterval(function () { if (!document.hidden) refreshAll(true); }, POLL_MS);
  }
  function stopPolling() { clearInterval(timer); timer = null; }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopPolling();
    else { refreshAll(true); startPolling(); }
  });

  refreshAll(false);
  startPolling();

  // ---- Finisher certificate -----------------------------------------------
  // Positions are fractions of the PNG's own size so the layout follows the
  // template at any resolution. Adjust here if the artwork changes.
  //   name  : centred, baseline sitting just above the name line
  //   boxes : four boxes, small label on top, big value below
  var CERT = {
    textColor: '#FFFFFF',
    labelColor: '#8CD867',
    name: { x: 0.50, y: 0.475, maxW: 0.66, size: 0.070 },
    boxes: { labelY: 0.640, valueY: 0.715, subY: 0.752, w: 0.19, centers: [0.20, 0.40, 0.60, 0.80], label: 0.017, value: 0.048, sub: 0.018 }
  };
  var FONT_DISPLAY = 'Anton, "Arial Narrow", Impact, sans-serif';
  var FONT_LABEL = 'Montserrat, Arial, sans-serif';

  // Largest font size <= size that keeps `text` within maxW (never truncates).
  function fitFont(g, text, size, maxW, weight, family) {
    var s = size;
    g.font = weight + ' ' + s + 'px ' + family;
    while (s > 6 && g.measureText(text).width > maxW) {
      s = Math.max(6, Math.floor(s * 0.95));
      g.font = weight + ' ' + s + 'px ' + family;
    }
    return s;
  }
  function genderOf(r) {
    var s = String(r.sex || '').trim().toUpperCase();
    if (/^(M|MALE|L|LAKI|PRIA|男)/.test(s)) return 'MALE';
    if (/^(F|FEMALE|P|PEREMPUAN|WANITA|W|女)/.test(s)) return 'FEMALE';
    var c = String(r.category || '').toUpperCase();
    return c.indexOf('FEMALE') === 0 ? 'FEMALE' : c.indexOf('MALE') === 0 ? 'MALE' : '';
  }
  function loadImage(src) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () { res(img); };
      img.onerror = function () { rej(new Error('missing')); };
      img.src = src;
    });
  }
  function fileSafe(s) { return String(s || '').replace(/\s+/g, '').replace(/[\\/:*?"<>|]/g, ''); }

  // Resolves once the PNG download has been triggered; rejects with a
  // user-facing (English) message.
  function downloadCertificate(r, c) {
    var fontsReady = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('64px Anton'), document.fonts.load('700 20px Montserrat')]).catch(function () {})
      : Promise.resolve();
    return Promise.all([loadImage(certSrc(c)), fontsReady]).then(function (res) {
      var img = res[0], W = img.naturalWidth, H = img.naturalHeight;
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var g = cv.getContext('2d');
      g.drawImage(img, 0, 0, W, H);
      g.textAlign = 'center';
      g.textBaseline = 'alphabetic';

      // Name — uppercase, shrinks to fit above the line.
      var name = String(r.name || '').toUpperCase();
      g.fillStyle = CERT.textColor;
      fitFont(g, name, Math.round(H * CERT.name.size), W * CERT.name.maxW, '400', FONT_DISPLAY);
      g.fillText(name, W * CERT.name.x, H * CERT.name.y);

      var B = CERT.boxes, bw = W * B.w;
      var boxes = [
        { label: 'GENDER', value: genderOf(r) || '–' },
        { label: 'BIB NUMBER', value: String(r.bib) },
        { label: 'POSITION', value: r.rank != null ? String(r.rank) : '–', sub: r.category || '' },
        { label: 'FINISH TIME', value: r.time || '–' }
      ];
      boxes.forEach(function (b, i) {
        var cx = W * B.centers[i];
        g.fillStyle = CERT.labelColor;
        fitFont(g, b.label, Math.round(H * B.label), bw, '700', FONT_LABEL);
        g.fillText(b.label, cx, H * B.labelY);
        g.fillStyle = CERT.textColor;
        fitFont(g, b.value, Math.round(H * B.value), bw, '400', FONT_DISPLAY);
        g.fillText(b.value, cx, H * B.valueY);
        if (b.sub) {
          fitFont(g, b.sub, Math.round(H * B.sub), bw, '700', FONT_LABEL);
          g.fillText(b.sub, cx, H * B.subY);
        }
      });

      var filename = 'PLN-5K-' + c.name + '-' + fileSafe(r.bib) + '-' + fileSafe(r.name) + '.png';
      return new Promise(function (res, rej) {
        cv.toBlob(function (blob) {
          if (!blob) { rej(new Error('fail')); return; }
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = filename;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
          res();
        }, 'image/png');
      });
    }).catch(function (e) {
      throw new Error(e && e.message === 'missing' ? M.certMissing : M.certFail);
    });
  }
})();
