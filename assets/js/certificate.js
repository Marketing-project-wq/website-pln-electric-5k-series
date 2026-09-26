/* ==========================================================================
   Finisher certificate — shared by the Race Results page (en/ + id/) and the
   venue quick-check page (/cek). Draws the runner's details on <canvas> over
   /assets/certificate-<city>.png at the PNG's native size and downloads it as
   PLN-5K-<City>-<bib>-<NameWithoutSpaces>.png. Client-side only.

   Usage: window.PLN_CERT.download(runner, { key: 'jakarta', name: 'Jakarta' })
          -> Promise (rejects with an English, user-facing message)
   Only call it for runners with status "ok".
   ========================================================================== */
(function () {
  'use strict';

  // Cache-buster for the certificate template PNGs. The CDN cached a 404 for
  // the bare URL before the file existed; bump this whenever a template changes.
  var CERT_ASSET_VERSION = 2;
  function certSrc(city) { return '/assets/certificate-' + city.key + '.png?v=' + CERT_ASSET_VERSION; }

  var MSG = {
    missing: 'The certificate template is not available yet. Please try again later.',
    fail: 'Could not create the certificate. Please try again.'
  };

  // Positions are fractions of the PNG's own size so the layout follows the
  // template at any resolution. Adjust here if the artwork changes.
  // Measured on assets/certificate-jakarta.png (1240 x 1754):
  //   name line y=870, x=176..1066
  //   name  : centred, baseline sitting just above the name line
  //   boxes : outer rectangles in template pixels (scaled to the loaded PNG).
  //           Each box's lines are laid out as ONE vertical block centred on
  //           the box (see boxBlock), whatever the number of lines.
  var CERT = {
    textColor: '#FFFFFF',
    labelColor: '#8CD867',
    ref: { w: 1240, h: 1754 },                    // template size the px below refer to
    name: { x: 0.50, y: 0.482, maxW: 0.70, size: 0.050 },
    boxes: {
      rects: [                                    // [x0, y0, x1, y1]
        [173,  977, 545, 1178],                   // GENDER
        [694,  977, 1066, 1178],                  // BIB NUMBER
        [173, 1250, 545, 1451],                   // POSITION
        [694, 1250, 1066, 1451]                   // FINISH TIME
      ],
      padX: 28,                                   // horizontal inset for text width
      padY: 20,                                   // min clear space above/below the block
      border: 3,                                  // box line thickness (inside the rect)
      label: 30, value: 84, sub: 30,              // font px; sub (category) ~ label size
      gap: 14                                     // space between consecutive lines
    }
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
  // Draws `lines` as one vertical block centred in box `rect` (template px,
  // scaled by sx/sy). Line heights are the real ink bounds of each text, so
  // 2- and 3-line boxes are both centred with equal space above and below.
  // Each line first shrinks to fit the box width; if the block is then taller
  // than the box minus padY top and bottom, every line (and the gaps) scales
  // down by the same factor until it fits.
  function boxBlock(g, lines, rect, sx, sy) {
    var B = CERT.boxes;
    var x0 = rect[0] * sx, x1 = rect[2] * sx, y0 = rect[1] * sy, y1 = rect[3] * sy;
    var inset = (B.border + B.padY) * sy;
    var availH = (y1 - y0) - 2 * inset, maxW = (x1 - x0) - 2 * B.padX * sx;
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var scale = 1, m, blockH;
    function measure() {
      m = lines.map(function (l) {
        var size = fitFont(g, l.text, Math.max(6, Math.round(l.size * sy * scale)), maxW, l.weight, l.family);
        var t = g.measureText(l.text);
        var asc = t.actualBoundingBoxAscent != null ? t.actualBoundingBoxAscent : size * 0.72;
        var desc = t.actualBoundingBoxDescent != null ? t.actualBoundingBoxDescent : 0;
        return { size: size, asc: asc, desc: desc };
      });
      blockH = m.reduce(function (h, x) { return h + x.asc + x.desc; }, 0) + (lines.length - 1) * B.gap * sy * scale;
    }
    measure();
    for (var k = 0; k < 8 && blockH > availH; k++) { scale *= availH / blockH; measure(); }
    var y = cy - blockH / 2;
    lines.forEach(function (l, i) {
      g.font = l.weight + ' ' + m[i].size + 'px ' + l.family;
      g.fillStyle = l.color;
      g.fillText(l.text, cx, y + m[i].asc);
      y += m[i].asc + m[i].desc + B.gap * sy * scale;
    });
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
  // user-facing (English) message. `c` is the city: { key, name }.
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

      var boxes = [
        { label: 'GENDER', value: genderOf(r) || '–' },
        { label: 'BIB NUMBER', value: String(r.bib) },
        { label: 'POSITION', value: r.rank != null ? String(r.rank) : '–', sub: r.category || '' },
        { label: 'FINISH TIME', value: r.time || '–' }
      ];
      var B = CERT.boxes;
      boxes.forEach(function (b, i) {
        var lines = [
          { text: b.label, size: B.label, weight: '700', family: FONT_LABEL, color: CERT.labelColor },
          { text: b.value, size: B.value, weight: '400', family: FONT_DISPLAY, color: CERT.textColor }
        ];
        if (b.sub) lines.push({ text: b.sub, size: B.sub, weight: '700', family: FONT_LABEL, color: CERT.textColor });
        boxBlock(g, lines, B.rects[i], W / CERT.ref.w, H / CERT.ref.h);
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
      throw new Error(e && e.message === 'missing' ? MSG.missing : MSG.fail);
    });
  }

  window.PLN_CERT = { download: downloadCertificate };
})();
