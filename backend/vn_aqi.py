"""Hourly VN_AQI for a single, quality-controlled automatic station in Vietnam.

Input maps UTC interval-end timestamps to verified one-hour means in µg/m³.
Callers must select one station before constructing the mapping.
"""
from bisect import bisect_right
from datetime import datetime, timedelta
from math import floor, isfinite
from numbers import Real

from backend.aqi import _aware

LEVELS = (0, 50, 100, 150, 200, 300, 400, 500)
LIMITS = {
    "pm25": (0, 25, 50, 80, 150, 250, 350, 500),
    "pm10": (0, 50, 150, 250, 350, 420, 500, 600),
    "co": (0, 10000, 30000, 45000, 60000, 90000, 120000, 150000),
    "no2": (0, 100, 200, 700, 1200, 2350, 3100, 3850),
    "so2": (0, 125, 350, 550, 800, 1600, 2100, 2630),
    "o3": (0, 160, 200, 300, 400, 800, 1000, 1200),
}
CATEGORIES = ("Tốt", "Trung bình", "Kém", "Xấu", "Rất xấu", "Nguy hại")


def valid(value):
    return isinstance(value, Real) and not isinstance(value, bool) and isfinite(value) and value >= 0


def nowcast(series):
    """Newest first, retaining empty positions in the 12-hour sequence."""
    if sum(valid(value) for value in series[:3]) < 2:
        return None
    samples = [(i, value) for i, value in enumerate(series) if valid(value)]
    maximum = max(value for _, value in samples)
    if maximum == 0:
        return 0.0
    weight = max(0.5, min(value for _, value in samples) / maximum)
    numerator = sum(value * weight ** i for i, value in samples)
    if weight == 0.5:
        # Section 2.2.1(a) defines a separate finite sum at w = 1/2.
        return 0.5 * numerator
    return numerator / sum(weight ** i for i, _ in samples)


def interpolate(value, limits):
    interval = bisect_right(limits, value) - 1
    if interval == len(limits) - 1:
        return 500
    fraction = (value - limits[interval]) / (limits[interval + 1] - limits[interval])
    return LEVELS[interval] + fraction * (LEVELS[interval + 1] - LEVELS[interval])


def hourly_vn_aqi(observations: dict[datetime, dict], valid_at, *, station_id, source_kind, qc_verified):
    end = _aware(valid_at)
    result = dict(standard="VN_AQI giờ", station_id=station_id, status="unavailable",
                  valid_at=end.isoformat() if end else None, value=None, dominant_pollutants=[])
    if (not station_id or source_kind != "station_observation" or qc_verified is not True
            or end is None or end.minute or end.second or end.microsecond):
        return result
    hours = [observations.get(end - timedelta(hours=i), {}) for i in range(12)]
    indices = {}
    for name, limits in LIMITS.items():
        if name in ("pm25", "pm10"):
            value = nowcast([row.get(name) for row in hours])
        else:
            value = hours[0].get(name)
        if valid(value):
            indices[name] = interpolate(value, limits)
    if not {"pm25", "pm10"}.intersection(indices):
        return result
    highest = max(indices.values())
    overall = floor(highest + 0.5)
    return dict(result, status="ok", value=overall,
                category=CATEGORIES[bisect_right((51, 101, 151, 201, 301), overall)],
                components={name: floor(score + 0.5) for name, score in indices.items()},
                dominant_pollutants=[name for name, score in indices.items() if score == highest])
