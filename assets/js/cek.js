/* ==========================================================================
   /cek — venue quick-check page (QR on the LED screen). One search box:
   - all digits  -> ?mode=one&bib= ; if not found, fall back to the list
   - otherwise   -> ?mode=list&q=&limit=20 ; tap a row -> ?mode=one&bib=
   Always &slug=pln-jakarta. Searching happens on the server; the page never
   pulls the whole field. The endpoint is public by design (no keys here).
   ========================================================================== */
(function () {
  'use strict';
  var API = 'https://cpvzwqptzcxnwzfzgrmt.supabase.co/functions/v1/pln-5k';
  var CITY = { key: 'jakarta', name: 'Jakarta', slug: 'pln-jakarta' };
  var LIST_LIMIT = 20;

  var T = {
    searching: 'Searching…',
    loadingRunner: 'Loading result…',
    notFound: 'No runner found. Check the BIB number or try part of your name.',
    notFinished: 'You haven\'t finished yet. Your time will appear here automatically.',
    error: 'Couldn\'t reach the results server. Check your connection and try again.',
    retry: 'Try again',
    matches: function (n) { return n + (n === 1 ? ' runner matches' : ' runners match') + ' — tap your name'; },
    more: 'Showing the first ' + LIST_LIMIT + '. Type more of your name to narrow it down.',
    back: '← Back to list',
    bib: 'BIB',
    finish: 'Finish Time', rank: 'Rank', pace: 'Pace', splits: 'Split Times', of: 'of',
    review: 'Your result is being reviewed by the race committee. Your time and rank will appear once the review is complete.',
    reviewCert: 'The certificate is available once the review is complete.',
    download: 'Download Certificate',
    again: 'Search again'
  };

  var form = document.querySelector('[data-search]');
  var input = form.querySelector('input');
  var out = document.querySelector('[data-out]');
  var seq = 0;
  var lastList = null; // { q, rows } — for "Back to list"

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
  var DL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';

  // ---- Views ---------------------------------------------------------------
  function loading(text) { out.innerHTML = '<p class="loading" role="status"><span class="spin" aria-hidden="true"></span>' + esc(text) + '</p>'; }
  function message(text, warn) { out.innerHTML = '<div class="msg' + (warn ? ' msg--warn' : '') + '"><p>' + esc(text) + '</p></div>'; }
  function failure(retry) {
    out.innerHTML = '<div class="msg msg--warn" role="alert"><p>' + esc(T.error) + '</p>' +
      '<button class="btn btn--ghost" type="button" data-retry>' + esc(T.retry) + '</button></div>';
    out.querySelector('[data-retry]').addEventListener('click', retry);
  }
  function againButton() { return '<button class="btn btn--ghost" type="button" data-again>' + esc(T.again) + '</button>'; }

  function showList(q, rows) {
    lastList = { q: q, rows: rows };
    out.innerHTML =
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

  function stat(label, value, sub) {
    return '<div class="stat"><dt class="label">' + esc(label) + '</dt><dd>' + value + (sub ? '<span class="stat__sub">' + esc(sub) + '</span>' : '') + '</dd></div>';
  }
  function showCard(r, fromList) {
    var ok = r.status === 'ok';
    var finished = ok && !!r.time;
    var html = (fromList ? '<button class="back" type="button" data-back>' + esc(T.back) + '</button>' : '') +
      '<article class="card" aria-labelledby="card-name">' +
        '<h1 class="card__name" id="card-name">' + esc(r.name || '') + '</h1>' +
        '<p class="card__bib"><span>' + esc(T.bib) + '</span>' + esc(r.bib) + '</p>' +
        (r.category ? '<span class="badge">' + esc(r.category) + '</span>' : '');

    if (!ok) {
      html += '<p class="review" role="status">' + esc(T.review) + '</p>';
    } else if (!finished) {
      html += '<p class="review" role="status">' + esc(T.notFinished) + '</p>';
    } else {
      html += '<div class="finish"><span class="label">' + esc(T.finish) + '</span><span class="finish__time">' + esc(r.time) + '</span></div>';
      var stats = '';
      if (r.rank != null) stats += stat(T.rank, esc(r.rank) + (r.category_size != null ? ' <small>' + esc(T.of) + ' ' + esc(r.category_size) + '</small>' : ''), r.category || '');
      if (r.pace) stats += stat(T.pace, esc(r.pace) + (r.pace_unit ? ' <small>' + esc(r.pace_unit) + '</small>' : ''));
      if (stats) html += '<dl class="stats">' + stats + '</dl>';
      var cps = Array.isArray(r.checkpoints) ? r.checkpoints.filter(function (c) { return c && c.label && c.time; }) : [];
      if (cps.length) {
        html += '<section class="splits"><h2 class="label">' + esc(T.splits) + '</h2><ol>' +
          cps.map(function (c) { return '<li><span>' + esc(c.label) + '</span><b>' + esc(c.time) + '</b></li>'; }).join('') +
        '</ol></section>';
      }
    }

    html += '<div class="actions">';
    if (finished || !ok) {
      html += '<button class="btn" type="button" data-cert' + (finished ? '' : ' disabled aria-disabled="true"') + '>' + DL_ICON + esc(T.download) + '</button>';
      if (!ok) html += '<p class="hint">' + esc(T.reviewCert) + '</p>';
      html += '<p class="hint hint--err" data-cert-msg role="alert" hidden></p>';
    }
    html += againButton() + '</div></article>';
    out.innerHTML = html;

    var cert = out.querySelector('[data-cert]');
    if (cert && finished) cert.addEventListener('click', function () {
      var msg = out.querySelector('[data-cert-msg]');
      msg.hidden = true; cert.disabled = true;
      window.PLN_CERT.download(r, CITY)
        .catch(function (e) { msg.textContent = e.message; msg.hidden = false; })
        .then(function () { cert.disabled = false; });
    });
    var back = out.querySelector('[data-back]');
    if (back) back.addEventListener('click', function () {
      if (!lastList) return;
      showList(lastList.q, lastList.rows);
      var b = out.querySelector('[data-bib="' + String(r.bib).replace(/"/g, '') + '"]');
      if (b) b.focus();
    });
    var h = document.getElementById('card-name');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); out.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  }

  // ---- Flow ----------------------------------------------------------------
  function searchList(q, my) {
    loading(T.searching);
    return api({ mode: 'list', q: q, limit: LIST_LIMIT, offset: 0 }).then(function (j) {
      if (my !== seq) return;
      var rows = (j && j.rows) || [];
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
            if (j && j.runner) showCard(j.runner, false);
            else return searchList(q, my);
          });
        }
      : function () { return searchList(q, my); };
    run().catch(function () { if (my === seq) failure(function () { search(q); }); });
  }
  function openRunner(bib) {
    var my = ++seq;
    loading(T.loadingRunner);
    api({ mode: 'one', bib: bib }).then(function (j) {
      if (my !== seq) return;
      if (j && j.runner) showCard(j.runner, !!lastList);
      else message(T.notFound, true);
    }).catch(function () { if (my === seq) failure(function () { openRunner(bib); }); });
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
    if (b) { openRunner(b.getAttribute('data-bib')); return; }
    if (e.target.closest('[data-again]')) {
      seq++; lastList = null;
      input.value = '';
      out.innerHTML = '';
      input.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
})();
