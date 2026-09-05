"""Seed a demo account so a fresh checkout has something to look at.

    python -m app.dev.seed            # no-op if the demo account exists
    python -m app.dev.seed --reset    # wipe the demo account and rebuild it

Development only. It writes a known-password account (see DEMO_EMAIL) and a
couple of days of fabricated itinerary — never run it against real data.
Dates are relative to today, so the demo always lands on "today" and "last
weekend" no matter when the container is built.
"""

import argparse
import asyncio
import io
import random
import shutil
import sys
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import sqlalchemy as sa
from PIL import Image as PILImage
from PIL import ImageDraw, ImageFont

from app.config import settings
from app.db import SessionLocal
from app.models import (
    AuthSession,
    ExchangeRate,
    Expense,
    ExpenseItem,
    Image,
    ImageAnalysis,
    Place,
    Trip,
    TripRecommendation,
    User,
    Visit,
)
from app.security import hash_password
from app.serialize import visit_label
from app.services import storage
from app.services.clustering import recluster_user
from app.services.expenses import create_expense
from app.services.geo import haversine_m
from app.services.money import to_minor
from app.services.trips import latest_visit_in, window_of

DEMO_EMAIL = "demo@moneyhater.dev"
DEMO_PASSWORD = "demodemo123"

HOME = (13.7650, 100.5380)
JPY_THB = Decimal("0.2354")

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
]
EMOJI_FONT_PATH = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"


def font(size: int):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size)


def emoji_sprite(char: str, target: int = 300):
    """Noto Color Emoji is a bitmap font: render at its native size, then scale."""
    if not Path(EMOJI_FONT_PATH).exists():
        return None
    canvas = PILImage.new("RGBA", (140, 140), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).text(
        (70, 62),
        char,
        font=ImageFont.truetype(EMOJI_FONT_PATH, 109),
        anchor="mm",
        embedded_color=True,
    )
    return canvas.resize((target, target), PILImage.LANCZOS)


