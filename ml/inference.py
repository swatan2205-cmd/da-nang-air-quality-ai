"""Offline inference on one normalized Beijing observation series."""
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from ml.phase1 import FIELDS, POLLUTANTS, features
from ml.train import predict


def forecast(history, origin, horizon, *, region, artifact_dir=Path("reports/phase2")):
    """Input is one station in standard units, indexed by timezone-aware valid time."""
    if horizon not in (1, 3):
        raise ValueError("Supported horizons: 1, 3 hours")
    manifest = json.loads((artifact_dir/f"manifest_{horizon}h.json").read_text(encoding="utf8"))
    if region != manifest["verified_region"]:
        return {"status": "region_not_validated"}
    origin = pd.Timestamp(origin)
    if origin.tz is None or not isinstance(history.index, pd.DatetimeIndex) or history.index.tz is None:
        raise ValueError("Timezone-aware timestamps required")
    origin = origin.tz_convert("UTC")
    if origin != origin.floor("h") or history.index.has_duplicates:
        raise ValueError("Require hourly origin and unique timestamps per station")
    required = list(FIELDS.values())
    if set(required) - set(history.columns):
        return {"status": "insufficient_data"}
    hours = pd.date_range(end=origin, periods=7, freq="h")
    grid = history[required].reindex(hours).apply(pd.to_numeric, errors="coerce")
    grid = grid.replace([np.inf, -np.inf], np.nan)
    grid[POLLUTANTS] = grid[POLLUTANTS].mask(grid[POLLUTANTS] < 0)
    x = features(grid, manifest["timezone"]).iloc[[-1]][manifest["features"]]
    if x.isna().any().any():
        return {"status": "insufficient_data"}
    model = joblib.load(artifact_dir/f"model_{horizon}h.joblib")
    result = float(predict(model, x)[0])
    delta = result - float(x.pm25.iloc[0])
    # A descriptive reporting tolerance, not a health or statistical threshold.
    trend = "stable" if abs(delta) <= 1 else ("rising" if delta > 0 else "falling")
    return dict(status="ok", kind="ml_prediction", model=manifest["selected"],
                version=manifest["version"], origin_utc=origin.isoformat(), horizon_h=horizon,
                valid_at_utc=(origin+pd.Timedelta(hours=horizon)).isoformat(),
                pm25=result, unit="µg/m³", change=delta, trend=trend)
