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
  var REGISTRATION_OPEN = '2026-08-01T00:00:00+07:00';

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
      rpcStartISO: '2026-10-10T10:00:00+07:00',
      raceDayISO: '2026-10-11T06:00:00+07:00',
      rpc: { id: 'Sabtu, 10 Oktober 2026 · 10.00–20.00 WIB', en: 'Saturday, 10 October 2026 · 10:00–20:00 WIB' },
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
      rpcStartISO: '2026-10-31T10:00:00+07:00',   // deck lists RPC in WIB — see brief §7.8
      raceDayISO: '2026-11-01T06:00:00+08:00',     // race day start in WITA
      rpc: { id: 'Sabtu, 31 Oktober 2026 · 10.00–20.00 WIB', en: 'Saturday, 31 October 2026 · 10:00–20:00 WIB' },
      raceDay: { id: 'Minggu, 1 November 2026', en: 'Sunday, 1 November 2026' },
      startTime: { id: 'Start 06.00 WITA', en: 'Start 06:00 WITA' },
      venue: { id: 'Segera diumumkan', en: 'To be announced' },
      note: { id: 'Kota penutup series (garis finis perjalanan). Catat zona waktu WITA.', en: 'The closing city of the series (the journey’s finish line). Note: WITA time zone.' }
    }
  ];

  var TICKETS = [
    { key: 'super-early', name: { id: 'Super Early Bird', en: 'Super Early Bird' }, discount: 40, price: 166000, week: 1, period: { id: 'Agustus, minggu ke-1', en: 'August, week 1' } },
    { key: 'early', name: { id: 'Early Bird', en: 'Early Bird' }, discount: 30, price: 192500, week: 2, period: { id: 'Agustus, minggu ke-2', en: 'August, week 2' } },
    { key: 'general', name: { id: 'General Sales', en: 'General Sales' }, discount: 0, price: 275000, week: 3, period: { id: 'Agustus, minggu ke-3 dan seterusnya', en: 'August, week 3 onwards' } },
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
      id: ['Race Pack Collection — 10 Okt', 'Race Day — 11 Okt'],
      en: ['Race Pack Collection — 10 Oct', 'Race Day — 11 Oct'] } },
    { n: '03', month: { id: 'November 2026', en: 'November 2026' }, phase: { id: 'Electric 5K Series Bali', en: 'Electric 5K Series Bali' }, items: {
      id: ['Race Pack Collection — 31 Okt', 'Race Day — 1 Nov'],
      en: ['Race Pack Collection — 31 Oct', 'Race Day — 1 Nov'] } }
  ];

  var CONTEXT_STATS = [
    { num: '35.000 → 80.000', label: { id: 'Pengguna smartwatch lari di Indonesia (2023 → 2024)', en: 'Running smartwatch users in Indonesia (2023 → 2024)' }, src: 'Garmin Report; Good Stats' },
    { num: '+330%', label: { id: 'Pertumbuhan aktivitas lari nasional — 242.000 pelari (Mei 2025)', en: 'National running activity growth — 242,000 runners (May 2025)' }, src: 'Garmin Report; Good Stats' },
    { num: '558', label: { id: 'Event lari di Indonesia sepanjang 2025 (rekor tertinggi)', en: 'Running events in Indonesia during 2025 (all-time high)' }, src: 'Garmin Report; Good Stats' },
    { num: '280 juta', label: { id: 'Orang yang perlu sadar transisi energi', en: 'People who must embrace the energy transition' }, src: 'Garmin Report; Good Stats' }
  ];

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
      derivedPrizeNote: 'Total hadiah podium per kota (dihitung dari tabel).'
    },
    en: {
      registerCta: 'Register Now',
      viewSchedule: 'View the 3-City Schedule',
      viewCity: 'View City Details',
      seeAllFaq: 'See all FAQs',
      quotaLabel: 'Participants',
      raceDayLabel: 'Race Day',
      rpcLabel: 'Race Pack Collection',
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
      derivedPrizeNote: 'Total podium prize pool per city (calculated from the table).'
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

  function formatIDR(n) {
    return 'Rp ' + n.toLocaleString('id-ID');
  }

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
    timeline: TIMELINE,
    contextStats: CONTEXT_STATS,
    totalRunners: 10000,
    ui: UI,
    // helpers
    cityStatus: cityStatus,
    nextCity: nextCity,
    formatIDR: formatIDR,
    t: t,
    loc: loc
  };
})();
