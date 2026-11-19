"""Interpret the hourly US AQI published by Open-Meteo for a model grid cell."""
from datetime import datetime, timedelta, timezone
from math import floor, inf, isfinite
from numbers import Real

AIRNOW = "https://www.airnow.gov/aqi/aqi-basics/"
SOURCE = "Open-Meteo / CAMS"
SOURCE_URL = "https://open-meteo.com/en/docs/air-quality-api"
MAX_CURRENT_AGE = timedelta(hours=3)
BANDS = (
    (50, "Tốt", "Có thể sinh hoạt ngoài trời như thường lệ."),
    (100, "Trung bình", "Người đặc biệt nhạy cảm có thể giảm thời gian gắng sức ngoài trời."),
    (150, "Kém cho nhóm nhạy cảm", "Nhóm nhạy cảm nên giảm thời gian hoặc cường độ vận động ngoài trời."),
    (200, "Có hại cho sức khỏe", "Nhóm nhạy cảm nên tránh vận động mạnh hoặc kéo dài ngoài trời. Mọi người nên giảm gắng sức ngoài trời."),
    (300, "Rất có hại cho sức khỏe", "Nhóm nhạy cảm nên chuyển hoạt động thể lực vào trong nhà. Mọi người nên tránh gắng sức kéo dài ngoài trời."),
    (inf, "Nguy hại", "Mọi người nên hoãn hoạt động thể lực ngoài trời và theo dõi thông báo của cơ quan địa phương."),
)
COMPONENT_NAMES = {
    "us_aqi_pm2_5": "PM2.5", "us_aqi_pm10": "PM10", "us_aqi_ozone": "O₃",
    "us_aqi_nitrogen_dioxide": "NO₂", "us_aqi_sulphur_dioxide": "SO₂",
    "us_aqi_carbon_monoxide": "CO",
}


def _valid_value(value):
    return isinstance(value, Real) and not isinstance(value, bool) and isfinite(value) and value >= 0


def _dominant(components, index):
    if components is None or any(not _valid_value(components.get(k)) for k in COMPONENT_NAMES):
        return None
    highest = max(components[k] for k in COMPONENT_NAMES)
    if floor(highest + 0.5) != index:
        return None
    return ", ".join(name for key, name in COMPONENT_NAMES.items() if components[key] == highest)


def _aware(value):
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if isinstance(value, datetime) and value.utcoffset() is not None:
        return value.astimezone(timezone.utc)
    return None


def assess_us_aqi(value, valid_at, *, now=None, components=None):
    """Accept the source's aggregate us_aqi field in USAQI units after unit validation."""
    timestamp = _aware(valid_at)
    clock = datetime.now(timezone.utc) if now is None else _aware(now)
    result = dict(status="unavailable", value=None, standard="US AQI", source=SOURCE,
                  kind="atmospheric_model_estimate", source_url=SOURCE_URL, guidance_url=AIRNOW,
                  valid_at=timestamp.isoformat() if timestamp else None,
                  category=None, advice=None, dominant_pollutant=None)
    if timestamp is None or clock is None or timestamp > clock:
        return result
    if not _valid_value(value):
        return result
    index = floor(value + 0.5)
    _, category, advice = next(band for band in BANDS if index <= band[0])
    if clock - timestamp > MAX_CURRENT_AGE:
        return dict(result, status="stale", value=index, category=category)
    return dict(result, status="ok", value=index, category=category, advice=advice,
                dominant_pollutant=_dominant(components, index))
