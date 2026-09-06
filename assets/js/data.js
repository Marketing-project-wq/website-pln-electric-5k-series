/* ==========================================================================
   data.js — SINGLE SOURCE OF TRUTH
   All event numbers (dates, prices, quotas, prizes) live here and are rendered
   into pages by JS. Do NOT hardcode these values in individual HTML files.

   Source: 20FIT x PLN pitch deck (pitch-stage working title "Speed Land 2026").
   Race-day dates follow the "Event Timeline" slide (see build brief §2 / §8.3).
   <!-- TODO: konfirmasi tanggal final ke klien -->
   ========================================================================== */

(function () {
  'use strict';

  // Detect active language from URL path (/en/ => 'en', else 'id').
  var LANG = (location.pathname.indexOf('/en/') !== -1) ? 'en' : 'id';

  // Registration opens (August 2026). Before this: "upcoming".
  // Registration/ticket sales open with Super Early Bird on 18 August 2026.
  // Before this, all cities show "upcoming".
  var REGISTRATION_OPEN = '2026-08-18T00:00:00+07:00';

  var CITIES = [
    {
      key: 'jakarta',
      name: 'Jakarta',
      order: 1,
      quota: 4000,
      tz: 'WIB',
      rpcStartISO: '2026-09-25T10:00:00+07:00',
      raceDayISO: '2026-09-27T06:00:00+07:00',
      rpc: { id: 'Jumat–Sabtu, 25–26 September 2026 · 10.00–20.00 WIB', en: 'Friday–Saturday, 25–26 September 2026 · 10:00–20:00 WIB' },
      raceDay: { id: 'Minggu, 27 September 2026', en: 'Sunday, 27 September 2026' },
      startTime: { id: 'Start 06.00 WIB', en: 'Start 06:00 WIB' },
      venue: { id: 'Segera diumumkan', en: 'To be announced' },
      note: { id: 'Kota pembuka series — ibu kota, energi metropolitan.', en: 'The opening city of the series — the capital, metropolitan energy.' }
    },
    {
      key: 'yogyakarta',
      name: 'Yogyakarta',
      order: 2,
      quota: 3000,
      tz: 'WIB',
      rpcStartISO: '2026-10-09T10:00:00+07:00',
      raceDayISO: '2026-10-11T06:00:00+07:00',
      rpc: { id: 'Jumat–Sabtu, 9–10 Oktober 2026 · 10.00–20.00 WIB', en: 'Friday–Saturday, 9–10 October 2026 · 10:00–20:00 WIB' },
      raceDay: { id: 'Minggu, 11 Oktober 2026', en: 'Sunday, 11 October 2026' },
      startTime: { id: 'Start 06.00 WIB', en: 'Start 06:00 WIB' },
      venue: { id: 'Segera diumumkan', en: 'To be announced' },
      note: { id: 'Kota kedua — budaya & semangat komunitas lari yang tumbuh pesat.', en: 'The second city — culture and a fast-growing running community.' }
    },
    {
      key: 'bali',
      name: 'Bali',
      order: 3,
      quota: 3000,
      tz: 'WITA',
      rpcStartISO: '2026-10-30T10:00:00+07:00',   // deck lists RPC in WIB — see brief §7.8
      raceDayISO: '2026-11-01T06:00:00+08:00',     // race day start in WITA
      rpc: { id: 'Jumat–Sabtu, 30–31 Oktober 2026 · 10.00–20.00 WIB', en: 'Friday–Saturday, 30–31 October 2026 · 10:00–20:00 WIB' },
      raceDay: { id: 'Minggu, 1 November 2026', en: 'Sunday, 1 November 2026' },
      startTime: { id: 'Start 06.00 WITA', en: 'Start 06:00 WITA' },
      venue: { id: 'Segera diumumkan', en: 'To be announced' },
      note: { id: 'Kota penutup series (garis finis perjalanan). Catat zona waktu WITA.', en: 'The closing city of the series (the journey’s finish line). Note: WITA time zone.' }
    }
  ];

  var TICKETS = [
    { key: 'super-early', name: { id: 'Super Early Bird', en: 'Super Early Bird' }, discount: 40, price: 166000, week: 1, period: { id: 'Mulai 18 Agustus', en: 'From 18 August' } },
    { key: 'early', name: { id: 'Early Bird', en: 'Early Bird' }, discount: 30, price: 192500, week: 2, period: { id: 'Mulai 21 Agustus', en: 'From 21 August' } },
    { key: 'general', name: { id: 'General Sales', en: 'General Sales' }, discount: 0, price: 275000, week: 3, period: { id: 'Mulai 28 Agustus', en: 'From 28 August' } },
    // Community Price period NOT specified in deck — shown as a separate track.
    // <!-- periode Community Price tidak disebutkan di deck, konfirmasi ke klien -->
    { key: 'community', name: { id: 'Community Price', en: 'Community Price' }, discount: 20, price: 220000, week: null, period: { id: 'Jalur komunitas — periode menyusul', en: 'Community track — period to be confirmed' } }
  ];

  var PRIZES = [
    { pos: 1, label: { id: 'Juara 1', en: '1st Place' }, men: 10000000, women: 10000000 },
    { pos: 2, label: { id: 'Juara 2', en: '2nd Place' }, men: 8000000, women: 8000000 },
    { pos: 3, label: { id: 'Juara 3', en: '3rd Place' }, men: 6000000, women: 6000000 },
    { pos: 4, label: { id: 'Juara 4', en: '4th Place' }, men: 5000000, women: 5000000 },
    { pos: 5, label: { id: 'Juara 5', en: '5th Place' }, men: 4000000, women: 4000000 }
  ];

  // Derived, per city: total podium prize pool.
  // <!-- angka total hadiah dihitung dari tabel podium, bukan disebut eksplisit di deck sumber -->
  var PRIZE_TOTAL_PER_CITY = PRIZES.reduce(function (s, p) { return s + p.men + p.women; }, 0); // 66,000,000

  // The schedule timeline is one card per city (Race Pack Collection + Race Day).
  // Ticket/launch/after-event info lives on the Tickets and News pages instead.
  // Series names ("Electric 5K Series <City>") are NOT translated.
  var TIMELINE = [
    { n: '01', month: { id: 'September 2026', en: 'September 2026' }, phase: { id: 'Electric 5K Series Jakarta', en: 'Electric 5K Series Jakarta' }, items: {
      id: ['Race Pack Collection — 25–26 Sep', 'Race Day — 27 Sep'],
      en: ['Race Pack Collection — 25–26 Sep', 'Race Day — 27 Sep'] } },
    { n: '02', month: { id: 'Oktober 2026', en: 'October 2026' }, phase: { id: 'Electric 5K Series Yogyakarta', en: 'Electric 5K Series Yogyakarta' }, items: {
      id: ['Race Pack Collection — 9–10 Okt', 'Race Day — 11 Okt'],
      en: ['Race Pack Collection — 9–10 Oct', 'Race Day — 11 Oct'] } },
    { n: '03', month: { id: 'November 2026', en: 'November 2026' }, phase: { id: 'Electric 5K Series Bali', en: 'Electric 5K Series Bali' }, items: {
      id: ['Race Pack Collection — 30–31 Okt', 'Race Day — 1 Nov'],
      en: ['Race Pack Collection — 30–31 Oct', 'Race Day — 1 Nov'] } }
  ];

  var CONTEXT_STATS = [
    { num: { id: '35.000 → 80.000', en: '35,000 → 80,000' }, label: { id: 'Pengguna smartwatch lari di Indonesia (2023 → 2024)', en: 'Running smartwatch users in Indonesia (2023 → 2024)' }, src: 'Garmin Report; Good Stats' },
    { num: { id: '+330%', en: '+330%' }, label: { id: 'Pertumbuhan aktivitas lari nasional — 242.000 pelari (Mei 2025)', en: 'National running activity growth — 242,000 runners (May 2025)' }, src: 'Garmin Report; Good Stats' },
    { num: { id: '558', en: '558' }, label: { id: 'Event lari di Indonesia sepanjang 2025 (rekor tertinggi)', en: 'Running events in Indonesia during 2025 (all-time high)' }, src: 'Garmin Report; Good Stats' },
    { num: { id: '280 juta', en: '280 million' }, label: { id: 'Orang yang perlu sadar transisi energi', en: 'People who must embrace the energy transition' }, src: 'Garmin Report; Good Stats' }
  ];

  // ---- Race results, per city ---------------------------------------------
  // SAMPLE / PLACEHOLDER finisher data for the Race Results page: a generated
  // field per city (bib, name, gender, category, finish time). Deterministic
  // (seeded) so ranks and split times stay stable across reloads. Powers the
  // per-city boards, the combined Overall leaderboard, per-runner split times,
  // and the certificate. Column headers on the page are English by request.
  // <!-- TODO: ganti dengan hasil timing resmi (export penyedia timing) tiap kota -->
  var RESULTS = (function () {
    var MALE = ['Rangga', 'Bayu', 'Dimas', 'Fajar', 'Reza', 'Yoga', 'Aldo', 'Gilang', 'Hendra', 'Rizky', 'Arif', 'Panji', 'Wahyu', 'Bagus', 'Iqbal', 'Tri', 'Dwi', 'Eko', 'Galih', 'Surya', 'Komang', 'Made', 'Wayan', 'Kadek', 'Gede', 'Putu', 'Nyoman', 'Bagas', 'Ketut', 'Agus', 'Andi', 'Budi', 'Candra', 'Dedi', 'Ferry', 'Gunawan', 'Hadi', 'Indra', 'Joko', 'Krisna', 'Lukman', 'Miko', 'Nanda', 'Oka', 'Rama', 'Satya', 'Teguh', 'Umar', 'Vino', 'Wisnu', 'Yudha', 'Zaki', 'Farel', 'Rafi', 'Naufal', 'Alif'];
    var FEMALE = ['Ayu', 'Dewi', 'Sari', 'Intan', 'Maya', 'Nadia', 'Putri', 'Rina', 'Sinta', 'Tari', 'Wulan', 'Kartika', 'Lestari', 'Anggun', 'Citra', 'Dinda', 'Fitri', 'Gita', 'Hesti', 'Indah', 'Kirana', 'Laras', 'Mega', 'Nia', 'Prita', 'Ratih', 'Sekar', 'Tiara', 'Vina', 'Winda', 'Yuni', 'Zahra', 'Alya', 'Bunga', 'Cahaya', 'Salsa'];
    var LAST = ['Wijaya', 'Saputra', 'Prasetyo', 'Nugroho', 'Aditya', 'Kurniawan', 'Firmansyah', 'Ramadhan', 'Wibowo', 'Maulana', 'Setiawan', 'Nugraha', 'Hidayat', 'Santoso', 'Atmojo', 'Cahyono', 'Prabowo', 'Pratama', 'Darma', 'Putra', 'Arya', 'Andika', 'Dharma', 'Prakoso', 'Wirawan', 'Hakim', 'Halim', 'Susanto', 'Hartono', 'Permana', 'Utomo', 'Rahardjo', 'Simanjuntak', 'Sinaga', 'Tanjung', 'Siregar', 'Panjaitan', 'Lubis', 'Handoko', 'Wibisono'];
    var seed = 424242 >>> 0;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    function pick(a) { return a[Math.floor(rnd() * a.length)]; }
    var CITY_KEYS = ['jakarta', 'yogyakarta', 'bali'];
    // Known names per city (continuity with Live Tracking; easy to search).
    var KNOWN = {
      jakarta: [['1024', 'Rangga Wijaya', 'M', 912], ['1097', 'Bayu Saputra', 'M', 941]],
      yogyakarta: [['2031', 'Arif Setiawan', 'M', 926], ['2008', 'Panji Nugraha', 'M', 968]],
      bali: [['3012', 'Komang Adi', 'M', 933], ['3077', 'Made Surya', 'M', 979]]
    };
    var out = {}, usedBib = {};
    CITY_KEYS.forEach(function (city, ci) {
      var list = [];
      (KNOWN[city] || []).forEach(function (k) {
        list.push({ bib: k[0], name: k[1], gender: k[2], category: 'Open ' + (k[2] === 'M' ? 'Men' : 'Women'), finishSec: k[3] });
        usedBib[k[0]] = 1;
      });
      var base = (ci + 1) * 1000;
      while (list.length < 40) {
        var bib; do { bib = String(base + Math.floor(rnd() * 999)); } while (usedBib[bib]);
        usedBib[bib] = 1;
        var g = rnd() < 0.55 ? 'M' : 'F';
        var name = (g === 'M' ? pick(MALE) : pick(FEMALE)) + ' ' + pick(LAST);
        var ar = rnd(), ag = ar < 0.6 ? 'Open' : ar < 0.85 ? 'Master' : 'Student';
        var finishSec = Math.round(900 + Math.pow(rnd(), 1.4) * 1500); // 15:00 .. ~40:00
        list.push({ bib: bib, name: name, gender: g, category: ag + ' ' + (g === 'M' ? 'Men' : 'Women'), finishSec: finishSec });
      }
      list.sort(function (a, b) { return a.finishSec - b.finishSec; });
      out[city] = list;
    });
    return out;
  })();

  // ---- Live Tracking ------------------------------------------------------
  // Course + runner positions for the Live Tracking page. The route, timing
  // points and POIs below are the REAL surveyed TMII course (exported from the
  // organiser's Google Earth project, ~5.1 km). Runner positions are still a
  // DEMO simulation (runners move along the real route); on race day they are
  // replaced by the chip-timing feed.
  // <!-- TODO: sambungkan posisi pelari ke API timing (feibot); rute sudah final -->
  // Demo participant field (~200) for the Live Tracking page. Names and bibs
  // are illustrative and positions are simulated; the field is deterministic
  // (seeded) so it stays stable across reloads. On race day this list comes
  // from the chip-timing API instead.
  var LT_RUNNERS = (function () {
    var FIRST = ['Rangga', 'Bayu', 'Dimas', 'Fajar', 'Reza', 'Yoga', 'Aldo', 'Gilang', 'Hendra', 'Rizky', 'Arif', 'Panji', 'Wahyu', 'Bagus', 'Iqbal', 'Tri', 'Dwi', 'Eko', 'Galih', 'Surya', 'Komang', 'Made', 'Wayan', 'Kadek', 'Gede', 'Putu', 'Nyoman', 'Bagas', 'Ketut', 'Agus', 'Andi', 'Budi', 'Candra', 'Dedi', 'Eka', 'Ferry', 'Gunawan', 'Hadi', 'Indra', 'Joko', 'Krisna', 'Lukman', 'Miko', 'Nanda', 'Oka', 'Prama', 'Rama', 'Satya', 'Teguh', 'Umar', 'Vino', 'Wisnu', 'Yudha', 'Zaki', 'Ayu', 'Dewi', 'Sari', 'Intan', 'Maya', 'Nadia', 'Putri', 'Rina', 'Sinta', 'Tari', 'Wulan', 'Farel', 'Rafi', 'Naufal', 'Alif'];
    var LAST = ['Wijaya', 'Saputra', 'Prasetyo', 'Nugroho', 'Aditya', 'Kurniawan', 'Firmansyah', 'Ramadhan', 'Wibowo', 'Maulana', 'Setiawan', 'Nugraha', 'Hidayat', 'Santoso', 'Atmojo', 'Cahyono', 'Prabowo', 'Pratama', 'Darma', 'Putra', 'Arya', 'Andika', 'Dharma', 'Prakoso', 'Wirawan', 'Hakim', 'Halim', 'Susanto', 'Hartono', 'Permana', 'Utomo', 'Rahardjo', 'Simanjuntak', 'Sinaga', 'Tanjung', 'Siregar', 'Panjaitan', 'Lubis', 'Handoko', 'Wibisono'];
    var seed = 20260927 >>> 0;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var out = [], usedBib = {};
    // A few known entries first (continuity with Race Results; easy to search).
    [['1024', 'Rangga Wijaya', 942], ['2031', 'Arif Setiawan', 1006], ['3012', 'Komang Adi', 1071], ['1097', 'Bayu Saputra', 1134], ['2008', 'Panji Nugraha', 1218]]
      .forEach(function (k) { out.push({ bib: k[0], name: k[1], finishSec: k[2] }); usedBib[k[0]] = 1; });
    while (out.length < 200) {
      var bib = String(1000 + Math.floor(rnd() * 8999));
      if (usedBib[bib]) continue;
      usedBib[bib] = 1;
      var name = FIRST[Math.floor(rnd() * FIRST.length)] + ' ' + LAST[Math.floor(rnd() * LAST.length)];
      // 5K finish times skewed toward 25–35 min with a tail to ~48 min.
      out.push({ bib: bib, name: name, finishSec: Math.round(900 + Math.pow(rnd(), 1.35) * 1980) });
    }
    return out;
  })();

  var LIVE_TRACKING = {
    // [lat, lng] polyline of the official course.
    route: [
      [-6.302264,106.889089], [-6.302258,106.889306], [-6.301853,106.889337], [-6.300544,106.889358],
      [-6.300542,106.89038], [-6.300465,106.890736], [-6.300464,106.892201], [-6.301267,106.892261],
      [-6.301257,106.893764], [-6.301205,106.89411], [-6.300995,106.894152], [-6.300715,106.894159],
      [-6.300563,106.894122], [-6.300419,106.89406], [-6.299918,106.894023], [-6.29987,106.895557],
      [-6.299825,106.898576], [-6.299689,106.898612], [-6.299583,106.898696], [-6.299575,106.898719],
      [-6.299573,106.898721], [-6.299569,106.898725], [-6.299568,106.898726], [-6.299613,106.901791],
      [-6.299656,106.901877], [-6.299716,106.901949], [-6.299822,106.902001], [-6.300751,106.902005],
      [-6.300774,106.903429], [-6.300835,106.903576], [-6.301008,106.903844], [-6.301235,106.904091],
      [-6.30155,106.904324], [-6.301778,106.904443], [-6.302026,106.904511], [-6.302305,106.904537],
      [-6.30266,106.904475], [-6.302964,106.904322], [-6.303199,106.904126], [-6.30336,106.903851],
      [-6.303474,106.903557], [-6.303509,106.90239], [-6.303497,106.902053], [-6.303487,106.902037],
      [-6.303471,106.90203], [-6.303442,106.902026], [-6.303428,106.902028], [-6.303425,106.902028],
      [-6.303411,106.902034], [-6.303396,106.902058], [-6.303393,106.90216], [-6.303397,106.902312],
      [-6.303387,106.903165], [-6.303371,106.903392], [-6.303337,106.90366], [-6.303145,106.904006],
      [-6.302988,106.90416], [-6.302716,106.904324], [-6.302494,106.904401], [-6.302255,106.904431],
      [-6.302025,106.9044], [-6.301877,106.904374], [-6.301707,106.904304], [-6.301477,106.904171],
      [-6.301238,106.903967], [-6.301099,106.90375], [-6.30102,106.903615], [-6.30094,106.903389],
      [-6.300898,106.903185], [-6.300885,106.902948], [-6.30087,106.902297], [-6.300857,106.902002],
      [-6.30115,106.901996], [-6.303314,106.902001], [-6.303341,106.900651], [-6.303453,106.900637],
      [-6.303544,106.900568], [-6.303559,106.900503], [-6.303584,106.8998], [-6.303587,106.898713],
      [-6.303601,106.89748], [-6.303614,106.897387], [-6.30365,106.89708], [-6.303652,106.89686],
      [-6.30365,106.896141], [-6.303651,106.895162], [-6.303654,106.894774], [-6.303657,106.893753],
      [-6.303667,106.892854], [-6.30367,106.892615], [-6.303719,106.892201], [-6.303781,106.89181],
      [-6.303824,106.891453], [-6.30383,106.890399], [-6.303835,106.889942], [-6.303842,106.889554],
      [-6.304115,106.889207], [-6.304134,106.889101]
    ],
    // Timing points ("antena/decoder"); frac = position along the route [0..1].
    checkpoints: [
      { label: { id: 'Start', en: 'Start' }, lat: -6.302271, lng: 106.88909, frac: 0.0 },
      { label: { id: 'KM 1', en: 'KM 1' }, lat: -6.299868, lng: 106.895556, frac: 0.2217 },
      { label: { id: 'KM 2', en: 'KM 2' }, lat: -6.300774, lng: 106.903392, frac: 0.4158 },
      { label: { id: 'KM 3', en: 'KM 3' }, lat: -6.301619, lng: 106.90425, frac: 0.6096 },
      { label: { id: 'KM 4', en: 'KM 4' }, lat: -6.303596, lng: 106.898081, frac: 0.8045 },
      { label: { id: 'Finish', en: 'Finish' }, lat: -6.304131, lng: 106.889101, frac: 1.0 }
    ],
    // Extra on-course markers (not timing points).
    pois: [
      { kind: 'hydration', label: { id: 'Water Station', en: 'Water Station' }, lat: -6.303569, lng: 106.902414 }
    ],
    // Optional 200 m speed segment [start, finish].
    speed200: [[-6.303649,106.895609],[-6.303658,106.893801]],
    // Demo participant field (generated above as LT_RUNNERS). finishSec = the
    // simulated finish time used for the board clock. Positions are simulated.
    runners: LT_RUNNERS,
    // Seconds of wall-clock for the leader to run start->finish in the demo.
    animSeconds: 24,
    ui: {
      id: { board: 'Papan Live', bib: 'No. BIB', name: 'Nama', last: 'Terakhir Terdeteksi', clock: 'Waktu', restart: 'Ulangi', pause: 'Jeda', play: 'Main', sim: 'SIMULASI', running: 'Berlari', finished: 'Finish', waiting: 'Menunggu start', distance: 'Jarak' },
      en: { board: 'Live Board', bib: 'Bib', name: 'Name', last: 'Last Detected', clock: 'Time', restart: 'Restart', pause: 'Pause', play: 'Play', sim: 'SIMULATION', running: 'Running', finished: 'Finished', waiting: 'Awaiting start', distance: 'Distance' }
    }
  };

  // ---- Shared UI strings (header/footer/components) ----
  var UI = {
    id: {
      registerCta: 'Daftar Sekarang',
      viewSchedule: 'Lihat Jadwal 3 Kota',
      viewCity: 'Lihat Detail Kota',
      seeAllFaq: 'Lihat semua FAQ',
      quotaLabel: 'Peserta',
      raceDayLabel: 'Race Day',
      rpcLabel: 'Race Pack Collection',
      sourceLabel: 'Sumber:',
      status: { upcoming: 'Akan Datang', open: 'Pendaftaran Dibuka', rpc: 'Race Pack Collection', done: 'Selesai' },
      countdownTo: 'Menuju Race Day',
      countdownUnits: { d: 'Hari', h: 'Jam', m: 'Menit', s: 'Detik' },
      countdownDone: 'Race day telah berlangsung',
      allDone: 'Series 2026 telah selesai — sampai jumpa di edisi berikutnya.',
      modalTitle: 'Cara Daftar via PLN Mobile',
      modalIntro: 'Pendaftaran 100% lewat aplikasi PLN Mobile. Ikuti 4 langkah ini:',
      // Store-badge top line. ID keeps "Download di" for both stores.
      storeApple: 'Download di', storeGoogle: 'Download di',
      steps: [
        'Unduh atau perbarui aplikasi PLN Mobile.',
        'Buka menu Events di aplikasi.',
        'Pilih PLN Mobile Electric 5K Series & kota pilihanmu.',
        'Pilih tiket dan selesaikan pembayaran.'
      ],
      close: 'Tutup',
      derivedPrizeNote: 'Total hadiah podium per kota (dihitung dari tabel).',
      resultsEmpty: 'Hasil resmi akan tampil di sini setelah Race Day.'
    },
    en: {
      registerCta: 'Register Now',
      viewSchedule: 'View the 3-City Schedule',
      viewCity: 'View City Details',
      seeAllFaq: 'See all FAQs',
      quotaLabel: 'Participants',
      raceDayLabel: 'Race Day',
      rpcLabel: 'Race Pack Collection',
      sourceLabel: 'Source:',
      status: { upcoming: 'Upcoming', open: 'Registration Open', rpc: 'Race Pack Collection', done: 'Completed' },
      countdownTo: 'Counting down to Race Day',
      countdownUnits: { d: 'Days', h: 'Hrs', m: 'Min', s: 'Sec' },
      countdownDone: 'Race day has taken place',
      allDone: 'The 2026 series is complete — see you at the next edition.',
      modalTitle: 'How to Register via PLN Mobile',
      modalIntro: 'Registration is 100% through the PLN Mobile app. Follow these 4 steps:',
      // Official store-badge conventions — deliberately asymmetric (Apple vs Google).
      storeApple: 'Download on the', storeGoogle: 'GET IT ON',
      steps: [
        'Download or update the PLN Mobile app.',
        'Open the Events menu in the app.',
        'Choose PLN Mobile Electric 5K Series & your city.',
        'Select your ticket and complete payment.'
      ],
      close: 'Close',
      derivedPrizeNote: 'Total podium prize pool per city (calculated from the table).',
      resultsEmpty: 'Official results will appear here after Race Day.'
    }
  };

  // ---- Helpers ----
  function now() { return new Date(); }

  function cityStatus(city, ref) {
    ref = ref || now();
    var regOpen = new Date(REGISTRATION_OPEN);
    var rpcStart = new Date(city.rpcStartISO);
    var raceStart = new Date(city.raceDayISO);
    var doneAfter = new Date(raceStart.getTime() + 8 * 3600 * 1000); // race + 8h
    if (ref >= doneAfter) return 'done';
    if (ref >= rpcStart) return 'rpc';
    if (ref >= regOpen) return 'open';
    return 'upcoming';
  }

  // Next upcoming city race day (for global countdown). Returns null if all past.
  function nextCity(ref) {
    ref = ref || now();
    var sorted = CITIES.slice().sort(function (a, b) { return new Date(a.raceDayISO) - new Date(b.raceDayISO); });
    for (var i = 0; i < sorted.length; i++) {
      if (new Date(sorted[i].raceDayISO) > ref) return sorted[i];
    }
    return null;
  }

  // Number formatting follows the active language: EN uses commas for
  // thousands (4,000 / Rp 10,000,000), ID uses dots (4.000 / Rp 10.000.000).
  var NUM_LOCALE = (LANG === 'en') ? 'en-US' : 'id-ID';
  function formatNum(n) { return n.toLocaleString(NUM_LOCALE); }
  function formatIDR(n) { return 'Rp ' + n.toLocaleString(NUM_LOCALE); }

  function t(key) { return UI[LANG][key]; }
  function loc(obj) { return obj ? (obj[LANG] != null ? obj[LANG] : obj.id) : ''; }

  window.EVENT_DATA = {
    LANG: LANG,
    name: 'PLN Mobile Electric 5K Series 2026',
    tagline: 'Power Your Speed',
    distance: '5K',
    cot: { id: 'COT 40 menit', en: 'COT 40 minutes' },
    REGISTRATION_OPEN: REGISTRATION_OPEN,
    cities: CITIES,
    tickets: TICKETS,
    prizes: PRIZES,
    prizeTotalPerCity: PRIZE_TOTAL_PER_CITY,
    results: RESULTS,
    liveTracking: LIVE_TRACKING,
    timeline: TIMELINE,
    contextStats: CONTEXT_STATS,
    totalRunners: 10000,
    ui: UI,
    // helpers
    cityStatus: cityStatus,
    nextCity: nextCity,
    formatIDR: formatIDR,
    formatNum: formatNum,
    t: t,
    loc: loc
  };
})();
