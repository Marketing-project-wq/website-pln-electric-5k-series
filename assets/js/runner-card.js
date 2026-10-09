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
       shareUrl        : given -> outline SHARE MY RESULT button (share sheet,
                         else copies the link) — /cek passes ?bib= links
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
   - FINISH TIME = `time` (gun time, the basis of the rankings). NET TIME is
     shown from the API's `net_time` only — never computed here, never
     filled with gun time, never "00:00". net_basis "unavailable" hides it
     and says "No start-mat reading recorded" instead.
   - PACE = `pace` (from gun time), matching the FINISH TIME above it.
   - race_status 'REGISTERED' (registered, hasn't raced yet — e.g. Yogyakarta
     before race day): "you're registered" + the start CORAL, certificate
     disabled with its own hint. Checked BEFORE the "under review" branch,
     which still covers every other non-'ok' status (PACER, NOT IN REVISI…).
   - Certificate: rendered and turned into a File as soon as the card
     opens; the button reads "PREPARING..." until then. The click only
     calls PLN_CERT.deliver() — nothing is awaited first, because iOS only
     allows navigator.share() within a live user gesture.
   ========================================================================== */
(function () {
  'use strict';

  var T = {
    bib: 'BIB',
    finish: 'Finish Time (Gun Time)', net: 'Net Time (Chip Time)', rank: 'Rank', pace: 'Pace', splits: 'Split Times', of: 'of',
    offset: function (o) { return 'Crossed the start line ' + o + ' after the gun'; },
    noStartMat: 'No start-mat reading recorded',
    review: 'Your result is being reviewed by the race committee. Your time and rank will appear once the review is complete.',
    notFinished: 'You haven\'t finished yet. Your time will appear here automatically.',
    reviewCert: 'The certificate is available once the review is complete.',
    registered: 'You\'re registered. Your time will appear here automatically once you cross the finish line.',
    coral: 'Start Coral',
    registeredCert: 'Your certificate will be available here after you finish.',
    download: 'Download Certificate',
    preparing: 'Preparing...',
    again: 'Search again',
    shareLink: 'Share My Result',
    linkCopied: 'Link copied',
    linkFailed: 'Could not copy the link',
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
  // Net time as sent by the API, or null (unknown / no start-mat reading).
  function netTimeOf(r) {
    if (!r || r.net_basis === 'unavailable') return null;
    return r.net_time ? String(r.net_time) : null;
  }
  function stat(label, value, sub) {
    return '<div class="rc__stat"><dt class="rc__label">' + esc(label) + '</dt><dd>' + value + (sub ? '<span class="rc__sub">' + esc(sub) + '</span>' : '') + '</dd></div>';
  }

  function renderRunnerCard(r, opts) {
    opts = opts || {};
    var ok = r.status === 'ok';
    var finished = ok && !!r.time;
    var registered = r.race_status === 'REGISTERED';
    var titleId = opts.titleId || 'rc-title';

    var html = '<article class="rc' + (opts.onClose ? ' rc--closable' : '') + '" aria-labelledby="' + esc(titleId) + '">' +
      (opts.onClose ? closeBtn() : '') +
      '<h2 class="rc__name" id="' + esc(titleId) + '" tabindex="-1">' + esc(r.name || '') + '</h2>' +
      '<p class="rc__bib"><span>' + T.bib + '</span>' + esc(r.bib) + '</p>' +
      (r.category ? '<span class="rc__chip">' + esc(r.category) + '</span>' : '');

    if (registered) {
      // Registered, not raced yet (race_status REGISTERED, status 'pending'):
      // not "under review". Show the start coral — the most useful thing on
      // race morning. No time, rank or splits exist yet.
      html += '<p class="rc__review" role="status">' + esc(T.registered) + '</p>';
      if (r.coral) html += '<dl class="rc__stats rc__stats--one">' + stat(T.coral, esc(r.coral)) + '</dl>';
    } else if (!ok) {
      html += '<p class="rc__review" role="status">' + esc(T.review) + '</p>';
    } else if (!finished) {
      html += '<p class="rc__review" role="status">' + esc(T.notFinished) + '</p>';
    } else {
      var net = netTimeOf(r);
      html += '<div class="rc__finish"><span class="rc__label">' + esc(T.finish) + '</span><span class="rc__time">' + esc(r.time) + '</span>';
      if (r.net_basis === 'unavailable') {
        html += '<p class="rc__netnote">' + esc(T.noStartMat) + '</p>';
      } else if (net) {
        html += '<p class="rc__net"><span class="rc__net-label">' + esc(T.net) + '</span> <span class="rc__net-time">' + esc(net) + '</span></p>';
        if (r.start_offset) html += '<p class="rc__netnote">' + esc(T.offset(r.start_offset)) + '</p>';
      }
      html += '</div>';
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
      if (registered) html += '<p class="rc__hint">' + esc(T.registeredCert) + '</p>';
      else if (!ok) html += '<p class="rc__hint">' + esc(T.reviewCert) + '</p>';
      html += '<p class="rc__hint rc__hint--err" data-rc-cert-msg role="alert" hidden></p>';
    }
    if (opts.shareUrl) {
      html += '<button class="rc__btn rc__btn--ghost" type="button" data-rc-link>' + esc(T.shareLink) + '</button>' +
        '<p class="rc__hint" data-rc-link-msg role="status" hidden></p>';
    }
    if (opts.showSearchAgain) html += '<button class="rc__btn rc__btn--ghost" type="button" data-rc-again>' + esc(T.again) + '</button>';
    html += '</div></article>';

    var card = el(html);
    if (opts.onClose) card.querySelector('[data-rc-close]').addEventListener('click', opts.onClose);
    if (opts.showSearchAgain && opts.onSearchAgain) card.querySelector('[data-rc-again]').addEventListener('click', opts.onSearchAgain);

    if (opts.shareUrl) wireShareLink(card, opts.shareUrl);
    if (finished) wireCertificate(card, r, opts.city);
    return card;
  }

  // Share sheet where available (called straight from the click — iOS needs
  // the live gesture); otherwise copy the link and say so for 2.5 s.
  function wireShareLink(card, u) {
    var btn = card.querySelector('[data-rc-link]');
    var msg = card.querySelector('[data-rc-link-msg]');
    var timer = null;
    function say(text) {
      msg.textContent = text; msg.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(function () { msg.hidden = true; }, 2500);
    }
    function legacyCopy() {
      var ta = document.createElement('textarea');
      ta.value = u; ta.setAttribute('readonly', '');
      ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      say(ok ? T.linkCopied : T.linkFailed);
    }
    btn.addEventListener('click', function () {
      if (navigator.share) {
        navigator.share({ title: document.title, url: u }).catch(function () {});   // AbortError etc.: ignore
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(u).then(function () { say(T.linkCopied); }, legacyCopy);
      } else {
        legacyCopy();
      }
    });
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

  window.PLN_RUNNER_CARD = { renderRunnerCard: renderRunnerCard, renderCardState: renderCardState, netTimeOf: netTimeOf };
})();
