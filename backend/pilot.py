"""Portable Da Nang model that estimates future values of the CAMS grid series."""
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

LOCAL = ZoneInfo("Asia/Ho_Chi_Minh")
FEATURES = ["pm25", "pm25_lag_1", "pm25_lag_3", "pm25_lag_6",
            "pm25_mean_3", "pm25_mean_6", "hour_sin", "hour_cos"]
MODEL_PATH = Path(__file__).resolve().parents[1] / "reports/danang-pilot/model.json"


def vector(window, origin):
    """Seven PM2.5 values in chronological order, verified at exact hourly offsets."""
    if len(window) != 7 or any(type(v) not in (int, float) or not math.isfinite(v) or v < 0 for v in window):
        return None
    angle = 2 * math.pi * origin.astimezone(LOCAL).hour / 24
    return [window[-1], window[-2], window[-4], window[0], sum(window[-3:])/3,
            sum(window[-6:])/6, math.sin(angle), math.cos(angle)]


def load_model():
    model = json.loads(MODEL_PATH.read_text(encoding="utf8"))
    if model["features"] != FEATURES:
        raise ValueError("Unexpected pilot feature order")
    return model


def predict_hours(rows, now=None):
    artifact = load_model()
    origin = (now or datetime.now(timezone.utc)).astimezone(timezone.utc).replace(minute=0,second=0,microsecond=0)
    by_hour = {r["time"]:r.get("pm2_5") for r in rows if r["time"] <= origin}
    result = dict(status="insufficient_data", kind="experimental_ml_forecast",
                  validation="cams_estimates_only", model_version=artifact["version"],
                  origin_utc=None, current_pm25=None, unit="µg/m³", predictions=[])
    if by_hour and max(by_hour) < origin:
        result["status"] = "stale"
        return result
    x = vector([by_hour.get(origin-timedelta(hours=i)) for i in range(6,-1,-1)], origin)
    if x is None:
        return result
    result.update(status="experimental", origin_utc=origin.isoformat(), current_pm25=x[0])
    for h in (1,3):
        model=artifact["models"][str(h)]
        value=max(0.0,model["intercept"]+sum(a*b for a,b in zip(x,model["coefficients"])))
        delta=value-x[0]
        result["predictions"].append(dict(horizon_h=h, model=model["name"], pm25=value,
            delta=delta, change=delta, trend="stable" if abs(delta)<=1 else "rising" if delta>0 else "falling",
            valid_at_utc=(origin+timedelta(hours=h)).isoformat()))
    return result
