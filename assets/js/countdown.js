/* ==========================================================================
   countdown.js — counts down to the next upcoming city race day.
   Reads targets from EVENT_DATA (data.js). Mount points:
   <div data-countdown></div>            -> global next race day
   <div data-countdown="jakarta"></div>  -> specific city
   ========================================================================== */

(function () {
  'use strict';
  var D = window.EVENT_DATA;
  if (!D) return;
  var ui = D.ui[D.LANG];

  function buildClock(mount, target, label) {
    mount.innerHTML =
      '<div class="countdown">' +
        '<span class="countdown__label">' + label + '</span>' +
        '<div class="countdown__clock" aria-live="polite">' +
          unit('d') + unit('h') + unit('m') + unit('s') +
        '</div>' +
      '</div>';
    tick(mount, target);
  }
  function unit(u) {
    return '<div class="countdown__unit"><span class="countdown__val" data-u="' + u + '">--</span><span class="countdown__u">' + ui.countdownUnits[u] + '</span></div>';
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function tick(mount, target) {
    function update() {
      var diff = target - new Date();
      if (diff <= 0) {
        mount.querySelector('.countdown__clock').innerHTML = '<span class="countdown__done">' + ui.countdownDone + '</span>';
        return;
      }
      var d = Math.floor(diff / 86400000);
      var h = Math.floor(diff / 3600000) % 24;
      var m = Math.floor(diff / 60000) % 60;
      var s = Math.floor(diff / 1000) % 60;
      set(mount, 'd', d); set(mount, 'h', pad(h)); set(mount, 'm', pad(m)); set(mount, 's', pad(s));
      requestAnimationFrame(function () { setTimeout(update, 1000); });
    }
    update();
  }
  function set(mount, u, v) { var n = mount.querySelector('[data-u="' + u + '"]'); if (n) n.textContent = v; }

  function init() {
    document.querySelectorAll('[data-countdown]').forEach(function (mount) {
      var key = mount.getAttribute('data-countdown');
      var city = key ? D.cities.filter(function (c) { return c.key === key; })[0] : D.nextCity();
      if (!city) { mount.innerHTML = '<p class="countdown__done">' + ui.allDone + '</p>'; return; }
      var label = ui.countdownTo + ' · ' + city.name;
      buildClock(mount, new Date(city.raceDayISO), label);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
