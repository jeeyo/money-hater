"""The one frame every recorded moment is kept in: the local wall clock.

A photo's EXIF timestamp is a wall clock. 20:36 means 20:36 on whatever wall
the camera was looking at, and nothing in the file says which wall — an offset
tag is optional and a screenshot has none at all. A receipt prints the same
kind of time. Both are what the user remembers, and both are what has to come
back on screen.

So every column that says *when something happened to the user* holds that wall
clock, stored in a timestamptz column whose UTC tag carries no meaning:

    Image.taken_at          the shutter, as the camera's clock read it
    Expense.spent_at        the time printed on the receipt, or typed in
    Visit.started_at/ended_at   derived from the photos, so already in frame

Reading one back means rendering it exactly as written. Adding the viewer's
offset to a clock that is already local is what put a 20:36 dinner in Bangkok
at 03:36 the following morning, on the wrong day, under the wrong spend.

The columns that record *what the server did* — ``uploaded_at``,
``created_at``, ``analyzed_at`` — are true instants, and stay that way. The two
frames meet in exactly two places, both of them here: when a server timestamp
has to stand in for a moment that happened to the user (a photo with no EXIF
time is filed under when it was uploaded), and when "now" is compared against
one of the wall clocks above. Every caller of these two functions is one of
those; anywhere else, a stored moment is used as it is.

Why not store true instants and a zone per row? Because the zone would have to
be guessed for every photo that cannot state its own, and a library where some
photos were converted and some were not is worse than one where none are: two
shots minutes apart end up hours apart, splitting the stop they belong to and,
across midnight, landing on different days. That is not hypothetical — it
shipped once, and was reverted for exactly this. One frame, uniformly applied,
is the property worth having.
"""

from datetime import UTC, datetime, timedelta

# What the API accepts as a UTC offset: real zones run -12:00..+14:00.
MAX_OFFSET_MINUTES = 14 * 60


def to_local(moment: datetime, tz_offset_minutes: int) -> datetime:
    """A true instant as the wall clock someone at ``tz_offset_minutes`` reads.

    The result is tagged UTC like everything else in the frame — the tag is the
    storage convention, not a claim about the zone.
    """
    aware = moment if moment.tzinfo else moment.replace(tzinfo=UTC)
    return aware.astimezone(UTC) + timedelta(minutes=tz_offset_minutes)


def local_now(tz_offset_minutes: int, now: datetime | None = None) -> datetime:
    """The user's wall clock right now. ``now`` is injectable so tests can pin it."""
    return to_local(now or datetime.now(UTC), tz_offset_minutes)
