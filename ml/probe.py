"""Inspect both hourly API contracts at the requested Da Nang coordinate."""
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import urlopen

import pandas as pd

AQ = dict.fromkeys(["pm2_5", "pm10", "carbon_monoxide", "nitrogen_dioxide",
                    "sulphur_dioxide", "ozone"], "μg/m³")
WEATHER = {"temperature_2m": "°C", "relative_humidity_2m": "%"}
TZ = "Asia/Ho_Chi_Minh"


def inspect(payload, fields, now):
    if payload["utc_offset_seconds"] != 7 * 3600:
        raise ValueError("Unexpected local time offset")
    hourly = payload["hourly"]
    times = pd.DatetimeIndex(hourly["time"]).tz_localize(TZ).tz_convert("UTC")
    if times.has_duplicates or not times.is_monotonic_increasing:
        raise ValueError("Invalid time axis")
    data = {}
    for name, expected in fields.items():
        unit = payload["hourly_units"][name].replace("µ", "μ")
        if unit != expected:
            raise ValueError(f"{name}: unexpected unit {unit}")
        values = pd.Series(hourly[name], index=times, dtype=float)
        valid = values.map(math.isfinite)
        if name in AQ:
            valid &= values >= 0
        if name == "relative_humidity_2m":
            valid &= values.between(0, 100)
        data[name] = values.where(valid)
    return pd.DataFrame(data).loc[lambda f: f.index <= now]


def main():
    report = {"requested": [16.0544, 108.2022], "kind": "atmospheric_model_estimate",
              "sources": {}}
    frames = []
    for endpoint, fields in [("https://air-quality-api.open-meteo.com/v1/air-quality", AQ),
                             ("https://api.open-meteo.com/v1/forecast", WEATHER)]:
        query = urlencode(dict(latitude=16.0544, longitude=108.2022, timezone=TZ,
                               hourly=",".join(fields), past_days=1, forecast_days=1))
        url = endpoint + "?" + query
        info = report["sources"][endpoint] = {"url": url}
        for attempt in range(2):
            try:
                with urlopen(url, timeout=15) as response:
                    payload = json.load(response)
                now = datetime.now(timezone.utc)
                frame = inspect(payload, fields, now)
                info.update(retrieved_at=now.isoformat(), units=payload["hourly_units"],
                            grid=[payload["latitude"], payload["longitude"]],
                            hours=len(frame), missing_or_invalid=frame.isna().sum().to_dict())
                frames.append(frame)
                break
            except (URLError, TimeoutError, OSError, ValueError, KeyError) as exc:
                if attempt == 1:
                    info["error"] = str(exc)
                else:
                    time.sleep(1)
    if len(frames) == 2:
        joined = frames[0].join(frames[1], how="inner").dropna()
        report["complete_common_hours"] = len(joined)
    path = Path("reports/danang_probe.json")
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(path)
    return 0 if report.get("complete_common_hours", 0) else 1


if __name__ == "__main__":
    raise SystemExit(main())
