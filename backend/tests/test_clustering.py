from datetime import UTC, datetime, timedelta

from app.models import Visit
from app.services.clustering import Point, dominant_place, group_into_visits, nearest_visit_id

BASE = datetime(2026, 8, 8, 9, 0, tzinfo=UTC)
GAP = timedelta(minutes=45)
DIST = 300.0

# ~111m per 0.001 degree latitude
HOME = (13.7563, 100.5018)
CAFE = (13.7570, 100.5020)  # <100m from HOME
OFFICE = (13.8000, 100.5500)  # several km away


def _point(i, minutes, coords=None, place=None, pinned=False):
    lat, lng = coords if coords else (None, None)
    return Point(
        id=i,
        ts=BASE + timedelta(minutes=minutes),
        lat=lat,
        lng=lng,
        place_id=place,
        place_pinned=pinned,
    )


def test_close_in_time_and_space_is_one_visit():
    points = [_point(1, 0, HOME), _point(2, 10, CAFE), _point(3, 20, HOME)]
    groups = group_into_visits(points, GAP, DIST)
    assert [len(g) for g in groups] == [3]


def test_time_gap_splits_visits():
    points = [_point(1, 0, HOME), _point(2, 120, HOME)]
    groups = group_into_visits(points, GAP, DIST)
    assert [len(g) for g in groups] == [1, 1]


def test_distance_splits_visits():
    points = [_point(1, 0, HOME), _point(2, 10, OFFICE)]
    groups = group_into_visits(points, GAP, DIST)
    assert [len(g) for g in groups] == [1, 1]


def test_gps_less_image_joins_nearest_in_time():
    points = [_point(1, 0, HOME), _point(2, 5), _point(3, 10, HOME)]
    groups = group_into_visits(points, GAP, DIST)
    assert [len(g) for g in groups] == [3]


def test_unsorted_input_is_sorted():
    points = [_point(2, 120, HOME), _point(1, 0, HOME)]
    groups = group_into_visits(points, GAP, DIST)
    assert [g[0].id for g in groups] == [1, 2]


LUCKIN, GUNKEE = 1, 2


def test_two_places_the_user_picked_are_two_visits():
    """The bug: two receipts from neighbouring shops on the same street.

    Both were photographed within the gap and their addresses are ~200m apart,
    well inside the distance threshold, so nothing but the places themselves
    could tell the coffee from the claypot. They landed in one stop, under
    whichever name happened to be counted first.
    """
    points = [
        _point(1, 0, HOME, place=LUCKIN, pinned=True),
        _point(2, 34, CAFE, place=GUNKEE, pinned=True),
    ]
    groups = group_into_visits(points, GAP, DIST)
    assert [[p.id for p in g] for g in groups] == [[1], [2]]


def test_the_same_picked_place_holds_a_visit_together():
    """The other half of the same answer: a fix that drifts is still one stop."""
    points = [
        _point(1, 0, HOME, place=LUCKIN, pinned=True),
        _point(2, 10, OFFICE, place=LUCKIN, pinned=True),
    ]
    groups = group_into_visits(points, GAP, DIST)
    assert [len(g) for g in groups] == [2]


def test_a_picked_place_still_yields_to_the_clock():
    """Being the same place does not make two meals a day apart one stop."""
    points = [
        _point(1, 0, HOME, place=LUCKIN, pinned=True),
        _point(2, 600, HOME, place=LUCKIN, pinned=True),
    ]
    groups = group_into_visits(points, GAP, DIST)
    assert [len(g) for g in groups] == [1, 1]


def test_reverse_geocoded_places_do_not_split_a_visit():
    """They are the nearest match to a fix, not an answer.

    An afternoon of walking resolves to a different shopfront every few steps;
    letting that split stops would cut the walk into a stop per photo.
    """
    points = [
        _point(1, 0, HOME, place=LUCKIN),
        _point(2, 10, CAFE, place=GUNKEE),
    ]
    groups = group_into_visits(points, GAP, DIST)
    assert [len(g) for g in groups] == [2]


def test_a_photo_with_no_place_of_its_own_joins_either_way():
    """The food photo between the two receipts has nothing to disagree with."""
    points = [
        _point(1, 0, HOME, place=LUCKIN, pinned=True),
        _point(2, 5, CAFE),
        _point(3, 34, CAFE, place=GUNKEE, pinned=True),
    ]
    groups = group_into_visits(points, GAP, DIST)
    assert [[p.id for p in g] for g in groups] == [[1, 2], [3]]


def test_a_picked_place_names_a_stop_over_the_guesses_in_it():
    """One answer beats three nearest-matches, not the other way round."""
    assert dominant_place([(LUCKIN, False), (LUCKIN, False), (GUNKEE, True)]) == GUNKEE


def test_with_nothing_picked_the_commonest_guess_names_the_stop():
    assert dominant_place([(LUCKIN, False), (GUNKEE, False), (GUNKEE, False)]) == GUNKEE


def test_a_stop_of_photos_with_no_places_has_no_name():
    assert dominant_place([(None, False), (None, True)]) is None


def _visit(i, from_minutes, to_minutes):
    return Visit(
        id=i,
        started_at=BASE + timedelta(minutes=from_minutes),
        ended_at=BASE + timedelta(minutes=to_minutes),
    )


def _at(minutes):
    return BASE + timedelta(minutes=minutes)


def test_a_photo_taken_during_a_stop_belongs_to_it():
    visits = [_visit(1, 0, 30), _visit(2, 120, 150)]
    assert nearest_visit_id(_at(15), visits, GAP) == 1


def test_a_photo_just_after_a_stop_belongs_to_it():
    """The receipt comes out minutes after the last photo of the meal."""
    visits = [_visit(1, 0, 30), _visit(2, 120, 150)]
    assert nearest_visit_id(_at(35), visits, GAP) == 1


def test_the_nearer_stop_wins():
    visits = [_visit(1, 0, 30), _visit(2, 60, 90)]
    assert nearest_visit_id(_at(55), visits, GAP) == 2


def test_beyond_the_gap_is_no_stop_at_all():
    visits = [_visit(1, 0, 30)]
    assert nearest_visit_id(_at(30) + GAP + timedelta(minutes=1), visits, GAP) is None


def test_with_no_stops_there_is_nothing_to_join():
    assert nearest_visit_id(_at(0), [], GAP) is None


def test_an_equal_distance_goes_to_the_earlier_stop():
    """Otherwise the answer depends on the order the rows came back in."""
    visits = [_visit(2, 60, 90), _visit(1, 0, 30)]
    assert nearest_visit_id(_at(45), visits, GAP) == 1

