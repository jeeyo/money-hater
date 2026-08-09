# Working notes for Claude

## Any change to the UI needs screenshots

A UI change is not done when it type-checks. Type-checking, `npm run build` and
the vitest suite say nothing about whether the thing looks right — spacing,
truncation, empty states, dark mode, and "is that badge even visible" only show
up in a picture.

So: whenever you touch anything under `frontend/src`, run the app against the
seeded demo data, screenshot the screens you changed, and attach them to your
reply so we can both look at them before the work is called finished. Screenshot
the *before* too when the change is visual rather than new — a pair is far
easier to judge than a single frame.

Getting it running (three terminals; see README "Development" for the full
version):

```bash
cd backend && uv run python -m app.dev.seed   # fabricated itinerary, safe to re-run
cd backend && uv run uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev                    # :5173, proxies /api to :8000
```

Log in as `demo@moneyhater.dev` / `demodemo123`. The seeder builds two days of
itinerary with relative dates, so "today" and "last weekend" always land
somewhere sensible. `--reset` rebuilds it from scratch; without the flag it is a
no-op once the account exists.

Drive the browser with Playwright to capture the shots. Chromium is already
installed in the container (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`) — never
run `playwright install`. Capture at a phone viewport as well as desktop: this is
a PWA people install on their phone, and the phone layout is the one that
actually gets used.

Screens worth checking, by what you touched: the day timeline (`/`), a trip's
detail page with its map, the upload page, the expenses list, and any sheet or
modal the change reaches.
