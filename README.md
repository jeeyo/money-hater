# Money Hater — Trip Logger

Money Hater is a self-hosted trip logger. Upload the photos you take during the day — a place,
a plate of food, an item you bought, a receipt — and it reconstructs your itinerary:

- Reads **timestamps, EXIF and GPS coordinates** from each image.
- Maps coordinates to **Google Places** so stops get real names.
- Understands image content with a **vision model** — OpenAI Agents SDK routed through **LiteLLM**,
  so OpenAI, Anthropic, Gemini, a local Ollama or your own vLLM are all a config change.
- Parses **receipts** into expenses (merchant, line items, totals) so it remembers how much you spent on what.
- Groups images into **stops** and days automatically — no set-up, no tagging.
- **Trips are optional**: when you want to group some days together, name a trip and pick the
  expense it started with and the one it ended with. Nothing is ever grouped for you.
- Handles **multiple currencies**: everything rolls up into your base currency (THB by default), and
  foreign spend asks you to confirm the rate before it counts.
- Lets you **add expenses by hand** when there is no receipt — cash, a fare, a tip, your share of a bill.
- Installs as a **PWA**: add it to your home screen and it opens standalone, with the shell available
  offline.
- **Dark mode** in true black for OLED, following your system unless you pin it.

## Screenshots

<table>
  <tr>
    <td width="33%" valign="top">
      <img src="docs/screenshots/timeline.webp" alt="Day timeline of stops with photos and spend" />
      <sub><b>Timeline</b> — your day rebuilt from photos: each stop, when you were there, what you spent.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/trip-detail.webp" alt="Trip detail showing its days, stops and route map" />
      <sub><b>Trip</b> — the days you grouped, their stops, and a route per day on the map.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/expenses.webp" alt="Expenses rolled up into the base currency" />
      <sub><b>Expenses</b> — everything in your base currency, with what was actually paid alongside.</sub>
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <img src="docs/screenshots/confirm-rate.webp" alt="Confirming the exchange rate for a foreign expense" />
      <sub><b>Confirm a rate</b> — foreign spend is converted at the day's rate, then waits for you to agree.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/add-expense.webp" alt="Adding an expense with place suggestions" />
      <sub><b>Add an expense</b> — no receipt needed; <i>Where</i> suggests places from where you actually were.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/trips.webp" alt="List of trips the user has created" />
      <sub><b>Trips</b> — optional groupings you make yourself; days stand alone without one.</sub>
    </td>
  </tr>
</table>

<img src="docs/screenshots/desktop.webp" alt="Desktop layout with a sidebar" />

<sub>The same app on a wide screen — the bottom tab bar becomes a sidebar.</sub>

### Dark mode

True black for OLED — the page and the cards are `#000`, separated by borders rather than raised
grey surfaces, so unlit pixels stay unlit. Follows your system by default; **Settings → Appearance**
pins it to light or dark.

<table>
  <tr>
    <td width="33%" valign="top">
      <img src="docs/screenshots/timeline-dark.webp" alt="Day timeline of stops with photos and spend" />
      <sub><b>Timeline</b> — your day rebuilt from photos: each stop, when you were there, what you spent.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/trip-detail-dark.webp" alt="Trip detail showing its days, stops and route map" />
      <sub><b>Trip</b> — the days you grouped, their stops, and a route per day on the map.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/expenses-dark.webp" alt="Expenses rolled up into the base currency" />
      <sub><b>Expenses</b> — everything in your base currency, with what was actually paid alongside.</sub>
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <img src="docs/screenshots/confirm-rate-dark.webp" alt="Confirming the exchange rate for a foreign expense" />
      <sub><b>Confirm a rate</b> — foreign spend is converted at the day's rate, then waits for you to agree.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/add-expense-dark.webp" alt="Adding an expense with place suggestions" />
      <sub><b>Add an expense</b> — no receipt needed; <i>Where</i> suggests places from where you actually were.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/trips-dark.webp" alt="List of trips the user has created" />
      <sub><b>Trips</b> — optional groupings you make yourself; days stand alone without one.</sub>
    </td>
  </tr>
</table>

<img src="docs/screenshots/desktop-dark.webp" alt="Desktop layout in dark mode" />

