# Money Hater — Trip Logger

Money Hater is a self-hosted trip logger. Upload the photos you take during the day — a place,
a plate of food, an item you bought, a receipt — and it reconstructs your itinerary:

- Reads **timestamps, EXIF and GPS coordinates** from each image.
- Maps coordinates to **Google Places** so stops get real names.
- Understands image content with a **vision model** (OpenAI Agents SDK): place, food, item, or receipt.
- Parses **receipts** into expenses (merchant, line items, totals) so it remembers how much you spent on what.
- Groups images into **visits** and **trips** automatically — a trip can be a vacation, the commute to
  work, or going out for lunch while working from home.
- Handles **multiple currencies**: everything rolls up into your base currency (THB by default), and
  foreign spend asks you to confirm the rate before it counts.
- Lets you **add expenses by hand** when there is no receipt — cash, a fare, a tip, your share of a bill.
- Installs as a **PWA**: add it to your home screen and it opens standalone, with the shell available
  offline.

## Tech stack

| Layer      | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Backend    | Python 3.11+, FastAPI, SQLAlchemy 2 (async), Alembic                    |
| Jobs       | Procrastinate (PostgreSQL-native task queue — no Redis)                 |
| Database   | PostgreSQL 17 (CloudNativePG in Kubernetes)                             |
| AI         | OpenAI Agents SDK (vision classification + receipt parsing)             |
| Geo        | Google Geocoding + Places API (cached in Postgres, stubbed without key) |
| Frontend   | React 19 + TypeScript + Vite, TanStack Query, Tailwind CSS v4           |
| Map        | MapLibre GL + OpenStreetMap tiles                                       |
| Images     | Filesystem (`MEDIA_ROOT`) — a PVC in Kubernetes                         |

## Local development

### Devcontainer (recommended)

Open the repo in VS Code and choose **Reopen in Container**. The devcontainer starts a
Python + Node workspace and a PostgreSQL 17 service, installs dependencies, and applies
migrations. Then:

```bash
# terminal 1 — API (http://localhost:8000)
cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0

# terminal 2 — worker (image analysis pipeline)
cd backend && uv run python -m app.worker.run

# terminal 3 — frontend (http://localhost:5173, proxies /api to :8000)
cd frontend && npm run dev
```

### Docker Compose

```bash
cp .env.example .env   # add OPENAI_API_KEY / GOOGLE_MAPS_API_KEY if you have them
docker compose up --build
```

Frontend at http://localhost:5173, API at http://localhost:8000.

Without `OPENAI_API_KEY` and `GOOGLE_MAPS_API_KEY` the app still works: places fall back to
raw coordinates and image understanding is skipped (images are logged by time/location only).

## Tests & checks

```bash
cd backend && uv run pytest          # backend tests
cd backend && uv run ruff check .    # lint
cd frontend && npm run typecheck     # tsc
cd frontend && npm test              # vitest
cd frontend && npm run build         # production build
```

## Deployment (Kubernetes + CloudNativePG)

See [deploy/README.md](deploy/README.md). In short: a CloudNativePG `Cluster` provides
PostgreSQL, a PVC holds the media files, and a single Deployment runs the API and the
worker as two containers sharing that PVC (RWO-friendly). `kubectl apply -k deploy/`.

## How itinerary reconstruction works

1. **Upload** — images are deduplicated by SHA-256 and stored under `MEDIA_ROOT`; a job is queued.
2. **EXIF** — `taken_at` (falls back to upload time), GPS coordinates, camera info; thumbnail generated.
3. **Places** — GPS is reverse-geocoded and matched to nearby Google Places (cached by `place_id`).
4. **Vision** — an OpenAI agent classifies the image (place / food / item / receipt / …), captions it,
   and for receipts extracts merchant, currency, totals, and line items into expenses.
5. **Clustering** — images become **visits** (≤ 45 min and ≤ 300 m apart) and visits chain into
   **trips** (gaps ≤ 4 h). Your manual edits (rename, merge, split, reassign) are pinned and
   survive re-clustering.

## Money and currencies

- Amounts are stored as integers in each currency's minor unit (satang, yen) next to its ISO 4217
  code — no floating-point money.
- Every expense also carries a conversion into your **base currency** (Settings → base currency,
  THB out of the box), so a day, a trip and the dashboard each show one honest number.
- When a receipt is in another currency, the day's reference rate is fetched and applied, and the
  expense is **flagged for confirmation** — your card or a money changer rarely matches the
  reference rate, so you can accept the suggestion or type the rate you actually got.
- Rates are cached in Postgres and fetched at most once per currency pair per day. If the rate
  service is unreachable, the amount stays unconverted rather than wrong, and waits for you.

## Adding expenses without a receipt

Not everything comes with paper. **Expenses → Add** records an amount, currency, **what** it was
(“Extra gyoza”) and **where** it was, plus when. If the time falls inside a stop on your timeline
the expense attaches to that stop automatically and counts toward that trip's total; re-clustering
keeps the link.

Every expense can be edited afterwards — **Edit** on any row reopens the same form, receipts
included, since the vision model does misread things. Correcting the time moves the expense to
whichever stop it now falls inside (or off the timeline entirely), and changing the currency
re-converts it rather than reusing the old rate.

The **Where** field suggests places from your own itinerary, ranked by distance from wherever you
actually were at that time — pick a lunchtime and the restaurant you ate at is metres away and top
of the list; pick the evening and the night market is. Those suggestions cost nothing (they come
from places already in your database), and Google is queried only when your itinerary has no match
and you have typed at least two characters. Free text is always allowed: a stall with no listing is
just a name.
