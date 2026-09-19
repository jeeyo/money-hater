"""A trip as one self-contained HTML page.

The page has no build step, no framework and no account behind it: the itinerary
is pre-rendered markup, the photos are inlined as data URIs, and the only
JavaScript is the map — the same MapLibre basemap and per-day routes the app
draws, loaded from a CDN. Opened from a Downloads folder it needs the network for
map tiles and that one script; everything else is in the file.

It is a file rather than a share link on purpose. Every route in this API answers
only to its owner's cookie, so a URL would mean public trips, share tokens and
unauthenticated image serving. A file is the same trip with none of that, shared
with exactly the people it is sent to.
"""

import json
import re
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache
from pathlib import Path

from app.schemas import ExpenseOut, TripDayOut, TripDetailOut, VisitOut

from .basemap import DARK_BASEMAP_PAINT, OSM_STYLE, day_color, day_dash
from .format import format_day, format_money, format_spend, format_time

ASSETS = Path(__file__).parent / "assets"

# Kept in step with the app's own maplibre-gl — `test_export.py` reads
# frontend/package-lock.json and fails if the two drift.
MAPLIBRE_VERSION = "5.24.0"
MAPLIBRE_JS = f"https://cdn.jsdelivr.net/npm/maplibre-gl@{MAPLIBRE_VERSION}/dist/maplibre-gl.js"
MAPLIBRE_CSS = f"https://cdn.jsdelivr.net/npm/maplibre-gl@{MAPLIBRE_VERSION}/dist/maplibre-gl.css"

# Bumped whenever this module changes the page in a way a reader would notice.
# The fingerprint covers the trip's content; this covers the template around it,
# so a cache entry written by an older version of this file is not mistaken for
# a current one.
FORMAT_VERSION = 1


@dataclass(frozen=True)
class ExportOptions:
    """Off, `photos` leaves the pictures out and `spending` leaves out every
    amount: the badges, the expense lines, the total."""

    photos: bool = True
    spending: bool = True


@dataclass(frozen=True)
class RenderedPage:
    html: str
    fingerprint: str


@lru_cache(maxsize=2)
def _asset(name: str) -> str:
    return (ASSETS / name).read_text(encoding="utf-8")


def esc(value: str) -> str:
    """Every piece of user text goes through this — a place name is whatever the
    user typed, and it ends up in a file other people open."""
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def json_literal(value: object) -> str:
    """JSON for a `<script>` body: `</script>` inside a string would end the tag."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


def _map_days(trip: TripDetailOut) -> list[dict]:
    """One route per day, coloured here so the page has no palette logic of its
    own to drift from the app's.

    A day with nothing to plot is not a day on the map and must not take a colour
    with it: the legend and the routes are indexed off the days that made it,
    exactly as the frontend's MapView does it.
    """
    days = [
        {
            "label": f"Day {index + 1}",
            "points": [
                {"lat": visit.lat, "lng": visit.lng, "label": visit.label}
                for visit in day.visits
                if visit.lat is not None and visit.lng is not None
            ],
        }
        for index, day in enumerate(trip.days)
    ]
    plotted = [day for day in days if day["points"]]
    for index, day in enumerate(plotted):
        day["color"] = day_color(index, len(plotted))
        day["dash"] = day_dash(index)
    return plotted


def _heading_colors(trip: TripDetailOut, plotted: list[dict]) -> list[str | None]:
    """The colour a day's heading swatch takes — its route's, or nothing if the
    day never made it onto the map."""
    colors: list[str | None] = []
    taken = 0
    for day in trip.days:
        on_map = any(v.lat is not None and v.lng is not None for v in day.visits)
        colors.append(plotted[taken]["color"] if on_map else None)
        taken += 1 if on_map else 0
    return colors


def _photo_row(visit: VisitOut, photos: dict[int, str]) -> str:
    tags = []
    for image in visit.images:
        src = photos.get(image.id)
        if not src:
            continue
        caption = (image.analysis.caption if image.analysis else None) or "photo"
        tags.append(
            f'<button type="button" class="photo" data-image-id="{image.id}">'
            f'<img src="{src}" alt="{esc(caption)}" loading="lazy">'
            "</button>"
        )
    return f'<div class="photos">{"".join(tags)}</div>' if tags else ""


def _expense_line(expense: ExpenseOut) -> str:
    """What the money went on, under the stop it was spent at."""
    where = expense.place.name if expense.place else expense.merchant
    what = expense.description or where or "Expense"
    amount = format_money(expense.total_minor, expense.currency)
    return (
        "<li>"
        f'<span class="line-what">{esc(what)}</span>'
        f'<span class="line-amount">{esc(amount)}</span>'
        "</li>"
    )


def _stop_entry(
    visit: VisitOut,
    options: ExportOptions,
    photos: dict[int, str],
    color: str | None,
    number: int | None,
) -> str:
    time = format_time(visit.started_at)
    if visit.ended_at != visit.started_at:
        time = f"{time} – {format_time(visit.ended_at)}"
    address = visit.place.formatted_address if visit.place else None
    pin = (
        f'<span class="pin" style="background:{color}">{number}</span>'
        if number is not None and color
        else ""
    )
    badge = (
        f'<span class="badge">{esc(format_spend(visit.spend))}</span>'
        if options.spending and visit.spend.base_total_minor > 0
        else ""
    )
    lines = (
        f'<ul class="lines">{"".join(_expense_line(e) for e in visit.expenses)}</ul>'
        if options.spending and visit.expenses
        else ""
    )
    dot_style = f' style="--dot:{color}"' if color else ""
    return (
        '<article class="entry">'
        f'<span class="dot dot-stop"{dot_style}></span>'
        '<div class="card"><div class="card-head"><div class="card-title">'
        f'<p class="name">{pin}{esc(visit.label)}</p>'
        f'<p class="sub">{esc(time)}'
        + (f' · <span class="addr">{esc(address)}</span>' if address else "")
        + "</p></div>"
        f"{badge}</div>"
        f"{_photo_row(visit, photos)}{lines}"
        "</div></article>"
    )


def _expense_entry(expense: ExpenseOut) -> str:
    """Spending that belongs to no stop — a fare, a tip — as an entry of its own,
    the way the app's timeline rail shows it."""
    where = expense.place.name if expense.place else expense.merchant
    title = expense.description or where or "Expense"
    subtitle = where if (expense.description and where) else expense.note
    if expense.base_total_minor is not None:
        amount = format_money(expense.base_total_minor, expense.base_currency)
    else:
        amount = format_money(expense.total_minor, expense.currency)
    parts = [format_time(expense.spent_at) if expense.spent_at else "", subtitle or ""]
    sub = " · ".join(part for part in parts if part)
    return (
        '<article class="entry"><span class="dot dot-money"></span>'
        '<div class="card card-quiet"><div class="card-head"><div class="card-title">'
        f'<p class="name">{esc(title)}</p>'
        + (f'<p class="sub">{esc(sub)}</p>' if sub else "")
        + "</div>"
        f'<span class="badge">{esc(amount)}</span>'
        "</div></div></article>"
    )


