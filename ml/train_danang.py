"""Backtest direct Ridge and persistence forecasts against archived CAMS Global estimates."""
import argparse
import hashlib
import json
from datetime import datetime,timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from backend.pilot import FEATURES, LOCAL, vector

OUT = Path("reports/danang-pilot")
ARCHIVE = Path("data/raw/danang-cams-2024-2025.json")
URL = "https://air-quality-api.open-meteo.com/v1/air-quality?" + urlencode(dict(
    latitude=16.0544,longitude=108.2022,timezone=LOCAL.key,domains="cams_global",
    hourly="pm2_5",start_date="2024-01-01",end_date="2025-12-31"))
VAL = pd.Timestamp("2025-01-01",tz=LOCAL)
TEST = pd.Timestamp("2025-07-01",tz=LOCAL)


def evaluate(y,p):
    e=p-y
    return dict(n=len(y),mae=float(np.mean(np.abs(e))),rmse=float(np.sqrt(np.mean(e**2))),
                bias=float(np.mean(e)),r2=float(1-np.sum(e**2)/np.sum((y-y.mean())**2)))


def run(archive, out):
    if not archive.exists():
        archive.parent.mkdir(parents=True,exist_ok=True)
        with urlopen(URL,timeout=60) as response:
            raw=response.read()
        json.loads(raw)
        archive.write_bytes(raw)
    raw=archive.read_bytes()
    p=json.loads(raw)
    if p["hourly_units"]["pm2_5"].replace("µ","μ")!="μg/m³" or p["utc_offset_seconds"]!=25200:
        raise ValueError("Unexpected units or timezone")
    series=pd.Series(p["hourly"]["pm2_5"],index=pd.DatetimeIndex(p["hourly"]["time"]).tz_localize(LOCAL))
    if series.index.has_duplicates or not series.index.is_monotonic_increasing:
        raise ValueError("Invalid timestamps")
    grid=pd.date_range("2024-01-01","2026-01-01",freq="h",inclusive="left",tz=LOCAL)
    series=series.reindex(grid)
    series=series.where(np.isfinite(series)&(series>=0))
    vals=series.tolist()
    x=pd.DataFrame([vector(vals[i-6:i+1],t) or [np.nan]*len(FEATURES)
                    for i,t in enumerate(grid)], index=grid, columns=FEATURES)
    artifact=dict(version="danang-cams-ridge-v1",features=FEATURES,unit="µg/m³",
        target="CAMS Global PM2.5 estimates",timezone=LOCAL.key,models={},source_url=URL,
        issued_at=datetime.now(timezone.utc).isoformat(),source_sha256=hashlib.sha256(raw).hexdigest(),
        requested=[16.0544,108.2022],grid=[p["latitude"],p["longitude"]],
        start="2024-01-01",validation_start="2025-01-01",test_start="2025-07-01",end="2025-12-31",
        total_hours=len(grid),valid_pm25=int(series.count()),validation="cams_estimates_only")
    metrics=[]
    for h in (1,3):
        frame=x.assign(y=series.shift(-h)).dropna()
        target=frame.index+pd.Timedelta(hours=h)
        train=frame[target<VAL]
        val=frame[(frame.index>=VAL)&(target<TEST)]
        test=frame[frame.index>=TEST]
        scaler=StandardScaler().fit(train[FEATURES])
        candidates=[dict(name="persistence",alpha=None,intercept=0.0,coefficients=[1.0]+[0.0]*7)]
        for alpha in (.01,1.,100.):
            m=Ridge(alpha=alpha).fit(scaler.transform(train[FEATURES]),train.y)
            weights=m.coef_/scaler.scale_
            candidates.append(dict(name="ridge",alpha=alpha,intercept=float(m.intercept_-weights@scaler.mean_),
                                   coefficients=weights.tolist()))
        def predict(m,part):
            return np.maximum(0, m["intercept"]+part[FEATURES].to_numpy()@m["coefficients"])
        def score(m,part):
            return evaluate(part.y.to_numpy(),predict(m,part))
        for candidate in candidates:
            candidate["validation_metrics"]=score(candidate,val)
            metrics.append(dict(horizon_h=h,model=candidate["name"],alpha=candidate["alpha"],split="validation",
                                **candidate["validation_metrics"]))
        ridge=min(candidates[1:],key=lambda c:c["validation_metrics"]["mae"])
        # Freeze the choice before evaluating any test targets.
        selected=min((candidates[0],ridge),key=lambda c:c["validation_metrics"]["mae"])
        for c in (candidates[0],ridge):
            c["test_metrics"]=score(c,test)
            metrics.append(dict(horizon_h=h,model=c["name"],alpha=c["alpha"],split="test",**c["test_metrics"]))
        artifact["models"][str(h)]=dict(**selected,train_n=len(train),baseline=candidates[0]["test_metrics"])
    out.mkdir(parents=True,exist_ok=True)
    (out/"model.json").write_text(json.dumps(artifact,indent=2,ensure_ascii=False,allow_nan=False),encoding="utf8")
    pd.DataFrame(metrics).to_csv(out/"metrics.csv",index=False)
    print(pd.DataFrame(metrics).to_string(index=False))


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--archive",type=Path,default=ARCHIVE)
    parser.add_argument("--out",type=Path,default=OUT)
    args=parser.parse_args()
    run(args.archive,args.out)
