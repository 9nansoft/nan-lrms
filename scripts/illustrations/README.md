# Illustrations

Assets in `public/illustrations/`, generated with Qwen-Image-2.1 (BMS image service) from
`scripts/illustrations/manifest.json` — prompts, style string and seeds are
recorded there; `python3 scripts/illustrations/generate.py` reproduces them.

- Decorative only: always rendered with `alt=""`.
- **License:** Qwen Research License — signed off by the owner on
  2026-10-11. Shown by default; set `NEXT_PUBLIC_ILLUSTRATIONS_ENABLED=false`
  (build-time) to fall back to icons.
- Transparent items are trimmed to their subject (+6% padding) by
  `generate.py`, so they fill the EmptyState card.
- No red-cross emblem (legally protected) — green cross or none.
- `about-header.webp` is abstract; never present it as Khon Kaen geography.