def _day_entries(
    day: TripDayOut, options: ExportOptions, photos: dict[int, str], color: str | None
) -> str:
    """One day as a single chronological rail, stops and loose spending together.

    Sorted on the ISO text of each moment rather than the moment itself: the
    column is timezone-aware on Postgres and naive on SQLite, and an expense with
    no time of its own has to sort last rather than to 1970.
    """
    rows: list[tuple[str, str]] = []
    plotted = 0
    for visit in day.visits:
        number = None
        if visit.lat is not None and visit.lng is not None:
            plotted += 1
            number = plotted
        rows.append(
            (visit.started_at.isoformat(), _stop_entry(visit, options, photos, color, number))
        )
    if options.spending:
        for expense in day.expenses:
            at = expense.spent_at.isoformat() if expense.spent_at else "9999"
            rows.append((at, _expense_entry(expense)))

    if not rows:
        return '<p class="empty">Nothing logged on this day.</p>'
    rows.sort(key=lambda row: row[0])
    return f'<div class="rail">{"".join(html for _, html in rows)}</div>'


def _day_section(
    trip: TripDetailOut,
    index: int,
    options: ExportOptions,
    photos: dict[int, str],
    color: str | None,
) -> str:
    day = trip.days[index]
    swatch = f'<span class="swatch" style="background:{color}"></span>' if color else ""
    spend = (
        f'<span class="day-spend">{esc(format_spend(day.spend))}</span>'
        if options.spending and day.spend.base_total_minor > 0
        else ""
    )
    return (
        '<section class="day"><h2>'
        f"{swatch}Day {index + 1}"
        f'<span class="day-date">{esc(format_day(day.date))}</span>{spend}'
        "</h2>"
        f"{_day_entries(day, options, photos, color)}"
        "</section>"
    )


def range_line(trip: TripDetailOut) -> str:
    """"Sat, Sep 12, 2026 – Sun, Sep 13, 2026 · 2 days". Never "– now": a file is
    read long after it was written, and an open trip's `ended_at` is the day it
    was exported on, which is what the range should say."""
    days = f"{trip.day_count} day{'' if trip.day_count == 1 else 's'}"
    if trip.day_count == 1:
        return f"{format_day(trip.started_at)} · {days}"
    return f"{format_day(trip.started_at)} – {format_day(trip.ended_at)} · {days}"


