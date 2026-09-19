"""The basemap and the day palette the exported map draws with.

Both are ports of the frontend's `lib/basemap.ts` and `lib/dayColors.ts`, so an
exported page and the app's own trip map read the same. `test_export.py` checks
the two copies against each other rather than trusting that they stayed in step.
"""

# Raster OSM tiles, no API key, no server of ours: a page holding this style
# needs nothing but the viewer's internet.
OSM_STYLE = {
    "version": 8,
    "sources": {
        "osm": {
            "type": "raster",
            "tiles": ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            "tileSize": 256,
            "attribution": "© OpenStreetMap contributors",
        }
    },
    "layers": [{"id": "osm", "type": "raster", "source": "osm"}],
}

# Dim and desaturate the light raster so it sits under a dark page. The tile
# layer only, so the day routes keep their exact colours.
DARK_BASEMAP_PAINT = {
    "raster-brightness-max": 0.3,
    "raster-saturation": -0.45,
    "raster-contrast": -0.1,
}

# Days are categorical *and* ordered. Up to eight get distinct hues in a fixed
# order — never cycled, so day 3 is the same colour whatever the trip's length —
# and longer trips fall back to a light-to-dark ramp, which reads as early-to-late
# and scales to any number of days.
DAY_HUES = (
    "#2a78d6",  # blue
    "#eb6834",  # orange
    "#1baf7a",  # aqua
    "#eda100",  # yellow
    "#e87ba4",  # magenta
    "#008300",  # green
    "#4a3aa7",  # violet
    "#e34948",  # red
)

RAMP_FROM = (157, 199, 245)  # light blue
RAMP_TO = (16, 60, 112)  # deep blue

# In MapLibre's line-dasharray units (multiples of the line width). Lines carry a
# pattern as well as a colour, so two routes stay tellable apart on a busy
# basemap — and for anyone who cannot separate the hues at all.
DAY_DASHES = (
    [1, 0],  # solid
    [3, 1.5],
    [1, 1.5],
    [5, 2, 1, 2],
    [4, 2],
    [1, 1],
    [6, 2],
    [2, 1, 0.5, 1],
)


def day_color(index: int, total: int) -> str:
    if total <= len(DAY_HUES):
        return DAY_HUES[index]
    position = 0.0 if total <= 1 else index / (total - 1)
    channels = (round(a + (b - a) * position) for a, b in zip(RAMP_FROM, RAMP_TO, strict=True))
    red, green, blue = channels
    return f"rgb({red}, {green}, {blue})"


def day_dash(index: int) -> list[float]:
    return DAY_DASHES[index % len(DAY_DASHES)]
