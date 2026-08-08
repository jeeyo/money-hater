from datetime import UTC, datetime, timedelta

from app.services.clustering import Point, group_into_visits

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