def _header(trip: TripDetailOut, options: ExportOptions) -> str:
    parts = ['<header class="head">', f"<h1>{esc(trip.title)}</h1>"]
    parts.append(f'<p class="range">{esc(range_line(trip))}')
    if options.spending and trip.spend.base_total_minor > 0:
        parts.append(f' · spent <span class="total">{esc(format_spend(trip.spend))}</span>')
    parts.append("</p>")
    if trip.end_expense_id is None:
        parts.append('<p class="ongoing">Still going when this page was made</p>')
    if trip.note:
        parts.append(f'<p class="note">{esc(trip.note)}</p>')
    parts.append("</header>")
    return "".join(parts)


def _legend(days: list[dict]) -> str:
    if len(days) < 2:
        return ""
    items = "".join(
        f'<li><span class="key" style="background:{day["color"]}"></span>{esc(day["label"])}</li>'
        for day in days
    )
    return f'<ul class="legend">{items}</ul>'


def fingerprint(content: str, data_json: str, options: ExportOptions) -> str:
    """Which version of the trip a page is.

    A trip has no version to read — no `updated_at` on any model, and its contents
    are whatever visits and expenses fall inside its window — so the only honest
    answer to "is this the same trip as last time" is to fingerprint what the page
    ends up saying. That is what goes in: the rendered markup and the map's own
    data, minus two things.

    Photo bytes come out, replaced by the ids that produced them, so a re-encode
    is not mistaken for a change; a stored image's file never changes under its
    id. The export date is not in here at all — it is the one part of the page
    that moves on its own, and a cache keyed on it would never hit.

    The toggles and `FORMAT_VERSION` go in because both change the document
    without changing the trip.

    FNV-1a, 32 bits, eight hex characters. Nothing here is a security boundary:
    it only has to tell two versions of one trip apart, and it names a file on
    disk, so it wants to be short.
    """
    body = re.sub(r' src="data:[^"]*"', "", content)
    material = "\n".join(
        [
            f"v{FORMAT_VERSION}",
            "spending" if options.spending else "no-spending",
            "photos" if options.photos else "no-photos",
            body,
            data_json,
        ]
    )
    digest = 0x811C9DC5
    for byte in material.encode("utf-8"):
        digest = ((digest ^ byte) * 0x01000193) & 0xFFFFFFFF
    return f"{digest:08x}"


def render_page(
    trip: TripDetailOut,
    options: ExportOptions,
    photos: dict[int, str],
    exported_at: datetime,
) -> RenderedPage:
    """The whole trip as one HTML document, and the version stamp it carries."""
    days = _map_days(trip)
    colors = _heading_colors(trip, days)
    data_json = json_literal({"days": days, "style": OSM_STYLE, "darkPaint": DARK_BASEMAP_PAINT})

    if trip.days:
        sections = "".join(
            _day_section(trip, index, options, photos, colors[index])
            for index in range(len(trip.days))
        )
    else:
        sections = '<p class="empty">Nothing was logged on this trip.</p>'
    map_block = f'<div id="map"></div>{_legend(days)}' if days else ""
    content = f"{_header(trip, options)}{map_block}{sections}"

    # Taken before the head and footer are built, so the stamp they carry is not
    # an input to itself and the export date beside it cannot move the version of
    # a trip that has not moved.
    stamp = fingerprint(content, data_json, options)
    description = f"{trip.title} — {range_line(trip)}"

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(trip.title)}</title>
<meta name="description" content="{esc(description)}">
<meta name="generator" content="Money Hater">
<!-- Which version of the trip this page is, and when it was taken. The name of
     the file says only which trip, and a file gets renamed; these do not. -->
<meta name="trip-fingerprint" content="{stamp}">
<meta name="trip-exported" content="{exported_at.date().isoformat()}">
<link rel="stylesheet" href="{MAPLIBRE_CSS}">
<style>{_asset("page.css")}</style>
</head>
<body>
<main class="page">
{content}
<footer class="foot">
Made with Money Hater · {esc(format_day(exported_at))} · version
<span class="stamp">{stamp}</span> · map tiles © OpenStreetMap contributors
</footer>
</main>
<div class="lightbox" id="lightbox" hidden><img alt=""></div>
<script type="application/json" id="trip-data">{data_json}</script>
<script src="{MAPLIBRE_JS}"></script>
<script>{_asset("page.js")}</script>
</body>
</html>
"""
    return RenderedPage(html=html, fingerprint=stamp)


def filename_for(trip: TripDetailOut) -> str:
    """"bangkok-2026-08-01.html" — the trip, and nothing about this export of it.

    One trip is one file: exporting it again, changed or not, replaces the copy
    the user already had rather than leaving "(1)" beside it. Which version a
    given copy is, is a question for the fingerprint in its head and footer — the
    name answers "which trip", and it has to keep answering that after someone
    renames the file anyway.
    """
    title = trip.title.lower()
    slug = "".join(c if c.isalnum() and c.isascii() else "-" for c in title)
    slug = "-".join(part for part in slug.split("-") if part)[:60].strip("-")
    return f"{slug or 'trip'}-{trip.started_at.date().isoformat()}.html"
