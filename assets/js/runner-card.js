/* ==========================================================================
   Runner card — the ONE runner detail card, shared by /cek (inline card) and
   the Race Results page (inside the detail modal). Styles:
   assets/css/runner-card.css (everything scoped under .rc). English only.

   window.PLN_RUNNER_CARD.renderRunnerCard(runner, opts) -> HTMLElement
     runner : a ?mode=one runner from the pln-5k endpoint
     opts   : {
       city            : { key, name }  certificate template / file name
       titleId         : id for the name heading (aria-labelledby / focus)
       showSearchAgain : true -> outline SEARCH AGAIN button (/cek)
       onSearchAgain   : click handler for it
       onClose         : given -> X button in the card corner (modal)
     }
   window.PLN_RUNNER_CARD.renderCardState(opts) -> HTMLElement
     Same card shell for loading / not found / error:
     { title, text, loading, onRetry, onClose, titleId }

   Rules kept on purpose:
   - SPLIT TIMES is left out ENTIRELY when runner.checkpoints is empty (no
     empty heading, no "-" placeholder).
   - "of <category_size>" only when category_size is not null.
   - Certificate: rendered and turned into a File as soon as the card
     opens; the button reads "PREPARING..." until then. The click only
     calls PLN_CERT.deliver() — nothing is awaited first, because iOS only
     allows navigator.share() within a live user gesture.
   ========================================================================== */
