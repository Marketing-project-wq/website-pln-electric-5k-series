/* ==========================================================================
   accordion.js — FAQ accordion. Progressive enhancement of markup:
   <div class="accordion">
     <div class="accordion__item">
       <h3><button class="accordion__btn">Q...<span class="accordion__icon"></span></button></h3>
       <div class="accordion__panel"><div class="accordion__panel-inner">A...</div></div>
     </div>
   </div>
   On mobile only one panel stays open; on desktop multiple may open.
   ========================================================================== */

(function () {
  'use strict';

  function init() {
    document.querySelectorAll('.accordion').forEach(function (acc, ai) {
      var single = acc.hasAttribute('data-single');
      acc.querySelectorAll('.accordion__btn').forEach(function (btn, i) {
        var panel = btn.closest('.accordion__item').querySelector('.accordion__panel');
        var id = 'acc-' + ai + '-' + i;
        panel.id = panel.id || id;
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', panel.id);
        btn.addEventListener('click', function () {
          var open = btn.getAttribute('aria-expanded') === 'true';
          var mobile = window.innerWidth <= 767;
          if ((single || mobile) && !open) {
            acc.querySelectorAll('.accordion__btn').forEach(function (b) { if (b !== btn) collapse(b); });
          }
          open ? collapse(btn) : expand(btn);
        });
      });
    });
  }

  function expand(btn) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', 'true');
    panel.style.maxHeight = panel.scrollHeight + 'px';
  }
  function collapse(btn) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.setAttribute('aria-expanded', 'false');
    panel.style.maxHeight = null;
  }

  // Recompute open panel heights on resize.
  var raf;
  window.addEventListener('resize', function () {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      document.querySelectorAll('.accordion__btn[aria-expanded="true"]').forEach(function (btn) {
        var panel = document.getElementById(btn.getAttribute('aria-controls'));
        panel.style.maxHeight = panel.scrollHeight + 'px';
      });
    });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
