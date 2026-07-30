OFFICIAL LOGO ASSETS — installed (see build brief §10.1)
========================================================
logo-color.png  → full-colour (teal→lime gradient + yellow "POWER YOUR SPEED" banner).
                  Use on LIGHT backgrounds or high-contrast photos.
logo-black.png  → solid black. Use on plain light backgrounds.
logo-white.png  → white with thin outline. DEFAULT for this site (dark backgrounds).
                  Used in header + footer.

Usage rules:
- Never stretch/distort the ratio; never re-typeset the wordmark as a font.
- Keep safe padding around the logo (≈ the height of the "P" in "PLN").
- Pick the variant by background contrast, not habit.

Favicon / app icon:
- Current favicon references /assets/img/graphics/shard-runner-mark.png.
- TODO: that source PNG is 16:9; export a SQUARE (e.g. 512×512) crop of the runner
  mark for a crisp favicon.ico / apple-touch-icon before launch.

Partner logos (assets/img/logo/partners/)
- 20fit-event-white.png  → on dark backgrounds (footer, sponsor strip, contact credit).
- 20fit-event-black.png  → on light backgrounds.
- Red (#BF0000) is 20FIT's own brand colour — do not recolour; not part of the site token palette.
- pln-mobile.png  → PLN Mobile app icon (square, teal gradient). One file for all backgrounds.
- mills.png        → MILLS, black-only. Use class .on-dark-invert (CSS invert) on dark backgrounds.
- Apparel partner logo still not received — the only remaining text placeholder.

Merch renders (assets/img/merch/) — official 3D studio renders on neutral grey:
- jacket-speed100.jpg  → Speed 100 page only (prize jacket, not a race-pack item).
- jersey-design-01.jpg / jersey-design-02.jpg → two DIFFERENT design options (not colour
  variants). Shown side-by-side on Race Pack as "Design Option 1 / 2"; option 1 also
  illustrates the Jersey of Light on Sustainability. Final choice pending client.

Shard graphics (assets/img/graphics/) — abstract, text-free decoration:
- shard-fragment-01.png / -02.png → the two hero shards used site-wide as
  .deco-shard--tr / --bl. Repositioned per hero by the arrangement variants below.
- shard-runner-mark.png → the runner "spark" mark (favicon source; see TODO above).

Shard PIECES (assets/img/graphics/pieces/) — delivered in assets zip #4.
IMPORTANT: the filenames do NOT all describe abstract shards. Actual content:
- shard-piece-teal-01.png  → vertical teal gradient BAR. Abstract. Used as deco.
- shard-piece-teal-02.png  → teal shard BURST (pinwheel). Abstract. Used as deco.
- shard-piece-teal-04.png  → teal shard FAN (radiating triangles). Abstract. Used as deco.
- shard-piece-teal-03.png  → solid teal rectangle (flat fill). Available; not used as deco.
- shard-piece-ink-01.png / -03.png → RUNNER PHOTOS (KV-style, teal glow). Not abstract —
  reserve for hero/editorial imagery, NOT background deco.
- shard-piece-ink-02.png  → black→white gradient panel. Available; unused.
- shard-piece-ink-04.png  → near-solid dark panel. Available; unused.
- shard-piece-accent-01.png / -02.png → the FULL PLN Mobile Electric 5K Series LOGO.
- shard-piece-sliver-01.png / -02.png → the 20FIT | EVENT wordmark LOGO.
  Logos are NOT used as background deco — treating a logo as a watermark is a known
  bug for this site. Use the proper logo files in assets/img/logo/ instead.

Only the three abstract teal pieces (bar/burst/fan) drive the per-section
arrangements. See .hero__media--deco--v1..v6 in components.css: every deco hero
mixes the two fragments (repositioned) with one teal piece so each section gets its
own shard "fingerprint" instead of one repeated composite. A quiet opacity-only
"assembly" fade plays on load and is disabled under prefers-reduced-motion.
