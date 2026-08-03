/* ==========================================================================
   main.js — header/footer injection, nav, language switch, register modal,
   scroll-reveal, and data-driven component renderers.
   Depends on: data.js (window.EVENT_DATA)
   ========================================================================== */

(function () {
  'use strict';
  var D = window.EVENT_DATA;
  if (!D) { console.error('EVENT_DATA missing — load data.js first.'); return; }
  var LANG = D.LANG;
  var OTHER = LANG === 'id' ? 'en' : 'id';

  // ---- Small helpers ------------------------------------------------------
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function icon(name, cls) { return '<svg class="' + (cls || 'icon') + '" aria-hidden="true"><use href="/assets/img/icons/sprite.svg#' + name + '"></use></svg>'; }
  function statusClass(s) { return 'badge badge--' + s; }

  // ---- Partial injection --------------------------------------------------
  function injectPartials() {
    var headerMount = document.getElementById('site-header');
    var footerMount = document.getElementById('site-footer');
    var jobs = [];
    if (headerMount) jobs.push(load('/assets/partials/header-' + LANG + '.html', headerMount));
    if (footerMount) jobs.push(load('/assets/partials/footer-' + LANG + '.html', footerMount));
    Promise.all(jobs).then(function () {
      wireNav();
      setActiveNav();
      setLangSwitch();
      wireRegisterButtons();
    });
  }

  function load(url, mount) {
    return fetch(url).then(function (r) { return r.text(); }).then(function (html) {
      mount.innerHTML = html;
    }).catch(function (e) { console.error('Partial load failed:', url, e); });
  }

  // Body scroll lock shared by the mobile menu and the register modal.
  var _locks = 0;
  function lockScroll(on) {
    _locks = Math.max(0, _locks + (on ? 1 : -1));
    var locked = _locks > 0;
    document.documentElement.style.overflow = locked ? 'hidden' : '';
    document.body.style.overflow = locked ? 'hidden' : '';
  }

  // ---- Nav interactions ---------------------------------------------------
  function wireNav() {
    var toggle = document.querySelector('.nav__toggle');
    var menu = document.querySelector('.nav__menu');
    if (toggle && menu) {
      function setMenu(open) {
        if (menu.classList.contains('is-open') === open) return;
        menu.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        lockScroll(open);
      }
      toggle.addEventListener('click', function () {
        setMenu(!menu.classList.contains('is-open'));
      });
      // Close (and unlock) if the viewport grows to desktop while the menu is open.
      window.addEventListener('resize', function () {
        if (window.innerWidth >= 1024) setMenu(false);
      });
    }
    // Mobile dropdown accordions
    document.querySelectorAll('.nav__item--has-menu > .nav__link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        if (window.innerWidth <= 1023) {
          e.preventDefault();
          link.parentElement.classList.toggle('nav__item--open');
        }
      });
    });
  }

  function setActiveNav() {
    var path = location.pathname.replace(/index\.html$/, '').replace(/\/$/, '/');
    document.querySelectorAll('.nav__link[href], .nav__dropdown a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href === '#') return;
      var norm = href.replace(/index\.html$/, '').replace(/\/$/, '/');
      if (path === norm || (norm.length > 3 && path.indexOf(norm) === 0)) {
        a.setAttribute('aria-current', 'page');
        var top = a.closest('.nav__item--has-menu');
        if (top) top.querySelector('.nav__link').setAttribute('aria-current', 'page');
      }
    });
  }

  // Point ID<->EN switch at the equivalent page (same slug, swapped folder).
  function setLangSwitch() {
    var target = location.pathname.replace('/' + LANG + '/', '/' + OTHER + '/');
    if (target === location.pathname) target = '/' + OTHER + '/index.html';
    document.querySelectorAll('[data-lang-target]').forEach(function (a) {
      var to = a.getAttribute('data-lang-target');
      a.setAttribute('href', to === OTHER ? target + location.hash : location.pathname + location.hash);
    });
  }

  // ---- Register modal -----------------------------------------------------
  var modal;
  function buildModal() {
    var ui = D.ui[LANG];
    var stepsHtml = ui.steps.map(function (s) { return '<li><span>' + s + '</span></li>'; }).join('');
    modal = el(
      '<div class="modal" id="register-modal" role="dialog" aria-modal="true" aria-labelledby="register-modal-title">' +
        '<div class="modal__overlay" data-close></div>' +
        '<div class="modal__dialog">' +
          '<button class="modal__close" data-close aria-label="' + ui.close + '">' + icon('i-arrow-right') + '</button>' +
          '<span class="kicker">PLN Mobile</span>' +
          '<h2 id="register-modal-title">' + ui.modalTitle + '</h2>' +
          '<p>' + ui.modalIntro + '</p>' +
          '<ol class="steps">' + stepsHtml + '</ol>' +
          '<div class="store-badges">' +
            '<a class="store-badge" href="https://apps.apple.com/id/app/pln-mobile/id1299581030" target="_blank" rel="noopener noreferrer" aria-label="Download on the App Store">' + icon('i-download') + '<span><small>' + ui.storeApple + '</small><b>App Store</b></span></a>' +
            '<a class="store-badge" href="https://play.google.com/store/apps/details?id=com.icon.pln123&hl=id&pli=1" target="_blank" rel="noopener noreferrer" aria-label="Get it on Google Play">' + icon('i-download') + '<span><small>' + ui.storeGoogle + '</small><b>Google Play</b></span></a>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    document.body.appendChild(modal);
    // Use closest() so a click on the X button's inner <svg>/<use> still counts
    // as a close (the button carries data-close, its icon does not).
    modal.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });
  }
  var lastFocus;
  // Idempotent: guard on is-open so a double open()/close() (e.g. a click caught
  // by both the direct and delegated handlers) can't unbalance the scroll lock.
  function openModal() {
    if (!modal) buildModal();
    if (modal.classList.contains('is-open')) return;
    lastFocus = document.activeElement;
    modal.classList.add('is-open');
    lockScroll(true);
    modal.querySelector('.modal__close').focus();
  }
  function closeModal() {
    if (!modal || !modal.classList.contains('is-open')) return;
    modal.classList.remove('is-open');
    lockScroll(false);
    if (lastFocus) lastFocus.focus();
  }

  function wireRegisterButtons() {
    document.querySelectorAll('[data-register]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); openModal(); });
    });
  }
  // Delegate for buttons rendered later
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-register]');
    if (b) { e.preventDefault(); openModal(); }
  });

  // ---- Renderers ----------------------------------------------------------
  function cityHref(c) { return '/' + LANG + '/city/' + c.key + '.html'; }

  function cityCard(c) {
    var ui = D.ui[LANG];
    var st = D.cityStatus(c);
    return (
      '<article class="card city-card" data-reveal>' +
        '<div class="ph city-card__media"><span class="ph__label">' + icon('i-image') + 'Foto: ' + c.name + '</span></div>' +
        '<div class="city-card__body">' +
          '<span class="city-card__index">' + ('0' + c.order) + ' / 03</span>' +
          '<h3 class="city-card__name">' + c.name + '</h3>' +
          '<span class="' + statusClass(st) + '">' + ui.status[st] + '</span>' +
          '<dl class="city-card__meta">' +
            '<div><strong>' + D.loc(c.raceDay) + '</strong> · ' + D.loc(c.startTime) + '</div>' +
            '<div>' + ui.quotaLabel + ': <strong>' + c.quota.toLocaleString('id-ID') + '</strong></div>' +
          '</dl>' +
          '<div class="city-card__foot"><a class="btn btn--ghost btn--sm" href="' + cityHref(c) + '">' + ui.viewCity + ' ' + icon('i-arrow-right') + '</a></div>' +
        '</div>' +
      '</article>'
    );
  }

  function renderCityCards() {
    document.querySelectorAll('[data-city-cards]').forEach(function (mount) {
      var exclude = mount.getAttribute('data-exclude');
      var list = D.cities.filter(function (c) { return c.key !== exclude; });
      mount.classList.add('card-grid');
      mount.classList.add(list.length === 2 ? 'card-grid--2' : 'card-grid--3');
      mount.innerHTML = list.map(cityCard).join('');
    });
  }

  function activeTicketWeek() {
    // Determine current ticket phase by sale window:
    //   Super Early Bird = August week 3, Early Bird = August week 4,
    //   General Sales = September week 1 onwards.
    var ref = new Date();
    var phase = {
      1: new Date('2026-08-15T00:00:00+07:00'),  // Super Early Bird opens (Aug wk3)
      2: new Date('2026-08-22T00:00:00+07:00'),  // Early Bird (Aug wk4)
      3: new Date('2026-09-01T00:00:00+07:00')   // General Sales (Sep wk1)
    };
    if (ref < phase[1]) return 0;        // not yet on sale
    if (ref < phase[2]) return 1;        // super early bird
    if (ref < phase[3]) return 2;        // early bird
    return 3;                            // general onwards
  }

  function renderTicketTiers() {
    var activeWeek = activeTicketWeek();
    document.querySelectorAll('[data-ticket-tiers]').forEach(function (mount) {
      mount.classList.add('card-grid', 'card-grid--4');
      mount.innerHTML = D.tickets.map(function (tk) {
        var cls = 'tier';
        if (tk.week) {
          if (activeWeek === tk.week) cls += ' is-active';
          else if (activeWeek > tk.week) cls += ' is-past';
        }
        var flag = (tk.week && activeWeek === tk.week) ? '<span class="tier__flag">Aktif</span>' : '';
        return (
          '<div class="' + cls + '" data-reveal>' + flag +
            '<span class="tier__name">' + D.loc(tk.name) + '</span>' +
            (tk.discount ? '<span class="badge badge--open tier__discount">-' + tk.discount + '%</span>' : '<span class="badge badge--upcoming tier__discount">Normal</span>') +
            '<span class="tier__price">' + D.formatIDR(tk.price) + '</span>' +
            '<span class="tier__period">' + D.loc(tk.period) + '</span>' +
          '</div>'
        );
      }).join('');
    });
  }

  function renderTicketTable() {
    document.querySelectorAll('[data-ticket-table]').forEach(function (mount) {
      var head = LANG === 'id'
        ? ['Tier', 'Diskon', 'Harga', 'Periode (indikatif)']
        : ['Tier', 'Discount', 'Price', 'Period (indicative)'];
      var rows = D.tickets.map(function (tk) {
        return '<tr><td data-label="' + head[0] + '">' + D.loc(tk.name) + '</td><td data-label="' + head[1] + '">' + (tk.discount ? '-' + tk.discount + '%' : '—') + '</td><td data-label="' + head[2] + '" class="num">' + D.formatIDR(tk.price) + '</td><td data-label="' + head[3] + '">' + D.loc(tk.period) + '</td></tr>';
      }).join('');
      mount.innerHTML = '<div class="table-wrap"><table class="data"><thead><tr><th>' + head.join('</th><th>') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    });
  }

  function renderPrizeTable() {
    document.querySelectorAll('[data-prize-table]').forEach(function (mount) {
      var head = LANG === 'id' ? ['Posisi', '5K Putra', '5K Putri'] : ['Position', '5K Men', '5K Women'];
      var rows = D.prizes.map(function (p) {
        return '<tr><td data-label="' + head[0] + '">' + D.loc(p.label) + '</td><td data-label="' + head[1] + '" class="num">' + D.formatIDR(p.men) + '</td><td data-label="' + head[2] + '" class="num">' + D.formatIDR(p.women) + '</td></tr>';
      }).join('');
      mount.innerHTML = '<div class="table-wrap table-wrap--prize"><table class="data data--prize"><thead><tr><th>' + head.join('</th><th>') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    });
  }

  function renderScheduleTable() {
    document.querySelectorAll('[data-schedule-table]').forEach(function (mount) {
      var ui = D.ui[LANG];
      var head = LANG === 'id'
        ? ['Kota', 'Race Pack Collection', 'Race Day', 'Peserta', 'Status', '']
        : ['City', 'Race Pack Collection', 'Race Day', 'Participants', 'Status', ''];
      var rows = D.cities.map(function (c) {
        var st = D.cityStatus(c);
        return '<tr><td data-label="' + head[0] + '"><strong>' + c.name + '</strong></td><td data-label="' + head[1] + '">' + D.loc(c.rpc) + '</td><td data-label="' + head[2] + '">' + D.loc(c.raceDay) + ' · ' + D.loc(c.startTime) + '</td><td data-label="' + head[3] + '" class="num">' + c.quota.toLocaleString('id-ID') + '</td><td data-label="' + head[4] + '"><span class="' + statusClass(st) + '">' + ui.status[st] + '</span></td><td data-label="" class="cell-action"><a href="' + cityHref(c) + '">' + ui.viewCity + ' →</a></td></tr>';
      }).join('');
      mount.innerHTML = '<div class="table-wrap"><table class="data"><thead><tr><th>' + head.join('</th><th>') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    });
  }

  function renderTimeline() {
    document.querySelectorAll('[data-timeline]').forEach(function (mount) {
      mount.classList.add('timeline');
      mount.innerHTML = D.timeline.map(function (p) {
        var items = D.loc(p.items) || [];
        var lis = items.map(function (it) { return '<li>' + it + '</li>'; }).join('');
        return '<div class="timeline__phase" data-reveal><span class="timeline__num">' + p.n + '</span><span class="timeline__month">' + D.loc(p.month) + '</span><span class="timeline__title">' + D.loc(p.phase) + '</span><ul class="timeline__list">' + lis + '</ul></div>';
      }).join('');
    });
  }

  function renderContextStats() {
    document.querySelectorAll('[data-context-stats]').forEach(function (mount) {
      mount.classList.add('fact-strip');
      mount.innerHTML = D.contextStats.map(function (s) {
        return '<div class="fact" data-reveal><div class="fact__num">' + s.num + '</div><div class="fact__label">' + D.loc(s.label) + '<span class="fact__src">Sumber: ' + s.src + '</span></div></div>';
      }).join('');
    });
  }

  function renderJourney() {
    document.querySelectorAll('[data-journey]').forEach(function (mount) {
      mount.classList.add('journey');
      var stops = D.cities.map(function (c) {
        return '<div class="journey__stop"><div class="journey__dot">' + ('0' + c.order) + '</div><div><div class="journey__city">' + c.name + '</div><div class="journey__date">' + D.loc(c.raceDay) + '</div></div></div>';
      }).join('');
      mount.innerHTML = '<div class="journey-reveal"><div class="journey__track">' + stops + '</div></div>';
    });
  }

  function cityByKey(k) { return D.cities.filter(function (c) { return c.key === k; })[0]; }

  // Inline city fields: <span data-city="jakarta" data-city-field="raceDay"></span>
  function fillCityFields() {
    document.querySelectorAll('[data-city-field]').forEach(function (n) {
      var c = cityByKey(n.getAttribute('data-city'));
      if (!c) return;
      var f = n.getAttribute('data-city-field');
      var ui = D.ui[LANG];
      if (f === 'name') n.textContent = c.name;
      else if (f === 'raceDay') n.textContent = D.loc(c.raceDay);
      else if (f === 'startTime') n.textContent = D.loc(c.startTime);
      else if (f === 'quota') n.textContent = c.quota.toLocaleString('id-ID');
      else if (f === 'rpc') n.textContent = D.loc(c.rpc);
      else if (f === 'venue') n.textContent = D.loc(c.venue);
      else if (f === 'note') n.textContent = D.loc(c.note);
      else if (f === 'status') { var st = D.cityStatus(c); n.textContent = ui.status[st]; n.className = statusClass(st); }
    });
  }

  // City info list: <dl data-city-info="jakarta"></dl>
  function renderCityInfo() {
    document.querySelectorAll('[data-city-info]').forEach(function (mount) {
      var c = cityByKey(mount.getAttribute('data-city-info'));
      if (!c) return;
      var ui = D.ui[LANG];
      var venueLabel = LANG === 'id' ? 'Venue' : 'Venue';
      var runnersWord = LANG === 'id' ? 'pelari' : 'runners';
      function row(ic, dt, dd) {
        return '<div><svg aria-hidden="true"><use href="/assets/img/icons/sprite.svg#' + ic + '"></use></svg><div><dt>' + dt + '</dt><dd>' + dd + '</dd></div></div>';
      }
      mount.classList.add('info-list');
      mount.innerHTML =
        row('i-calendar', ui.rpcLabel, D.loc(c.rpc)) +
        row('i-flag', ui.raceDayLabel, D.loc(c.raceDay) + ' · ' + D.loc(c.startTime)) +
        row('i-users', ui.quotaLabel, c.quota.toLocaleString('id-ID') + ' ' + runnersWord) +
        row('i-location', venueLabel, D.loc(c.venue) + ' 🟡');
    });
  }

  // Fill inline data tokens: <span data-fact="totalRunners"></span> etc.
  function fillFacts() {
    document.querySelectorAll('[data-fact]').forEach(function (n) {
      var k = n.getAttribute('data-fact');
      if (k === 'totalRunners') n.textContent = D.totalRunners.toLocaleString('id-ID');
      else if (k === 'prizeTotalPerCity') n.textContent = D.formatIDR(D.prizeTotalPerCity);
      else if (k === 'tagline') n.textContent = D.tagline;
    });
  }

  // ---- Gallery filter -----------------------------------------------------
  function initGallery() {
    var group = document.querySelector('[data-gallery-filters]');
    if (!group) return;
    var items = document.querySelectorAll('[data-gallery-item]');
    group.querySelectorAll('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-filter');
        group.querySelectorAll('[data-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
        items.forEach(function (it) {
          var show = f === 'all' || it.getAttribute('data-cat') === f;
          it.classList.toggle('is-hidden', !show);
        });
      });
    });
  }

  // ---- Scroll reveal ------------------------------------------------------
  function initReveal() {
    var els = document.querySelectorAll('[data-reveal]');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(function (e) { e.classList.add('is-visible'); });
      document.querySelectorAll('.journey-reveal').forEach(function (e) { e.classList.add('is-visible'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    els.forEach(function (e) { io.observe(e); });
    document.querySelectorAll('.journey-reveal').forEach(function (e) { io.observe(e); });
  }

  // ---- Boot ---------------------------------------------------------------
  function boot() {
    injectPartials();
    renderCityCards();
    renderTicketTiers();
    renderTicketTable();
    renderPrizeTable();
    renderScheduleTable();
    renderTimeline();
    renderContextStats();
    renderJourney();
    fillCityFields();
    renderCityInfo();
    fillFacts();
    initGallery();
    // countdown.js and accordion.js self-init.
    // Reveal after dynamic content is in the DOM.
    setTimeout(initReveal, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
