from datetime import UTC, datetime, timedelta

from app.models import Visit
from app.services.clustering import Point, group_into_visits, nearest_visit_id

BASE = datetime(2026, 8, 8, 9, 0, tzinfo=UTC)
GAP = timedelta(minutes=45)
DIST = 300.0

# ~111m per 0.001 degree latitude
HOME = (13.7563, 100.5018)
CAFE = (13.7570, 100.5020)  # <100m from HOME
OFFICE = (13.8000, 100.5500)  # several km away


def _point(i, minutes, coords=None):
    lat, lng = coords if coords else (None, None)
    return Point(id=i, ts=BASE + timedelta(minutes=minutes), lat=lat, lng=lng)


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

