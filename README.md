# Money Hater — Trip Logger

Money Hater is a self-hosted trip logger. Upload the photos you take during the day — a place,
a plate of food, an item you bought, a receipt — and it reconstructs your itinerary:

- Reads **timestamps, EXIF and GPS coordinates** from each image. **Location is optional** — a
  photo without it, a screenshot of a receipt say, is placed by its clock instead.
- Maps coordinates to **Google Places** so stops get real names.
- Understands image content with a **vision model** through the **OpenAI Agents SDK**.
- Parses **receipts** into expenses (merchant, line items, totals) so it remembers how much you spent on what.
- Groups images into **stops** and days automatically — no set-up, no tagging.
- **Trips are optional**: when you want to group some days together, name a trip and pick the
  expense it started with and the one it ended with. Nothing is ever grouped for you.
- **Name a trip while you're on it**: leave the end open and it runs to today, growing as you go,
  until you tap *End trip now*.
- **Suggests where to go next** while a trip is open — from your last stop, what you have liked so
  far on this trip, the time of day, and what is actually on locally today.
- Handles **multiple currencies**: everything rolls up into your base currency (THB by default), and
  foreign spend asks you to confirm the rate before it counts.
- Lets you **add expenses by hand** when there is no receipt — cash, a fare, a tip, your share of a bill.
- Installs as a **PWA**: add it to your home screen and it opens standalone, with the shell available
  offline — and it joins the **share sheet**, so photos go straight from your gallery into the log.
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
      <img src="docs/screenshots/trip-open.webp" alt="A trip that is still running, with suggestions for where to go next" />
      <sub><b>Still going</b> — runs to today until you end it, and suggests where to go next.</sub>
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <img src="docs/screenshots/recommendation.webp" alt="A suggested place, with why it was picked and recent comments" />
      <sub><b>What next?</b> — why this one, given your trip and the hour, plus what people say.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/trips.webp" alt="List of trips the user has created" />
      <sub><b>Trips</b> — optional groupings you make yourself; days stand alone without one.</sub>
    </td>
    <td width="33%"></td>
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
      <img src="docs/screenshots/trip-open-dark.webp" alt="A trip that is still running, with suggestions for where to go next" />
      <sub><b>Still going</b> — runs to today until you end it, and suggests where to go next.</sub>
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <img src="docs/screenshots/recommendation-dark.webp" alt="A suggested place, with why it was picked and recent comments" />
      <sub><b>What next?</b> — why this one, given your trip and the hour, plus what people say.</sub>
    </td>
    <td width="33%" valign="top">
      <img src="docs/screenshots/trips-dark.webp" alt="List of trips the user has created" />
      <sub><b>Trips</b> — optional groupings you make yourself; days stand alone without one.</sub>
    </td>
    <td width="33%"></td>
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
| AI         | OpenAI Agents SDK — vision, receipt parsing, next-stop suggestions      |
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
confirmed) and a weekend in Chiang Mai. Both kinds of trip are there: the Chiang Mai weekend is
finished, today's is still running. Dates are always relative to today, so the demo lands on
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

```bash
OPENAI_API_KEY=sk-…      # or LLM_API_KEY, which overrides it
LLM_MODEL=gpt-4.1-mini   # must be able to see images
```

Both AI features run on OpenAI: photo analysis needs a model that can see images, and next-stop
suggestions use the Agents SDK's **hosted web search tool**, which exists only on OpenAI's
Responses API. That tool is the reason the app is not model-portable — swapping in Anthropic,
Gemini or a local Ollama would mean giving up live web search or wiring in a separate search API.
Each stored analysis records the model that produced it, so changing `LLM_MODEL` later stays
traceable.

Tracing is disabled explicitly: the SDK uploads traces to OpenAI's dashboard by default, and a
self-hosted logger shipping your itinerary off the box is not a sensible default.

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
   Only a photo with a fix of its own can be looked up; one without keeps whatever place you gave it.
4. **Vision** — an OpenAI agent classifies the image (place / food / item / receipt / …), captions it,
   and for receipts extracts merchant, currency, totals, and line items into expenses.
5. **Clustering** — images become **stops** (≤ 45 min and ≤ 300 m apart), and stops make up your
   day. A photo without GPS uses its place's coordinates if it has one; with neither, it is attached
   afterwards to the stop nearest in time, so it can join a stop but never move or reshape one.
   Stops you rename or correct are pinned and survive re-clustering.

## Trips are optional

Days are automatic; grouping them is not. Nothing decides on your behalf that a holiday happened.

When you *do* want a group — a weekend away, a work visit — make a trip and pick **the expense it
started with and the one it ended with**: the airport taxi out and the taxi home. Every day, stop,
photo and expense between those two belongs to the trip, and its total is the sum of them.

Bounding by expenses rather than dates means the edges are things you actually remember, and the
window follows them: correct the time on the outbound fare and the trip's first day moves with it.
The window covers whole days, so a photo taken minutes before its own receipt still counts. A day
belongs to at most one trip, and deleting a trip only ungroups — the days and spending stay.

### Trips you are still on

<img src="docs/screenshots/trips.webp" alt="Trip list with one trip marked ongoing" width="300" align="right" />

You rarely know the last expense when the trip begins. Tick **Still going** instead and the trip
has a start and no end: its window runs from that first expense to **today** and keeps moving, so
each new day, stop and receipt joins it as it happens.

