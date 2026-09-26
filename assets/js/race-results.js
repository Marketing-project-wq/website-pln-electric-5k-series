/* ==========================================================================
   Race Results page — live data from the public pln-5k results endpoint.
   - Category Champions  : ?mode=podium&top=5
   - Results table       : ?mode=list (50 rows per page, server-side ?q= search)
   - Review lookup       : ?mode=one&bib= (list only returns status "ok" rows)
   - Finisher certificate: drawn client-side on <canvas> over the city PNG.
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
    review: 'Hasil sedang ditinjau panitia',
    reviewNote: 'Hasil peserta ini sedang ditinjau panitia. Sertifikat bisa diunduh setelah peninjauan selesai.',
    certMissing: 'Template sertifikat belum tersedia. Silakan coba lagi nanti.',
    certFail: 'Sertifikat gagal dibuat. Silakan coba lagi.',
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
    review: 'Result under review by the race committee',
    reviewNote: 'This runner\'s result is being reviewed by the race committee. The certificate can be downloaded once the review is complete.',
    certMissing: 'The certificate template is not available yet. Please try again later.',
    certFail: 'Could not create the certificate. Please try again.',
    ages: 'Ages 40+'
  };
  // Column headers and the certificate button stay English on both pages.
  var COL = { rank: 'Rank', bib: 'Bib No.', name: 'Name', cat: 'Category', time: 'Time', cert: 'Certificate' };
  var DL = 'DOWNLOAD CERTIFICATE';

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
  var byBib = {};   // bib -> row, for the certificate buttons
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
  function certCell(r) {
    if (r.status === 'ok') {
      return '<button class="btn btn--sm results-cert" type="button" data-cert="' + esc(r.bib) + '">' + icon('i-download') + ' ' + DL + '</button>';
    }
    return '<button class="btn btn--sm results-cert" type="button" disabled aria-disabled="true" title="' + esc(T.review) + '">' + icon('i-download') + ' ' + DL + '</button>' +
      '<span class="results-review">' + esc(T.review) + '</span>';
  }
  function rowHtml(r) {
    return '<tr>' +
      '<td data-label="' + COL.rank + '" class="rank">' + (r.rank != null ? esc(r.rank) : '–') + '</td>' +
      '<td data-label="' + COL.bib + '"><span class="bib">' + esc(r.bib) + '</span></td>' +
      '<td data-label="' + COL.name + '">' + esc(r.name) + '</td>' +
      '<td data-label="' + COL.cat + '">' + (r.category ? '<span class="cat-badge">' + esc(r.category) + '</span>' : '–') + '</td>' +
      '<td data-label="' + COL.time + '" class="num">' + (r.time ? esc(r.time) : '–') + '</td>' +
      '<td data-label="' + COL.cert + '" class="cell-cert">' + certCell(r) + '</td>' +
    '</tr>';
  }
  function message(text) { return '<p class="results-message">' + esc(text) + '</p>'; }

  function renderTable() {
    byBib = {};
    var list = state.rows.slice();
    if (state.extra && !list.some(function (r) { return r.bib === state.extra.bib; })) list.unshift(state.extra);
    list.forEach(function (r) { byBib[r.bib] = r; });

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
    var head = [COL.rank, COL.bib, COL.name, COL.cat, COL.time, COL.cert];
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
    var b = e.target.closest('[data-cert]');
    if (b && !b.disabled) {
      var r = byBib[b.getAttribute('data-cert')];
      if (r && r.status === 'ok') downloadCertificate(r, city, b);
    }
  });

  function stamp(ev) {
    if (!statusEl || !ev || !ev.last_fetched_at) return;
    var d = new Date(ev.last_fetched_at);
    if (isNaN(d)) return;
    statusEl.textContent = T.updated + ' ' + d.toLocaleTimeString(isID ? 'id-ID' : 'en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

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

  function downloadCertificate(r, c, btn) {
    if (btn) btn.disabled = true;
    var fontsReady = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('64px Anton'), document.fonts.load('700 20px Montserrat')]).catch(function () {})
      : Promise.resolve();
    Promise.all([loadImage(certSrc(c)), fontsReady]).then(function (res) {
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
      cv.toBlob(function (blob) {
        if (!blob) { alert(T.certFail); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      }, 'image/png');
    }).catch(function (e) {
      alert(e && e.message === 'missing' ? T.certMissing : T.certFail);
    }).then(function () { if (btn) btn.disabled = false; });
  }
})();
