/* ==========================================================================
   Finisher certificate — shared by the Race Results page (en/ + id/) and the
   venue quick-check page (/cek). Draws the runner's details on <canvas> over
   the city's template (TEMPLATES below — file name AND extension are set per
   city: Jakarta .png, Yogyakarta .jpg) at its native size and downloads it as
   PLN-5K-<City>-<bib>-<NameWithoutSpaces>.<png|jpg>. Client-side only.

   Usage (city = { key: 'jakarta', name: 'Jakarta' }):
     PLN_CERT.prepare(runner, city, opts) -> Promise<{ file, blob, filename }>
       Renders the canvas and builds the image File. Call it when the card
       OPENS, not on click (see deliver).
       opts.unofficial: true -> prints "UNOFFICIAL TIMES — SUBJECT TO
       OFFICIAL CONFIRMATION" (the caller sets it from event.is_frozen ===
       false; see PLN_RUNNER_CARD.isUnofficial).
     PLN_CERT.deliver(prepared)
       Call DIRECTLY inside the click handler, with nothing awaited before
       it: iOS only allows navigator.share() within a live user gesture.
       Phones with Web Share for files get the native share sheet ("Save
       Image" on iOS, save to gallery on Android); everything else (desktop)
       falls back to an <a download>. Cancelling the sheet is ignored.
     PLN_CERT.download(runner, city, opts) -> Promise
       prepare + plain file download (no share sheet).
   Errors reject with an English, user-facing message.
   Only call it for runners with status "ok".
   ========================================================================== */