(function () {
  'use strict';

  var T = {
    bib: 'BIB',
    finish: 'Finish Time', rank: 'Rank', pace: 'Pace', splits: 'Split Times', of: 'of',
    review: 'Your result is being reviewed by the race committee. Your time and rank will appear once the review is complete.',
    notFinished: 'You haven\'t finished yet. Your time will appear here automatically.',
    reviewCert: 'The certificate is available once the review is complete.',
    download: 'Download Certificate',
    preparing: 'Preparing...',
    again: 'Search again',
    close: 'Close',
    retry: 'Try again'
  };
  var DL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function closeBtn() { return '<button class="rc__close" type="button" data-rc-close aria-label="' + T.close + '"><span aria-hidden="true">&times;</span></button>'; }
  function stat(label, value, sub) {
    return '<div class="rc__stat"><dt class="rc__label">' + esc(label) + '</dt><dd>' + value + (sub ? '<span class="rc__sub">' + esc(sub) + '</span>' : '') + '</dd></div>';
  }

  function renderRunnerCard(r, opts) {
    opts = opts || {};
    var ok = r.status === 'ok';
    var finished = ok && !!r.time;
    var titleId = opts.titleId || 'rc-title';

    var html = '<article class="rc' + (opts.onClose ? ' rc--closable' : '') + '" aria-labelledby="' + esc(titleId) + '">' +
      (opts.onClose ? closeBtn() : '') +
      '<h2 class="rc__name" id="' + esc(titleId) + '" tabindex="-1">' + esc(r.name || '') + '</h2>' +
      '<p class="rc__bib"><span>' + T.bib + '</span>' + esc(r.bib) + '</p>' +
      (r.category ? '<span class="rc__chip">' + esc(r.category) + '</span>' : '');

    if (!ok) {
      html += '<p class="rc__review" role="status">' + esc(T.review) + '</p>';
    } else if (!finished) {
      html += '<p class="rc__review" role="status">' + esc(T.notFinished) + '</p>';
    } else {
      html += '<div class="rc__finish"><span class="rc__label">' + esc(T.finish) + '</span><span class="rc__time">' + esc(r.time) + '</span></div>';
      var stats = '';
      if (r.rank != null) stats += stat(T.rank, esc(r.rank) + (r.category_size != null ? ' <small>' + esc(T.of) + ' ' + esc(r.category_size) + '</small>' : ''), r.category || '');
      if (r.pace) stats += stat(T.pace, esc(r.pace) + (r.pace_unit ? ' <small>' + esc(r.pace_unit) + '</small>' : ''));
      if (stats) html += '<dl class="rc__stats">' + stats + '</dl>';
      var cps = Array.isArray(r.checkpoints) ? r.checkpoints.filter(function (c) { return c && c.label && c.time; }) : [];
      if (cps.length) {
        html += '<section class="rc__splits"><h3 class="rc__label">' + esc(T.splits) + '</h3><ol>' +
          cps.map(function (c) { return '<li><span>' + esc(c.label) + '</span><b>' + esc(c.time) + '</b></li>'; }).join('') +
        '</ol></section>';
      }
    }

    html += '<div class="rc__actions">';
    if (finished || !ok) {
      html += '<button class="rc__btn" type="button" data-rc-cert disabled aria-disabled="true">' + DL_ICON +
        '<span data-rc-cert-label>' + esc(finished ? T.preparing : T.download) + '</span></button>';
      if (!ok) html += '<p class="rc__hint">' + esc(T.reviewCert) + '</p>';
      html += '<p class="rc__hint rc__hint--err" data-rc-cert-msg role="alert" hidden></p>';
    }
    if (opts.showSearchAgain) html += '<button class="rc__btn rc__btn--ghost" type="button" data-rc-again>' + esc(T.again) + '</button>';
    html += '</div></article>';

    var card = el(html);
    if (opts.onClose) card.querySelector('[data-rc-close]').addEventListener('click', opts.onClose);
    if (opts.showSearchAgain && opts.onSearchAgain) card.querySelector('[data-rc-again]').addEventListener('click', opts.onSearchAgain);

    if (finished) wireCertificate(card, r, opts.city);
    return card;
  }

  // Prepare the PNG now; the click only delivers it (share sheet / download).
  function wireCertificate(card, r, city) {
    var btn = card.querySelector('[data-rc-cert]');
    var label = card.querySelector('[data-rc-cert-label]');
    var msg = card.querySelector('[data-rc-cert-msg]');
    var prepared = null, failed = null;
    function ready(enabled, text) {
      btn.disabled = !enabled;
      if (enabled) btn.removeAttribute('aria-disabled'); else btn.setAttribute('aria-disabled', 'true');
      label.textContent = text;
    }
    function showError(e) { msg.textContent = (e && e.message) || ''; msg.hidden = !msg.textContent; }
    function prep() {
      prepared = null; failed = null;
      ready(false, T.preparing);
      return window.PLN_CERT.prepare(r, city).then(function (p) {
        prepared = p; msg.hidden = true; ready(true, T.download);
      }, function (e) {
        failed = e; showError(e); ready(true, T.download);   // click retries
      });
    }
    btn.addEventListener('click', function () {
      if (prepared) { window.PLN_CERT.deliver(prepared); return; }   // no await before share()
      if (failed) {
        // The gesture is gone once we re-render, so this retry downloads the
        // file instead of opening the share sheet.
        prep().then(function () { if (prepared) window.PLN_CERT.deliver({ blob: prepared.blob, filename: prepared.filename, file: null }); });
      }
    });
    prep();
  }

  function renderCardState(opts) {
    opts = opts || {};
    var titleId = opts.titleId || 'rc-title';
    var card = el('<article class="rc rc--state' + (opts.onClose ? ' rc--closable' : '') + '" aria-labelledby="' + esc(titleId) + '">' +
      (opts.onClose ? closeBtn() : '') +
      '<h2 class="rc__name' + (opts.muted ? ' rc__name--muted' : '') + '" id="' + esc(titleId) + '" tabindex="-1">' + esc(opts.title || '') + '</h2>' +
      (opts.loading ? '<p class="rc__loading" role="status"><span class="rc__spin" aria-hidden="true"></span>' + esc(opts.text || '') + '</p>' : '') +
      (!opts.loading && opts.text ? '<p class="rc__review" role="alert">' + esc(opts.text) + '</p>' : '') +
      (opts.onRetry ? '<div class="rc__actions"><button class="rc__btn rc__btn--ghost" type="button" data-rc-retry>' + T.retry + '</button></div>' : '') +
    '</article>');
    if (opts.onClose) card.querySelector('[data-rc-close]').addEventListener('click', opts.onClose);
    if (opts.onRetry) card.querySelector('[data-rc-retry]').addEventListener('click', opts.onRetry);
    return card;
  }

  window.PLN_RUNNER_CARD = { renderRunnerCard: renderRunnerCard, renderCardState: renderCardState };
})();