Because "the trip I'm on right now" is singular, only one trip can be open at a time — enforced by
a partial unique index, not just a check in the service. While it is open it claims every day up to
today, so no other trip can overlap that stretch; the error names the trip in the way.

Ending it is one tap — **End trip now** closes it at the most recent expense inside it. If it
actually finished earlier, pick that expense instead and the days after it drop back out.

## What next?

While a trip is open, it can suggest where to go from here. Tap **Suggest somewhere** and an agent
is given four things: your **last stop** and its coordinates, the **stops and spending already in
this trip**, the **local date and time**, and two tools — web search, for what is actually on
around you today, and Google Places, for real candidates nearby.

Nothing about meal times is coded. The prompt states the local time and the model works out what it
calls for, including which kinds of place to look for; it answers with its own words for the moment
("late afternoon, after the temples") and three to five cards.

Suggestions are **grounded, not generated**: every card must carry a `place_id` that the Places
tool actually returned during that run, and any the model invents are dropped before they are
stored. A confident hallucination is worse than one fewer suggestion, because you walk there.

Cards stay compact — name, rating, how far. Tap one for **why it was picked**, anything on locally,
and **recent comments**; those reviews are Google's priciest field, so they are bought for the card
you opened and never for the whole row. A set is cached for 90 minutes and expires the moment you
arrive somewhere new, and **Refresh** forces another run. It needs `OPENAI_API_KEY` and
`GOOGLE_MAPS_API_KEY`; without them the panel says so instead of guessing.

## Staying signed in

Signing in sets two cookies, both `HttpOnly`: a short-lived access token (an
hour) and a refresh token that lasts a month. Every refresh rotates the token
and pushes the expiry out again, so an app you open more often than once a
month never asks for your password — which for something you reach for at every
meal on a trip is the whole point. The client renews in the background on the
first request that comes back `401`, including the "who am I" call it makes on
launch, so a session outliving its access token is invisible rather than a trip
back to the login form.

Two tabs (or a tab and the service worker) can reach for the refresh at the same
instant, and only one of them can win a rotation. The token the loser holds is
honoured for `REFRESH_ROTATION_GRACE_SECONDS` after it is replaced — long enough
for a race, short enough to be no use to anyone else. **Sign out** ends the
session immediately, grace or no grace.

### Cloudflare Turnstile (optional)

Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` and the sign-in and sign-up
forms get a Turnstile challenge, verified server-side before the password is
looked at. Leave them blank — the default — and the forms behave exactly as they
did; a box on your own LAN has no Cloudflare account and shouldn't need one. Set
only one and the app refuses to start rather than locking you out of your own
login form.

The site key reaches the browser at runtime from `/api/auth/config`, so one
image serves both cases, and the widget's script is fetched only when a form
actually needs it. Verification fails closed: if Cloudflare cannot be reached
the sign-in is refused and asks you to try again, because a check that any
outage switches off is not a check.

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

## Getting photos in

Three ways, all of them multi-photo:

- **Choose photos** opens the gallery picker — select as many as you like in one go.
- **Take a photo** goes straight to the camera on a phone.
- **Share to Money Hater.** Once installed, the app registers as a *share target*: select photos in
  your gallery, hit share, pick Money Hater, and they upload without you opening the app first.
  A share is a `POST` with a multipart body, which an SPA's `index.html` cannot answer, so the
  service worker takes it, parks the photos in the cache and hands them to the upload page
  (`frontend/public/share-target.js`). **Android and desktop Chrome/Edge only** — iOS Safari does
  not implement Web Share Target, so on an iPhone the picker is the way in.

Each photo is uploaded as its own request, three at a time, so picking twenty and having the whole
batch rejected because one of them is a 30MB panorama cannot happen. The page counts them off as
they go and lists anything that did not make it, saying whether it was already logged or why it
failed. Duplicates are detected by SHA-256, so re-sharing the same photo costs nothing.

### Photos that don't know where they were

Plenty of photos arrive with no GPS at all, and a screenshot of a receipt never had any. They are
logged all the same. A photo without coordinates is placed by its clock: it joins the stop it was
taken during, and only sits on its own under **Not yet placed** when nothing that day is near it in
time. Give it a place — tap the photo, then **Set place** — and it takes that place's coordinates,
forms or joins a stop, and appears on the map like any other.

**Set place** takes either half of the answer: pick one of the suggestions, or type a name and press
**Save** to search for it near where the photo was. Whichever way, that place is now the user's, and
re-analyzing the photo will not put the pipeline's guess back over it.

What it will not do is invent a location. A photo placed this way never contributes to where a stop
is, so a stop is only ever positioned by the photos that actually knew.

The catch is that photos lose their location more often than people expect:

| | keeps location? |
| --- | --- |
| Taken with the camera, location permission on | yes |
| Shared from iOS Photos | only with *Options → Location* switched on |
| Shared from Google Photos | not if *Settings → Sharing → Remove geo location* is on |
| Received over WhatsApp/Telegram/LINE | **no** — they re-compress and drop the EXIF |
| Screenshots | **no**, there was never one to keep |

Keeping it is still worth doing — it is what puts a photo on the map with no effort from you — so
the upload screen links **"How to keep it"**: a sheet with the camera and sharing settings for
whichever phone you are on, and the warning about chat apps.

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