def photo(top, bottom, emoji: str, label: str, w: int = 800, h: int = 600) -> bytes:
    """A gradient stand-in for a real photograph, captioned with its subject."""
    im = PILImage.new("RGB", (w, h))
    draw = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h
        draw.line(
            [(0, y), (w, y)],
            fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom, strict=True)),
        )
    rnd = random.Random(label)
    for _ in range(14):
        x, y = rnd.randint(0, w), rnd.randint(0, h)
        r = rnd.randint(20, 90)
        overlay = PILImage.new("RGBA", (w, h), (0, 0, 0, 0))
        ImageDraw.Draw(overlay).ellipse(
            (x - r, y - r, x + r, y + r), fill=(255, 255, 255, rnd.randint(8, 22))
        )
        im = PILImage.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")

    draw = ImageDraw.Draw(im)
    sprite = emoji_sprite(emoji)
    if sprite is not None:
        im.paste(sprite, (w // 2 - sprite.width // 2, h // 2 - sprite.height // 2 - 20), sprite)
    draw.text((w / 2, h - 60), label, font=font(36), anchor="mm", fill=(255, 255, 255))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def receipt_photo(merchant: str, items: list[tuple[str, str]], total: str, currency: str) -> bytes:
    w, h = 700, 900
    im = PILImage.new("RGB", (w, h), (168, 162, 158))
    draw = ImageDraw.Draw(im)
    draw.rectangle((70, 40, w - 70, h - 40), fill=(252, 250, 246))
    y = 90
    draw.text((w / 2, y), merchant, font=font(40), anchor="mm", fill=(30, 30, 30))
    y += 60
    draw.text((w / 2, y), "TAX INVOICE", font=font(22), anchor="mm", fill=(120, 120, 120))
    y += 50
    draw.line((110, y, w - 110, y), fill=(180, 180, 180), width=2)
    y += 40
    for name, price in items:
        draw.text((120, y), name, font=font(26), fill=(50, 50, 50))
        draw.text((w - 120, y), price, font=font(26), anchor="ra", fill=(50, 50, 50))
        y += 46
    y += 10
    draw.line((110, y, w - 110, y), fill=(180, 180, 180), width=2)
    y += 40
    draw.text((120, y), "TOTAL", font=font(34), fill=(20, 20, 20))
    draw.text((w - 120, y), f"{total} {currency}", font=font(34), anchor="ra", fill=(20, 20, 20))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=88)
    return buf.getvalue()


# Built in the machine's local timezone so the demo reads as sensible wall-clock
# times — breakfast in the morning — which is also how they are stored: every
# recorded moment is the local clock (`app.services.localtime`), tagged UTC
# without being moved by it. Converting here would file the evening's spend on
# tomorrow east of Greenwich, which is the bug this frame exists to prevent.
LOCAL_MIDNIGHT = datetime.now().astimezone().replace(hour=0, minute=0, second=0, microsecond=0)


def now_local() -> datetime:
    """Now on the machine's own wall clock — the frame the seeded rows are in."""
    return datetime.now().replace(tzinfo=UTC)


def at(days_ago: int, hour: int, minute: int) -> datetime:
    local = LOCAL_MIDNIGHT - timedelta(days=days_ago) + timedelta(hours=hour, minutes=minute)
    return local.replace(tzinfo=UTC)


PLACES = {
    "cafe": (
        "demo-place-1", "Bootleg Coffee Roasters",
        "12 Soi Ari 4, Phaya Thai, Bangkok", 13.7790, 100.5430, ["cafe", "food"],
    ),
    "ramen": (
        "demo-place-2", "Menya Itto",
        "CentralWorld 3F, Pathum Wan, Bangkok", 13.7466, 100.5395, ["restaurant", "food"],
    ),
    "temple": (
        "demo-place-3", "Wat Pho",
        "2 Sanam Chai Rd, Phra Nakhon, Bangkok", 13.7465, 100.4930,
        ["tourist_attraction", "place_of_worship"],
    ),
    "market": (
        "demo-place-4", "Jodd Fairs Night Market",
        "Rama IX Rd, Huai Khwang, Bangkok", 13.7530, 100.5660, ["market", "food"],
    ),
    "doi_suthep": (
        "demo-place-5", "Wat Phra That Doi Suthep",
        "Su Thep, Mueang Chiang Mai", 18.8048, 98.9217, ["tourist_attraction"],
    ),
    "cnx_cafe": (
        "demo-place-6", "Graph Cafe",
        "Ratvithi Ln, Chiang Mai Old City", 18.7930, 98.9853, ["cafe"],
    ),
}

# Places the demo *recommends* rather than visits. They carry the fields a real
# Google reply would — rating, price, reviews — so the recommendation cards and
# their detail sheet render fully with no API key and no model.
# (google_place_id, name, address, lat, lng, types, rating, count, price, reviews)
RECOMMENDABLE = [
    (
        "demo-rec-1", "Mango Sticky Rice Corner",
        "Maha Rat Rd, Phra Nakhon, Bangkok", 13.7452, 100.4915,
        ["dessert_shop", "food"], 4.7, 2841, "PRICE_LEVEL_INEXPENSIVE",
        [
            ("Nok P.", 5, "Best mango sticky rice near the old town. Queue moves fast.",
             "2 weeks ago"),
            ("Daniel R.", 4, "Sweet, cheap, and two minutes from Wat Pho. Cash only.",
             "a month ago"),
        ],
    ),
    (
        "demo-rec-2", "Tha Tien Pier Coffee",
        "Tha Tien, Phra Nakhon, Bangkok", 13.7437, 100.4921,
        ["cafe", "food"], 4.4, 612, "PRICE_LEVEL_MODERATE",
        [
            ("Aom S.", 5, "Iced latte with a river view after the temples. Worth the walk.",
             "3 days ago"),
            ("Marta L.", 4, "Small and busy at sunset, but the terrace is lovely.", "2 months ago"),
        ],
    ),
    (
        "demo-rec-3", "Wat Arun",
        "158 Thanon Wang Doem, Bangkok Yai", 13.7437, 100.4889,
        ["tourist_attraction", "place_of_worship"], 4.6, 51204, None,
        [
            ("Ken T.", 5, "Cross on the ferry from Tha Tien — two minutes, four baht.",
             "a week ago"),
            ("Priya M.", 5, "Go late afternoon; the light on the porcelain is unreal.",
             "a month ago"),
        ],
    ),
    (
        "demo-rec-4", "Wang Lang Market",
        "Wang Lang Rd, Bangkok Noi", 13.7576, 100.4855,
        ["market", "food"], 4.3, 8930, "PRICE_LEVEL_INEXPENSIVE",
        [
            ("Siriporn K.", 4, "Grilled squid and hoy tod stalls from about 5pm.", "5 days ago"),
            ("Tom H.", 4, "Locals' market, not a tourist one. Bring small notes.", "3 weeks ago"),
        ],
    ),
]


# (key, place, taken_at, kind, description|None, caption, labels, photo, expense|None)
# expense = (merchant, total_minor, currency, [(item, qty, amount_minor)], spent_at)
SHOTS = [
    # Today, around Bangkok
    (
        "flat_white", "cafe", at(0, 8, 35), "food", "Flat white",
        "A flat white on a wooden counter", ["coffee", "cafe", "morning"],
        photo((94, 62, 40), (203, 163, 124), "☕", "morning coffee"),
        ("Bootleg Coffee Roasters", 9500, "THB", [("Flat white", 1, 9500)], at(0, 8, 36)),
    ),
    (
        "ramen_bowl", "ramen", at(0, 12, 10), "food", None,
        "Tonkotsu ramen with chashu and egg", ["ramen", "restaurant", "lunch"],
        photo((146, 64, 14), (250, 204, 21), "🍜", "tonkotsu ramen"), None,
    ),
    (
        "ramen_receipt", "ramen", at(0, 12, 52), "receipt", "Lunch",
        "Lunch receipt from Menya Itto", ["receipt", "restaurant"],
        receipt_photo(
            "MENYA ITTO",
            [("Tokusei ramen", "290.00"), ("Gyoza (5 pcs)", "95.00"), ("Green tea", "40.00")],
            "425.00", "THB",
        ),
        (
            "Menya Itto", 42500, "THB",
            [("Tokusei ramen", 1, 29000), ("Gyoza (5 pcs)", 1, 9500), ("Green tea", 1, 4000)],
            at(0, 12, 50),
        ),
    ),
    (
        "temple", "temple", at(0, 15, 5), "place", None,
        "Golden chedis at Wat Pho under a blue sky", ["temple", "landmark", "architecture"],
        photo((30, 64, 175), (253, 224, 71), "⛩️", "Wat Pho"), None,
    ),
    (
        "buddha", "temple", at(0, 15, 30), "place", None,
        "Reclining Buddha detail", ["temple", "statue", "gold"],
        photo((120, 53, 15), (252, 211, 77), "🧘", "reclining buddha"), None,
    ),
    (
        "market_food", "market", at(0, 19, 20), "food", "Grilled squid + tea",
        "Grilled squid skewers at a night market stall", ["street food", "market", "night"],
        photo((15, 23, 42), (244, 63, 94), "🦑", "night market"),
        ("Jodd Fairs", 18000, "THB", [("Grilled squid", 2, 12000), ("Thai tea", 1, 6000)],
         at(0, 19, 25)),
    ),
    (
        "market_crowd", "market", at(0, 19, 45), "place", None,
        "Neon-lit market alley full of people", ["market", "night", "crowd"],
        photo((30, 27, 75), (236, 72, 153), "🏮", "jodd fairs"), None,
    ),
    # Last weekend in Chiang Mai (far enough away to classify as a trip)
    (
        "cnx_view", "doi_suthep", at(7, 10, 15), "place", None,
        "Doi Suthep temple terrace above the clouds", ["temple", "mountain", "viewpoint"],
        photo((3, 105, 161), (186, 230, 253), "⛰️", "doi suthep"), None,
    ),
    (
        "cnx_latte", "cnx_cafe", at(7, 14, 40), "food", "Orange latte",
        "Iced latte with orange peel", ["coffee", "cafe"],
        photo((124, 45, 18), (254, 215, 170), "🍊", "orange latte"),
        ("Graph Cafe", 15000, "THB", [("Sig. orange latte", 1, 15000)], at(7, 14, 42)),
    ),
    (
        "cnx_souvenir", "cnx_cafe", at(6, 11, 20), "item", "Ceramic elephant",
        "Hand-painted ceramic elephant souvenir", ["souvenir", "ceramic", "shopping"],
        photo((21, 94, 117), (167, 243, 208), "🐘", "souvenir"),
        ("Baan Celadon", 89000, "THB", [("Ceramic elephant", 1, 89000)], at(6, 11, 25)),
    ),
]


async def _demo_user(db) -> User | None:
    return await db.scalar(sa.select(User).where(User.email == DEMO_EMAIL))


async def purge(db, user: User) -> None:
    """Delete the demo account and everything hanging off it.

    Explicit rather than leaning on FK cascades, which sqlite does not enforce
    unless the foreign_keys pragma is on.
    """
    image_ids = sa.select(Image.id).where(Image.user_id == user.id)
    expense_ids = sa.select(Expense.id).where(Expense.user_id == user.id)
    await db.execute(sa.delete(ExpenseItem).where(ExpenseItem.expense_id.in_(expense_ids)))
    # Trips first: their bounding expenses are RESTRICT, so Postgres refuses to
    # delete an expense while a trip still points at it.
    await db.execute(sa.delete(Trip).where(Trip.user_id == user.id))
    await db.execute(sa.delete(Expense).where(Expense.user_id == user.id))
    await db.execute(sa.delete(ImageAnalysis).where(ImageAnalysis.image_id.in_(image_ids)))
    await db.execute(sa.delete(Image).where(Image.user_id == user.id))
    await db.execute(sa.delete(Visit).where(Visit.user_id == user.id))
    await db.execute(sa.delete(AuthSession).where(AuthSession.user_id == user.id))
    await db.delete(user)
    await db.commit()

    media = settings.media_root / str(user.id)
    if media.is_dir():
        shutil.rmtree(media, ignore_errors=True)


async def build(db) -> User:
    user = User(
        email=DEMO_EMAIL,
        password_hash=hash_password(DEMO_PASSWORD),
        preferred_currency="THB",
        home_lat=HOME[0],
        home_lng=HOME[1],
        home_label="Home (Ari)",
    )
    db.add(user)
    await db.flush()

    places: dict[str, Place] = {}
    for key, (gid, name, address, lat, lng, types) in PLACES.items():
        place = await db.scalar(sa.select(Place).where(Place.google_place_id == gid))
        if place is None:
            place = Place(
                google_place_id=gid, name=name, formatted_address=address,
                lat=lat, lng=lng, types=types,
            )
            db.add(place)
        places[key] = place
    await db.flush()

    for key, place_key, taken, kind, description, caption, labels, data, expense in SHOTS:
        place = places[place_key]
        sha = storage.sha256_hex(data)
        path = storage.save_original(user.id, sha, "jpg", data)
        thumb = storage.make_thumbnail(path)
        jitter = random.Random(key)
        image = Image(
            user_id=user.id, sha256=sha, original_path=str(path), thumb_path=str(thumb),
            mime="image/jpeg", size_bytes=len(data), taken_at=taken, exif_taken_at=taken,
            taken_at_source="exif",
            lat=place.lat + jitter.uniform(-4e-4, 4e-4),
            lng=place.lng + jitter.uniform(-4e-4, 4e-4),
            place_id=place.id, status="analyzed", uploaded_at=taken,
        )
        db.add(image)
        await db.flush()
        db.add(
            ImageAnalysis(
                image_id=image.id, kind=kind, caption=caption, labels=labels,
                model="demo-seed",
            )
        )
        if expense:
            merchant, total, currency, items, spent = expense
            exp = Expense(
                user_id=user.id, image_id=image.id, source="receipt", merchant=merchant,
                place_id=place.id, description=description, spent_at=spent,
                currency=currency, total_minor=total, base_currency="THB",
                base_total_minor=total, fx_rate=Decimal(1), fx_rate_source="same",
                needs_review=False,
            )
            db.add(exp)
            await db.flush()
            for name, qty, amount in items:
                db.add(ExpenseItem(expense_id=exp.id, name=name, qty=qty, amount_minor=amount))

    # A cached rate, so the demo shows a conversion without needing the FX API
    today = datetime.now(UTC).date()
    if not await db.scalar(
        sa.select(ExchangeRate).where(
            ExchangeRate.from_currency == "JPY",
            ExchangeRate.to_currency == "THB",
            ExchangeRate.as_of_date == today,
        )
    ):
        db.add(
            ExchangeRate(
                from_currency="JPY", to_currency="THB", rate=JPY_THB, as_of_date=today
            )
        )
    await db.flush()

    # A foreign-currency receipt awaiting rate confirmation
    jpy = Expense(
        user_id=user.id, source="receipt", merchant="Ichiran Shinjuku",
        description="Ramen dinner", spent_at=at(5, 13, 20), currency="JPY",
        total_minor=to_minor(4980, "JPY"), base_currency="THB",
        base_total_minor=to_minor(Decimal(4980) * JPY_THB, "THB"),
        fx_rate=JPY_THB, fx_rate_source="api", needs_review=True,
    )
    db.add(jpy)
    await db.flush()
    for name, amount in [("Tonkotsu ramen x2", 3160), ("Extra chashu", 1120), ("Beer", 700)]:
        db.add(ExpenseItem(expense_id=jpy.id, name=name, qty=1, amount_minor=amount))

    # Spending with no receipt photo at all
    await create_expense(
        db, user, total_minor=to_minor(62, "THB"), currency="THB",
        description="BTS fare", merchant="BTS Ari", spent_at=at(0, 8, 5), source="manual",
    )
    await create_expense(
        db, user, total_minor=to_minor(120, "THB"), currency="THB",
        description="Songthaew ride", spent_at=at(0, 14, 30),
        note="cash, no receipt", source="manual",
    )
    # ...one of them inside a stop, so the temple card shows what was paid there
    await create_expense(
        db, user, total_minor=to_minor(200, "THB"), currency="THB",
        description="Temple entry", merchant="Wat Pho", spent_at=at(0, 15, 10),
        source="manual",
    )
    # ...and one on the Chiang Mai weekend, an evening nobody photographed
    await create_expense(
        db, user, total_minor=to_minor(340, "THB"), currency="THB",
        description="Khao soi dinner", merchant="Khao Soi Khun Yai",
        spent_at=at(7, 19, 10), note="cash", source="manual",
    )

    await db.commit()
    await recluster_user(db, user)

    # One hand-made trip: the Chiang Mai weekend, from the first coffee there
    # to the souvenir on the way out. Trips are always made this way — nothing
    # groups days on its own.
    bounds = (
        (
            await db.execute(
                sa.select(Expense)
                .where(Expense.user_id == user.id, Expense.merchant.in_(
                    ["Graph Cafe", "Baan Celadon"]
                ))
                .order_by(sa.func.coalesce(Expense.spent_at, Expense.created_at))
            )
        )
        .scalars()
        .all()
    )
    if len(bounds) == 2:
        db.add(
            Trip(
                user_id=user.id,
                title="Chiang Mai weekend",
                start_expense_id=bounds[0].id,
                end_expense_id=bounds[1].id,
            )
        )

    # ...and one still running: named at the BTS gate this morning, with no end
    # yet, so today's spending keeps joining it.
    today_start = await db.scalar(
        sa.select(Expense)
        .where(Expense.user_id == user.id, Expense.merchant == "BTS Ari")
        .order_by(sa.func.coalesce(Expense.spent_at, Expense.created_at))
        .limit(1)
    )
    open_trip = None
    if today_start is not None:
        open_trip = Trip(user_id=user.id, title="Out in Bangkok", start_expense_id=today_start.id)
        db.add(open_trip)

    await db.commit()
    if open_trip is not None:
        await seed_recommendations(db, user, open_trip)
    return user


def _google_review(author: str, rating: int, text: str, when: str) -> dict:
    """The shape Places API (New) returns, so the real code path reads it."""
    return {
        "authorAttribution": {"displayName": author},
        "rating": rating,
        "text": {"text": text},
        "relativePublishTimeDescription": when,
    }


async def seed_recommendations(db, user: User, trip: Trip, now: datetime | None = None) -> None:
    """A ready-made "what next?" set for the ongoing trip.

    Generating one for real needs OPENAI_API_KEY and GOOGLE_MAPS_API_KEY, which
    a fresh devcontainer has neither of, so the panel would only ever show its
    empty state. These rows are fabricated — `model` says "demo" so they are
    never mistaken for something a model produced.

    It is fresh for RECOMMENDATION_TTL_MINUTES like any other set; leave the
    container running past that and the panel goes back to offering the button,
    which then does need the keys. It also expires if the browser's timezone is
    far enough from the machine's that they disagree about which stop is the
    trip's latest — the panel then just offers to generate, same as any trip.
    """
    places: dict[str, Place] = {}
    for gid, name, address, lat, lng, types, rating, count, price, reviews in RECOMMENDABLE:
        place = await db.scalar(sa.select(Place).where(Place.google_place_id == gid))
        if place is None:
            place = Place(google_place_id=gid, name=name, formatted_address=address,
                          lat=lat, lng=lng, types=types)
            db.add(place)
        place.raw = {
            "id": gid,
            "displayName": {"text": name},
            "formattedAddress": address,
            "location": {"latitude": lat, "longitude": lng},
            "types": types,
            "rating": rating,
            "userRatingCount": count,
            "priceLevel": price,
            "currentOpeningHours": {"openNow": True},
            "googleMapsUri": f"https://maps.google.com/?cid={gid}",
            "reviews": [_google_review(*review) for review in reviews],
        }
        # Marks the details cache as warm, so opening a card costs no API call
        place.fetched_at = datetime.now(UTC)
        places[gid] = place
    await db.flush()

    moment = now or now_local()
    window = window_of(trip, now=moment)
    # A suggestion is anchored on the last stop you have actually reached, so
    # spinning the container up before the demo day's first stop (08:35 local)
    # leaves nothing to anchor on and the panel offers to generate instead.
    # `now` is injectable so tests do not depend on the hour they run at.
    anchor = await latest_visit_in(db, user, window, now=moment)
    if anchor is None:
        return

    # The "why" refers to the day the seeder just built — the flat white, the
    # ramen, the temples — so the demo reads like a real suggestion. It must
    # stay true whatever the anchor turns out to be, since that depends on the
    # time of day the container was started: no claims about how close anything
    # is, because the rendered distance is measured from the real anchor.
    written = {
        "demo-rec-1": ("dessert", "You had ramen for lunch and nothing sweet since — this is the "
                                  "mango sticky rice stall the old town queues for."),
        "demo-rec-2": ("coffee", "Your morning started with a flat white. This one is an iced "
                                 "one on the river, by the Tha Tien ferry."),
        "demo-rec-3": ("temple", "A four-baht ferry from Tha Tien, and best in the late "
                                 "afternoon light — you have been photographing temples today."),
        "demo-rec-4": ("night market", "You spent an evening at Jodd Fairs earlier in the trip; "
                                       "this is the local version, across the river."),
    }
    items = []
    for gid, (category, why) in written.items():
        place = places[gid]
        raw = place.raw or {}
        items.append({
            "google_place_id": gid,
            "name": place.name,
            "category": category,
            "why": why,
            "event": ("Sunset ferry runs until 9pm tonight" if gid == "demo-rec-3" else None),
            "address": place.formatted_address,
            "lat": place.lat,
            "lng": place.lng,
            "rating": raw.get("rating"),
            "user_rating_count": raw.get("userRatingCount"),
            "price_level": raw.get("priceLevel"),
            "open_now": True,
            "distance_m": round(
                haversine_m(anchor.lat, anchor.lng, place.lat, place.lng)
            ),
        })

    db.add(
        TripRecommendation(
            trip_id=trip.id,
            user_id=user.id,
            anchor_visit_id=anchor.id,
            status="ready",
            tz_offset_minutes=0,
            # Written from the anchor rather than hard-coded, so the heading
            # can't contradict the stop it was generated from
            moment=f"next, after {visit_label(anchor)}",
            items=items,
            model="demo",
        )
    )
    await db.commit()


async def main(reset: bool) -> int:
    async with SessionLocal() as db:
        existing = await _demo_user(db)
        if existing is not None:
            if not reset:
                print(f"demo account {DEMO_EMAIL} already present — nothing to do")
                return 0
            await purge(db, existing)
        await build(db)
    print(f"seeded {DEMO_EMAIL} (password: {DEMO_PASSWORD})")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset", action="store_true", help="delete the demo account and rebuild it"
    )
    sys.exit(asyncio.run(main(parser.parse_args().reset)))
