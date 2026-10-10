/* ==========================================================================
   /cek-yogya — PLN Mobile Electric 5K Yogyakarta (11 Oct 2026) quick-check
   page. A standalone copy of assets/js/cek.js (/cek, Jakarta — untouched);
   CITY differs, and the name search uses pln-find (finds runners who
   haven't finished yet; BIB lookups still use pln-5k mode=one). One search box:
   - all digits  -> pln-5k ?mode=one&bib= ; if not found, fall back to the list
   - otherwise   -> pln-find ?q=&limit=20 (min 2 chars, held back in the UI
                    below that) ; tap a row -> pln-5k ?mode=one&bib=
   Always &slug=pln-yogya. Searching happens on the server; the page never
   pulls the whole field. The endpoint is public by design (no keys here).

   Shareable result URL: <current path>?bib=<bib> (query param, not a path
   segment — the site is static). Opening such a link shows that runner's
   card straight away; history back/forward moves between list and card.
   Other query params are ignored.
   ========================================================================== */
(function () {
  'use strict';
  var API = 'https://cpvzwqptzcxnwzfzgrmt.supabase.co/functions/v1/pln-5k';
  // Name search: pln-find (same row shape as pln-5k mode=list, but also finds
  // runners who haven't finished yet; min 2 chars, max 20 rows, no pacers).
  // BIB lookups and the runner card stay on pln-5k mode=one.
  var FIND = 'https://cpvzwqptzcxnwzfzgrmt.supabase.co/functions/v1/pln-find';
  var FIND_MIN = 2;
  var CITY = { key: 'yogyakarta', name: 'Yogyakarta', slug: 'pln-yogya' };
  var LIST_LIMIT = 20;

  var T = {
    searching: 'Searching…',
    loadingRunner: 'Loading result…',
    notFound: 'No runner found. Check the BIB number or try part of your name.',
    tooShort: 'Type at least 2 characters of your name, or your BIB number.',
    error: 'Couldn\'t reach the results server. Check your connection and try again.',
    retry: 'Try again',
    matches: function (n) { return n + (n === 1 ? ' runner matches' : ' runners match') + ' — tap your name'; },
    more: 'Showing the first ' + LIST_LIMIT + '. Type more of your name to narrow it down.',
    back: '← Back to list',
    bib: 'BIB'
  };

  var form = document.querySelector('[data-search]');
  var input = form.querySelector('input');
  var out = document.querySelector('[data-out]');
  var seq = 0;
  var lastList = null; // { q, rows } — for "Back to list"
  // Unofficial-times marker: set from every response's event.is_frozen
  // (false -> marker on the list and the card + certificate; true or
  // missing -> nothing). Never hardcoded per city.
  var unofficial = false;
  function noteEvent(j) { unofficial = window.PLN_RUNNER_CARD.isUnofficial(j && j.event); }

  // ---- Shareable URL (?bib=) -------------------------------------------------
  function shareUrl(bib) {
    return location.origin + location.pathname + '?bib=' + encodeURIComponent(bib);
  }
  function setUrl(bib, replace) {
    var u = bib ? shareUrl(bib) : location.origin + location.pathname;
    try { history[replace ? 'replaceState' : 'pushState']({ bib: bib || null }, '', u); } catch (e) {}
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function api(params) {
    params.slug = CITY.slug;
    var qs = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    return fetch(API + '?' + qs, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // pln-find: { event, query, total, rows }. Only `rows` and event.is_frozen
  // are read (its event object is slimmer than pln-5k's — no roster_size /
  // ranked_by / …).
  function find(q) {
    var qs = 'slug=' + encodeURIComponent(CITY.slug) + '&q=' + encodeURIComponent(q) + '&limit=' + LIST_LIMIT;
    return fetch(FIND + '?' + qs, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // ---- Views ---------------------------------------------------------------
  function loading(text) { out.innerHTML = '<p class="loading" role="status"><span class="spin" aria-hidden="true"></span>' + esc(text) + '</p>'; }
  function message(text, warn) { out.innerHTML = '<div class="msg' + (warn ? ' msg--warn' : '') + '"><p>' + esc(text) + '</p></div>'; }
  function failure(retry) {
    out.innerHTML = '<div class="msg msg--warn" role="alert"><p>' + esc(T.error) + '</p>' +
      '<button class="btn btn--ghost" type="button" data-retry>' + esc(T.retry) + '</button></div>';
    out.querySelector('[data-retry]').addEventListener('click', retry);
  }

  function showList(q, rows) {
    lastList = { q: q, rows: rows };
    out.innerHTML = (unofficial ? window.PLN_RUNNER_CARD.unofficialNote() : '') +
      '<p class="list-head">' + esc(T.matches(rows.length)) + '</p>' +
      '<ul class="list">' + rows.map(function (r) {
        return '<li><button type="button" data-bib="' + esc(r.bib) + '">' +
          '<span class="list__name">' + esc(r.name) + '</span>' +
          '<span class="list__time">' + esc(r.time || '') + '</span>' +
          '<span class="list__meta">' + esc(T.bib) + ' ' + esc(r.bib) + (r.category ? ' · ' + esc(r.category) : '') + '</span>' +
        '</button></li>';
      }).join('') + '</ul>' +
      (rows.length >= LIST_LIMIT ? '<p class="list-head" style="margin-top:12px">' + esc(T.more) + '</p>' : '');
  }

  // Result card: the shared runner card (assets/js/runner-card.js) with a
  // SEARCH AGAIN button; "Back to list" sits above it when opened from a list.
  function searchAgain() {
    seq++; lastList = null;
    setUrl(null, true);
    input.value = '';
    out.innerHTML = '';
    input.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  // noPush: the URL already points at this runner (deep link / back-forward).
  function showCard(r, fromList, noPush) {
    out.innerHTML = fromList ? '<button class="back" type="button" data-back>' + esc(T.back) + '</button>' : '';
    out.appendChild(window.PLN_RUNNER_CARD.renderRunnerCard(r, {
      city: CITY, titleId: 'card-name', showSearchAgain: true, onSearchAgain: searchAgain,
      shareUrl: shareUrl(r.bib), unofficial: unofficial
    }));
    var back = out.querySelector('[data-back]');
    if (back) back.addEventListener('click', function () {
      if (!lastList) return;
      setUrl(null, true);
      showList(lastList.q, lastList.rows);
      var b = out.querySelector('[data-bib="' + String(r.bib).replace(/"/g, '') + '"]');
      if (b) b.focus();
    });
    var h = document.getElementById('card-name');
    if (h) { h.focus({ preventScroll: true }); out.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    if (!noPush) setUrl(r.bib);
  }

  // ---- Flow ----------------------------------------------------------------
  function searchList(q, my) {
    // pln-find answers 400 below 2 characters: never send such a request.
    if (q.length < FIND_MIN) { message(T.tooShort, true); return Promise.resolve(); }
    loading(T.searching);
    return find(q).then(function (j) {
      if (my !== seq) return;
      noteEvent(j);
      var rows = (j && Array.isArray(j.rows)) ? j.rows : [];
      if (!rows.length) message(T.notFound, true);
      else showList(q, rows);
    });
  }
  function search(q) {
    var my = ++seq;
    lastList = null;
    var run = /^\d+$/.test(q)
      ? function () {
          loading(T.searching);
          return api({ mode: 'one', bib: q }).then(function (j) {
            if (my !== seq) return;
            noteEvent(j);
            if (j && j.runner) showCard(j.runner, false);
            else return searchList(q, my);
          });
        }
      : function () { return searchList(q, my); };
    run().catch(function () { if (my === seq) failure(function () { search(q); }); });
  }
  function openRunner(bib, noPush) {
    var my = ++seq;
    loading(T.loadingRunner);
    api({ mode: 'one', bib: bib }).then(function (j) {
      if (my !== seq) return;
      noteEvent(j);
      if (j && j.runner) showCard(j.runner, !!lastList, noPush);
      else { setUrl(null, true); message(T.notFound, true); }   // don't leave a dead ?bib= in the URL
    }).catch(function () { if (my === seq) failure(function () { openRunner(bib, noPush); }); });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) { input.focus(); return; }
    input.blur(); // close the phone keyboard so the result is visible
    search(q);
  });
  out.addEventListener('click', function (e) {
    var b = e.target.closest('[data-bib]');
    if (b) openRunner(b.getAttribute('data-bib'));
  });

  // Back / forward between the list and a runner's card.
  window.addEventListener('popstate', function () {
    var b = new URLSearchParams(location.search).get('bib');
    if (b) openRunner(b, true);
    else if (lastList) { seq++; showList(lastList.q, lastList.rows); }
    else { seq++; out.innerHTML = ''; input.value = ''; }
  });

  // Deep link: /cek?bib=50920 opens that runner's card directly.
  var boot = (new URLSearchParams(location.search).get('bib') || '').trim();
  if (boot) { input.value = boot; openRunner(boot, true); }
})();
