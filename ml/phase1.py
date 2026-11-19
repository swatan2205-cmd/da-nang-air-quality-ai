"""Profile the original Beijing archive. Run from the project root."""
import argparse
import io
import json
from pathlib import Path
from zipfile import ZipFile

import numpy as np
import pandas as pd


FIELDS = dict(zip(
    ["PM2.5", "PM10", "CO", "NO2", "SO2", "O3", "TEMP"],
    ["pm25", "pm10", "co", "no2", "so2", "o3", "temp_c"],
))
POLLUTANTS = list(FIELDS.values())[:6]
LOCAL = "Asia/Shanghai"
VAL = pd.Timestamp("2016-03-01", tz=LOCAL)
TEST = pd.Timestamp("2016-09-01", tz=LOCAL)


def read_archive(path):
    with ZipFile(path) as archive:
        files = sorted(n for n in archive.namelist()
                       if Path(n).name.startswith("PRSA_Data_") and n.endswith(".csv"))
        if files:
            return pd.concat([pd.read_csv(archive.open(n)) for n in files], ignore_index=True)
        nested = [n for n in archive.namelist() if Path(n).name.startswith("PRSA2017")
                  and n.endswith(".zip")]
        if len(nested) != 1:
            raise ValueError("Expected the original PRSA station CSVs or UCI wrapper ZIP")
        return read_archive(io.BytesIO(archive.read(nested[0])))


def station_grid(raw):
    times = pd.to_datetime(raw[["year", "month", "day", "hour"]]).dt.tz_localize(LOCAL)
    frame = raw[list(FIELDS)].rename(columns=FIELDS).apply(pd.to_numeric, errors="coerce")
    frame.index = pd.DatetimeIndex(times).tz_convert("UTC")
    if frame.index.has_duplicates:
        raise ValueError(f"Duplicate timestamps at {raw.station.iloc[0]}")
    frame = frame.replace([np.inf, -np.inf], np.nan).sort_index().asfreq("h")
    negative = frame[POLLUTANTS] < 0
    frame[POLLUTANTS] = frame[POLLUTANTS].mask(negative)
    return frame, negative.sum().to_dict()


def features(frame, timezone):
    x = frame.copy()
    for lag in (1, 3, 6):
        x[f"pm25_lag_{lag}"] = frame.pm25.shift(lag)
    for window in (3, 6):
        x[f"pm25_mean_{window}"] = frame.pm25.rolling(window).mean()
    local = x.index.tz_convert(timezone)
    for name, values, period in [("hour", local.hour, 24), ("month", local.month - 1, 12)]:
        angle = 2 * np.pi * values / period
        x[name + "_sin"] = np.sin(angle)
        x[name + "_cos"] = np.cos(angle)
    return x


def partitions(index, horizon):
    target = index + pd.Timedelta(hours=horizon)
    return {"train": target < VAL, "validation": (index >= VAL) & (target < TEST),
            "test": index >= TEST}


def profile(raw, out):
    out.mkdir(parents=True, exist_ok=True)
    if raw.station.isna().any():
        raise ValueError("Missing station key")
    raw.isna().groupby(raw.station).sum().to_csv(out / "missing_by_station.csv")
    parts, counts, coverage = [], [], []
    for station, rows in raw.groupby("station"):
        frame, negative = station_grid(rows)
        coverage.append(dict(station=station, rows=len(rows), gap_hours=len(frame)-len(rows),
                             first_utc=str(frame.index.min()), last_utc=str(frame.index.max()),
                             **{f"negative_{k}": v for k, v in negative.items()}))
        x_ok = features(frame, LOCAL).notna().all(axis=1)
        parts.append(frame.loc[frame.index < VAL].assign(station=station))
        for h in (1, 3):
            eligible = x_ok & frame.pm25.shift(-h).notna()
            for split, mask in partitions(frame.index, h).items():
                counts.append(dict(station=station, horizon=h, split=split,
                                   candidates=int(mask.sum()), eligible=int((eligible & mask).sum())))
    train = pd.concat(parts)
    train.describe(percentiles=[.01,.25,.5,.75,.95,.99]).T.to_csv(out / "train_distribution.csv")
    train.drop(columns="station").corr().to_csv(out / "train_correlation.csv")
    train.groupby("station").pm25.describe().to_csv(out / "train_pm25_by_station.csv")
    pd.DataFrame(coverage).to_csv(out / "coverage.csv", index=False)
    pd.DataFrame(counts).to_csv(out / "eligibility.csv", index=False)
    summary = dict(rows=len(raw), stations=raw.station.nunique(), columns=list(raw.columns),
                   missing=raw.isna().sum().to_dict())
    (out / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf8")
    print(f"{len(raw):,} rows, {raw.station.nunique()} stations -> {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", type=Path)
    parser.add_argument("--out", type=Path, default=Path("reports/beijing"))
    args = parser.parse_args()
    profile(read_archive(args.archive), args.out)