<sub>The basemap is dimmed rather than inverted, so each day's route keeps its exact colour.</sub>

## Tech stack

| Layer      | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Backend    | Python 3.11+, FastAPI, SQLAlchemy 2 (async), Alembic                    |
| Jobs       | Procrastinate (PostgreSQL-native task queue — no Redis)                 |
| Database   | PostgreSQL 17 (CloudNativePG in Kubernetes)                             |
| AI         | OpenAI Agents SDK + LiteLLM (any provider: vision + receipt parsing)    |
| Geo        | Google Geocoding + Places API (cached in Postgres, stubbed without key) |
| Frontend   | React 19 + TypeScript + Vite, TanStack Query, Tailwind CSS v4           |
| Map        | MapLibre GL + OpenStreetMap tiles                                       |
| Images     | Filesystem (`MEDIA_ROOT`) — a PVC in Kubernetes                         |

## Local development

### Devcontainer (recommended)

Open the repo in VS Code and choose **Reopen in Container**. It starts a Python + Node workspace
alongside PostgreSQL 17, installs dependencies, and — on **every container start** — applies
migrations and makes sure the demo account exists, so there is always something on screen.

```bash
# terminal 1 — API (http://localhost:8000)
cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0

# terminal 2 — worker (image analysis pipeline)
cd backend && uv run python -m app.worker.run

# terminal 3 — frontend (http://localhost:5173, proxies /api to :8000)
cd frontend && npm run dev
```

#### Demo login

| Email                  | Password       |
| ---------------------- | -------------- |
| `demo@moneyhater.dev`  | `demodemo123`  |

The account is seeded with two days of fabricated itinerary — a day around Bangkok (with a
receipt, a couple of hand-entered fares and a foreign-currency expense waiting for its rate to be
confirmed) and a weekend in Chiang Mai. Dates are always relative to today, so the demo lands on
"today" and "last weekend" whenever you spin the container up.

Seeding is a no-op once the account exists, so restarts never clobber what you've been poking at.
To throw it away and rebuild:

```bash
cd backend && uv run python -m app.dev.seed --reset
```

The seeder is development-only: it writes a known password and fabricated data. Don't point it at
anything real.

### Docker Compose

```bash
cp .env.example .env   # add a model provider key / GOOGLE_MAPS_API_KEY if you have them
docker compose up --build
```

Frontend at http://localhost:5173, API at http://localhost:8000.

Without a model provider and `GOOGLE_MAPS_API_KEY` the app still works: places fall back to
raw coordinates and image understanding is skipped (images are logged by time/location only).

### Choosing a model

Image analysis runs through [LiteLLM](https://docs.litellm.ai/), so the provider is configuration
rather than code. Set `LLM_MODEL` to `provider/model` and supply that provider's key:

```bash
LLM_MODEL=anthropic/claude-sonnet-4-5   ANTHROPIC_API_KEY=sk-ant-…
LLM_MODEL=gemini/gemini-2.5-flash       GEMINI_API_KEY=…
LLM_MODEL=ollama/llava                  # local, no key needed
LLM_MODEL=hosted_vllm/Qwen2-VL-7B-Instruct  LLM_API_BASE=http://vllm.internal:8000/v1
```

`LLM_API_KEY` and `LLM_API_BASE` override per-provider variables when you want an explicit key or
a proxy. Each stored analysis records the model that produced it, so switching later stays
traceable. The model must be able to see images — a text-only one will fail every analysis.

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
5. **Clustering** — images become **stops** (≤ 45 min and ≤ 300 m apart), and stops make up your
   day. Stops you rename or correct are pinned and survive re-clustering.

## Trips are optional

Days are automatic; grouping them is not. Nothing decides on your behalf that a holiday happened.

When you *do* want a group — a weekend away, a work visit — make a trip and pick **the expense it
started with and the one it ended with**: the airport taxi out and the taxi home. Every day, stop,
photo and expense between those two belongs to the trip, and its total is the sum of them.

Bounding by expenses rather than dates means the edges are things you actually remember, and the
window follows them: correct the time on the outbound fare and the trip's first day moves with it.
The window covers whole days, so a photo taken minutes before its own receipt still counts. A day
belongs to at most one trip, and deleting a trip only ungroups — the days and spending stay.

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
