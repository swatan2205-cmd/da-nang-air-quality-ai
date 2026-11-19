"""Open-Meteo adapters. Pollutants, provider AQI and weather retain their units."""
import logging
import math
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx

LOG = logging.getLogger(__name__)
UTC = timezone.utc
LOCAL = ZoneInfo("Asia/Ho_Chi_Minh")
POINT = {"id": "danang-grid", "name": "Điểm tham chiếu Đà Nẵng",
         "latitude": 16.0544, "longitude": 108.2022, "kind": "model_grid"}
AIR = dict.fromkeys(("pm2_5", "pm10", "carbon_monoxide", "nitrogen_dioxide",
                     "sulphur_dioxide", "ozone"), "μg/m³")
AIR.update({f"us_aqi_{name}": "USAQI" for name in list(AIR)})
AIR["us_aqi"] = "USAQI"
WEATHER = {"temperature_2m": "°C", "relative_humidity_2m": "%"}
SOURCES = {"air": ("https://air-quality-api.open-meteo.com/v1/air-quality", AIR),
           "weather": ("https://api.open-meteo.com/v1/forecast", WEATHER)}


def normalized(source, payload, fetched):
    _, units = SOURCES[source]
    if payload.get("utc_offset_seconds") != 25200:
        raise ValueError("Unexpected UTC offset")
    hourly = payload["hourly"]
    times = hourly["time"]
    for key, unit in units.items():
        actual = payload["hourly_units"].get(key, "").replace("µ", "μ")
        if actual != unit or len(hourly[key]) != len(times):
            raise ValueError(f"Invalid unit or array length for {key}")
    grid_lat, grid_lon = float(payload["latitude"]), float(payload["longitude"])
    if not (-90 <= grid_lat <= 90 and -180 <= grid_lon <= 180):
        raise ValueError("Invalid grid coordinate")
    previous = None
    rows = []
    for idx, stamp in enumerate(times):
        local = datetime.fromisoformat(stamp)
        if local.tzinfo or local.minute or local.second or local.microsecond:
            raise ValueError("Expected local hourly timestamps")
        instant = local.replace(tzinfo=LOCAL).astimezone(UTC)
        if previous and instant <= previous:
            raise ValueError("Repeated or unordered hourly timestamps")
        previous = instant
        if instant > fetched:
            continue
        values, flags = {}, {}
        for key in units:
            value = hourly[key][idx]
            if value is None:
                flags[key] = "missing"
            elif (type(value) not in (float, int) or not math.isfinite(value)
                  or (key in AIR and value < 0)
                  or (key == "relative_humidity_2m" and not 0 <= value <= 100)):
                flags[key] = "invalid"
            values[key] = None if key in flags else value
        if len(flags) < len(values):
            rows.append(dict(source_id=source, location_id=POINT["id"], valid_at=instant,
                             retrieved_at=fetched, grid_lat=grid_lat, grid_lon=grid_lon,
                             values_json=values, quality_flags=flags))
    if not rows:
        raise ValueError("No usable past or current hour")
    return rows


def download(source, days=7):
    url, units = SOURCES[source]
    params = {"latitude": POINT["latitude"], "longitude": POINT["longitude"],
              "timezone": LOCAL.key, "hourly": ",".join(units), "past_days": days,
              "forecast_days": 1}
    if source == "air":
        params["domains"] = "cams_global"
    with httpx.Client(timeout=httpx.Timeout(18, connect=8)) as client:
        for attempt in range(3):
            try:
                response = client.get(url, params=params)
                response.raise_for_status()
                return normalized(source, response.json(), datetime.now(UTC))
            except (httpx.TimeoutException, httpx.NetworkError, httpx.HTTPStatusError) as exc:
                if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code < 500 and exc.response.status_code != 429:
                    raise
                if attempt == 2:
                    raise
                time.sleep(2**attempt)