(function () {
  'use strict';

  // Cache-buster for the certificate templates. The CDN cached a 404 for
  // the bare URL before the file existed; bump this whenever a template changes.
  var CERT_ASSET_VERSION = 3;
  var UNOFFICIAL = 'UNOFFICIAL TIMES \u2014 SUBJECT TO OFFICIAL CONFIRMATION';

  // One entry per city key. File names are spelled out in full — the
  // templates don't share an extension, so nothing is derived from the key.
  //   file   : template under /assets/
  //   type   : output image type; ext: output file extension
  //   layout : 'jakarta' (CERT below) or 'yogyakarta' (YOGYA below)
  // certificate-yogyakarta-clean.jpg is assets/certificate-yogyakarta.jpg
  // (the designer's file, kept as the source) with its five placeholder
  // words ("Name", "Gender", "BIB Number", "Position", "FInish Time")
  // inpainted out. Regenerate it whenever the source template changes.
  // Yogyakarta is a 2480x3508 photo: JPEG output (a PNG would be ~10 MB).
  var TEMPLATES = {
    jakarta: { file: 'certificate-jakarta.png', type: 'image/png', ext: 'png', layout: 'jakarta' },
    yogyakarta: { file: 'certificate-yogyakarta-clean.jpg', type: 'image/jpeg', ext: 'jpg', layout: 'yogyakarta' }
  };
  function templateOf(city) { return TEMPLATES[city && city.key] || null; }
  function certSrc(t) { return '/assets/' + t.file + '?v=' + CERT_ASSET_VERSION; }

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
        [694, 1250, 1066, 1451]                   // TIME (NET TIME, or GUN TIME if no net)
      ],
      padX: 28,                                   // horizontal inset for text width
      padY: 20,                                   // min clear space above/below the block
      border: 3,                                  // box line thickness (inside the rect)
      label: 30, value: 84, sub: 30,              // font px; sub (category) ~ label size
      gap: 14                                     // space between consecutive lines
    },
    // Unofficial-times marker: centred in the gap between the box grid
    // (bottom 1451) and the sponsor panel (top ~1627).
    unofficial: { y: 1540, size: 24, padX: 26, padY: 14 }
  };

  // Measured on assets/certificate-yogyakarta.jpg (2480 x 3508, A4 @ 300 dpi):
  //   title "CERTIFICATE" ink ends y=1194; name line y=1739..1744, x=347..2133
  //   "Name" placeholder ink y=1307..1391 (erased in the -clean file)
  //   boxes (outer edge of the 5 px white outline):
  //     GENDER [348,1954,1091,2357]   BIB NUMBER  [1389,1955,2132,2357]
  //     POSITION [347,2501,1091,2903] FINISH TIME [1389,2501,2132,2903]
  //   sponsor panel starts y~3255. Left boxes sit on the candi photo, right
  //   ones on the teal rays, so every text gets a dark halo (shadow).
  // All numbers are template px; scaled to the loaded image like CERT.
  var YOGYA = {
    ref: { w: 2480, h: 3508 },
    name: { baseline: 1691, maxW: 1786, size: 176 },   // sits on the line, like Jakarta
    rects: [
      [348, 1954, 1091, 2357],                     // GENDER
      [1389, 1955, 2132, 2357],                    // BIB NUMBER
      [347, 2501, 1091, 2903],                     // POSITION (overall)
      [1389, 2501, 2132, 2903]                     // FINISH TIME: gun + net
    ],
    padX: 64,                                      // horizontal inset for text width
    label: 46, value: 168, gap: 26,                // label/value font px
    rowLabel: 38, rowValue: 116, rowGap: 22,       // FINISH TIME rows
    labelColor: '#FFD200',                         // PLN yellow (= --pln-yellow on the Yogya display)
    textColor: '#FFFFFF',
    rowLabelColor: 'rgba(255,255,255,0.88)',
    halo: { color: 'rgba(0,0,0,0.75)', blur: 18 },
    unofficial: { y: 3080, size: 46, padX: 48, padY: 26 }
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
  // Time box on the certificate: NET time only, labelled by what it holds.
  // net_time available (value as sent, never computed here) -> "NET TIME".
  // No start-mat reading (net_basis "unavailable" / net_time null) -> the gun
  // time, labelled "GUN TIME" — a gun time is never labelled NET TIME.
  // The box is never empty. (The labels are drawn here, not in the PNG.)
  function timeBox(r) {
    var net = r && r.net_basis !== 'unavailable' && r.net_time ? String(r.net_time) : '';
    if (net) return { label: 'NET TIME', value: net };
    var gun = (r && (r.gun_time || r.time)) || '';
    return { label: 'GUN TIME', value: gun || '–' };
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

  // Text with the Yogya halo (soft dark shadow, drawn twice for density),
  // then once more without it so the glyph edges stay crisp.
  function haloText(g, text, x, y, halo, sy) {
    g.save();
    g.shadowColor = halo.color; g.shadowBlur = halo.blur * sy;
    g.fillText(text, x, y); g.fillText(text, x, y);
    g.restore();
    g.fillText(text, x, y);
  }
  function inkOf(g, text, size) {
    var t = g.measureText(text);
    return {
      w: t.width,
      asc: t.actualBoundingBoxAscent != null ? t.actualBoundingBoxAscent : size * 0.72,
      desc: t.actualBoundingBoxDescent != null ? t.actualBoundingBoxDescent : 0
    };
  }

  // "UNOFFICIAL TIMES — …" pill centred at u.y (template px): dark fill,
  // yellow outline + text. Drawn only when the caller passes opts.unofficial.
  function drawUnofficial(g, W, sx, sy, u) {
    var size = fitFont(g, UNOFFICIAL, Math.round(u.size * sy), W * 0.86, '800', FONT_LABEL);
    var m = inkOf(g, UNOFFICIAL, size);
    var w = m.w + 2 * u.padX * sx, h = m.asc + m.desc + 2 * u.padY * sy;
    var x = W / 2 - w / 2, y = u.y * sy - h / 2;
    g.save();
    g.fillStyle = 'rgba(0,0,0,0.72)';
    g.strokeStyle = '#FFD200'; g.lineWidth = Math.max(2, 4 * sy);
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, h / 2); else g.rect(x, y, w, h);
    g.fill(); g.stroke();
    g.fillStyle = '#FFD200'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText(UNOFFICIAL, W / 2, y + u.padY * sy + m.asc);
    g.restore();
  }

  // Jakarta (certificate-jakarta.png): layout unchanged — name, then
  // GENDER / BIB NUMBER / POSITION (category rank) / one time (timeBox).
  function drawJakarta(g, W, H, r) {
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
      // Rank stays the API's `rank` (gun based). Time box: see timeBox.
      timeBox(r)
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
    return { sx: W / CERT.ref.w, sy: H / CERT.ref.h, unofficial: CERT.unofficial };
  }

  // Overall position: 1..N over every finisher, whatever the category or sex.
  // The pln-5k endpoint doesn't send it yet — `rank` is the CATEGORY rank and
  // is deliberately not used. Shows "–" until the API adds `overall_rank`.
  function overallRankOf(r) {
    var n = r && r.overall_rank;
    return (typeof n === 'number' && n > 0) || (typeof n === 'string' && /^\d+$/.test(n)) ? String(n) : '–';
  }

  // Yogyakarta (certificate-yogyakarta-clean.jpg): name on the line; boxes
  // GENDER / BIB NUMBER / POSITION (overall) / FINISH TIME with BOTH gun and
  // net time as two labelled rows. Every text has a dark halo.
  function drawYogya(g, W, H, r) {
    var L = YOGYA, sx = W / L.ref.w, sy = H / L.ref.h;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';

    var name = String(r.name || '').toUpperCase();
    g.fillStyle = L.textColor;
    fitFont(g, name, Math.round(L.name.size * sy), L.name.maxW * sx, '400', FONT_DISPLAY);
    haloText(g, name, W / 2, L.name.baseline * sy, L.halo, sy);

    function box(i) {
      var q = L.rects[i];
      var x0 = q[0] * sx, x1 = q[2] * sx, y0 = q[1] * sy, y1 = q[3] * sy;
      return { x0: x0 + L.padX * sx, x1: x1 - L.padX * sx, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    }
    // Small yellow label + one big value, centred as one block.
    function simple(i, label, value) {
      var b = box(i), maxW = b.x1 - b.x0;
      var ls = fitFont(g, label, Math.round(L.label * sy), maxW, '700', FONT_LABEL);
      var lm = inkOf(g, label, ls);
      var vs = fitFont(g, value, Math.round(L.value * sy), maxW, '400', FONT_DISPLAY);
      var vm = inkOf(g, value, vs);
      var top = b.cy - (lm.asc + lm.desc + L.gap * sy + vm.asc + vm.desc) / 2;
      g.font = '700 ' + ls + 'px ' + FONT_LABEL; g.fillStyle = L.labelColor;
      haloText(g, label, b.cx, top + lm.asc, L.halo, sy);
      g.font = '400 ' + vs + 'px ' + FONT_DISPLAY; g.fillStyle = L.textColor;
      haloText(g, value, b.cx, top + lm.asc + lm.desc + L.gap * sy + vm.asc, L.halo, sy);
    }
    simple(0, 'GENDER', genderOf(r) || '–');
    simple(1, 'BIB NUMBER', String(r.bib));
    simple(2, 'POSITION', overallRankOf(r));

    // FINISH TIME: header, then "GUN TIME <gun_time>" and "NET TIME
    // <net_time>" rows (label left, value right, shared baseline). Values are
    // the API's own strings; a missing one shows "–", never the other time.
    var gun = String(r.gun_time || r.time || '') || '–';
    var net = (r.net_basis !== 'unavailable' && r.net_time) ? String(r.net_time) : '–';
    var rows = [{ label: 'GUN TIME', value: gun }, { label: 'NET TIME', value: net }];
    var b = box(3), maxW = b.x1 - b.x0;
    var hs = fitFont(g, 'FINISH TIME', Math.round(L.label * sy), maxW, '700', FONT_LABEL);
    var hm = inkOf(g, 'FINISH TIME', hs);
    var rl = Math.round(L.rowLabel * sy);
    g.font = '700 ' + rl + 'px ' + FONT_LABEL;
    var lw = Math.max(g.measureText('GUN TIME').width, g.measureText('NET TIME').width);
    // One value size for both rows so the two times line up.
    var vs = Math.round(L.rowValue * sy);
    rows.forEach(function (x) { vs = Math.min(vs, fitFont(g, x.value, vs, maxW - lw - L.gap * sx, '400', FONT_DISPLAY)); });
    g.font = '400 ' + vs + 'px ' + FONT_DISPLAY;
    var digit = inkOf(g, '0', vs);                  // row height from digit ink, so a "–" row matches
    var rowH = digit.asc + digit.desc;
    var y = b.cy - (hm.asc + hm.desc + L.gap * sy + 2 * rowH + L.rowGap * sy) / 2;
    g.font = '700 ' + hs + 'px ' + FONT_LABEL; g.fillStyle = L.labelColor;
    haloText(g, 'FINISH TIME', b.cx, y + hm.asc, L.halo, sy);
    y += hm.asc + hm.desc + L.gap * sy;
    rows.forEach(function (x) {
      var base = y + digit.asc;
      g.textAlign = 'left';
      g.font = '700 ' + rl + 'px ' + FONT_LABEL; g.fillStyle = L.rowLabelColor;
      haloText(g, x.label, b.x0, base, L.halo, sy);
      g.textAlign = 'right';
      g.font = '400 ' + vs + 'px ' + FONT_DISPLAY; g.fillStyle = L.textColor;
      haloText(g, x.value, b.x1, base, L.halo, sy);
      y += rowH + L.rowGap * sy;
    });
    g.textAlign = 'center';
    return { sx: sx, sy: sy, unofficial: L.unofficial };
  }

  // Renders the certificate and resolves to { file, blob, filename }; rejects
  // with a user-facing (English) message. `c` is the city: { key, name };
  // opts.unofficial prints the unofficial-times marker.
  function prepare(r, c, opts) {
    opts = opts || {};
    var t = templateOf(c);
    if (!t) return Promise.reject(new Error(MSG.missing));
    var fontsReady = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('64px Anton'), document.fonts.load('700 20px Montserrat'), document.fonts.load('800 20px Montserrat')]).catch(function () {})
      : Promise.resolve();
    return Promise.all([loadImage(certSrc(t)), fontsReady]).then(function (res) {
      var img = res[0], W = img.naturalWidth, H = img.naturalHeight;
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      var g = cv.getContext('2d');
      g.drawImage(img, 0, 0, W, H);

      var placed = t.layout === 'yogyakarta' ? drawYogya(g, W, H, r) : drawJakarta(g, W, H, r);
      if (opts.unofficial) drawUnofficial(g, W, placed.sx, placed.sy, placed.unofficial);

      var filename = 'PLN-5K-' + c.name + '-' + fileSafe(r.bib) + '-' + fileSafe(r.name) + '.' + t.ext;
      return new Promise(function (res, rej) {
        cv.toBlob(function (blob) {
          if (!blob) { rej(new Error('fail')); return; }
          var file = null;
          try { file = new File([blob], filename, { type: t.type }); } catch (e) { /* old browsers: download only */ }
          res({ file: file, blob: blob, filename: filename });
        }, t.type, 0.92);
      });
    }).catch(function (e) {
      throw new Error(e && e.message === 'missing' ? MSG.missing : MSG.fail);
    });
  }

  function saveAs(p) {
    var url = URL.createObjectURL(p.blob);
    var a = document.createElement('a');
    a.href = url; a.download = p.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function canShareFile(file) {
    try { return !!(file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); }
    catch (e) { return false; }
  }

  // MUST run synchronously inside the click handler (no await before share).
  function deliver(p) {
    if (!p) return;
    if (canShareFile(p.file)) {
      try {
        navigator.share({ files: [p.file] }).catch(function (err) {
          if (err && err.name === 'AbortError') return;        // user closed the sheet
          saveAs(p);                                           // share refused -> plain download
        });
      } catch (err) {
        saveAs(p);
      }
      return;
    }
    saveAs(p);                                                 // desktop / no Web Share for files
  }

  function download(r, c, opts) { return prepare(r, c, opts).then(saveAs); }

  window.PLN_CERT = { prepare: prepare, deliver: deliver, download: download };
})();
