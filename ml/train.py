"""Train direct hourly PM2.5 forecasters on Beijing station data."""
import argparse
import hashlib
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor

from ml.phase1 import LOCAL, TEST, VAL, features, partitions, read_archive, station_grid

SEED = 42


def dataset(raw, h):
    parts = []
    for station, rows in raw.groupby("station"):
        grid, _ = station_grid(rows)
        parts.append(features(grid, LOCAL).assign(y=grid.pm25.shift(-h), station=station))
    return pd.concat(parts).dropna().sort_index(kind="stable")


def metrics(y, p):
    delta = p - np.asarray(y)
    return dict(n=len(y), mae=abs(delta).mean(), rmse=np.sqrt(np.mean(delta**2)),
                r2=r2_score(y, p) if len(y) > 1 else None, bias=delta.mean())


def tune(x, y, h):
    results = []
    for start, end in [("2015-03-01", "2015-06-01"), ("2015-12-01", "2016-03-01")]:
        start, end = (pd.Timestamp(k, tz=LOCAL) for k in (start, end))
        target = x.index + pd.Timedelta(hours=h)
        fit = target < start
        check = (x.index >= start) & (target < end)
        for depth in (3, 6):
            for rate in (.03, .1):
                model = XGBRegressor(max_depth=depth, learning_rate=rate, tree_method="hist",
                                     n_estimators=1000, early_stopping_rounds=50, n_jobs=4,
                                     eval_metric="mae", random_state=SEED)
                model.fit(x[fit], y[fit], eval_set=[(x[check], y[check])], verbose=False)
                results.append(dict(start=str(start), horizon=h, depth=depth, rate=rate,
                                    rounds=model.best_iteration+1, mae=model.best_score))
    scores = pd.DataFrame(results).groupby(["depth","rate"])[["mae","rounds"]].mean()
    depth, rate = scores.mae.idxmin()
    return XGBRegressor(max_depth=int(depth), learning_rate=float(rate), tree_method="hist",
                        n_estimators=round(scores.loc[(depth,rate),"rounds"]),
                        n_jobs=4, random_state=SEED), results


def predict(model, x):
    return x.pm25.to_numpy() if model is None else np.maximum(0, model.predict(x))


def parameters(model):
    if model is None:
        return {}
    if hasattr(model, "steps"):
        return {name: parameters(step) for name, step in model.steps}
    return {key: None if isinstance(value, float) and np.isnan(value) else value
            for key, value in model.get_params(deep=False).items()}


def diagnostics(frame, p, h, threshold):
    local = (frame.index + pd.Timedelta(hours=h)).tz_convert(LOCAL)
    groups = dict(station=frame.station.values, hour=local.hour,
                  season=np.array(["DJF","MAM","JJA","SON"])[(local.month % 12)//3],
                  above_train_p95=frame.y.to_numpy() > threshold)
    output = []
    for name, values in groups.items():
        for value in np.unique(values):
            mask = values == value
            output.append(dict(horizon=h, group=name, value=value, **metrics(frame.y[mask], p[mask])))
    return output


def importance(model, frame, cols, h):
    x = frame[cols].copy()
    base = mean_absolute_error(frame.y, predict(model, x))
    # Shuffle ordered 24-sample blocks within each station, preserving within-block order.
    rng = np.random.default_rng(SEED)
    order = np.arange(len(frame))
    for pos in frame.groupby("station").indices.values():
        blocks = [pos[i:i+24] for i in range(0,len(pos),24)]
        order[pos] = np.concatenate([blocks[i] for i in rng.permutation(len(blocks))])
    rows = []
    for col in cols:
        x[col] = frame[col].to_numpy()[order]
        rows.append(dict(horizon=h, feature=col,
                         increase_mae=mean_absolute_error(frame.y, predict(model,x))-base))
        x[col] = frame[col].to_numpy()
    return rows


def run(archive, out):
    out.mkdir(parents=True, exist_ok=True)
    raw = read_archive(archive)
    scores, folds, groups, ranks = [], [], [], []
    for h in (1,3):
        data = dataset(raw, h)
        cols = list(data.drop(columns=["station","y"]))
        masks = partitions(data.index, h)
        train, val, test = (data.loc[masks[k]] for k in ("train","validation","test"))
        print(f"Horizon {h}: tuning XGBoost", flush=True)
        boosted, rows = tune(train[cols], train.y, h)
        folds.extend(rows)
        models = dict(persistence=None, ridge=make_pipeline(StandardScaler(), Ridge(alpha=1)),
                      forest=RandomForestRegressor(n_estimators=64, max_depth=16,
                          min_samples_leaf=6, max_samples=.6, n_jobs=4, random_state=SEED),
                      xgboost=boosted)
        validation = {}
        for name, model in models.items():
            if model is not None:
                model.fit(train[cols], train.y)
            result = metrics(val.y, predict(model,val[cols]))
            validation[name] = result["mae"]
            scores.append(dict(horizon=h, split="validation", model=name, **result))
        winner = min(validation, key=validation.get)
        print(f"Horizon {h}: selected {winner}", flush=True)
        model = models[winner]
        joblib.dump(model, out/f"model_{h}h.joblib", compress=3)
        info = dict(version="beijing-v1", horizon=h, selected=winner, features=cols,
                    timezone=LOCAL, seed=SEED, validation_start=str(VAL), test_start=str(TEST),
                    units="pollutants ug/m3; temp_c degC; target ug/m3",
                    verified_region="Beijing", sklearn=sklearn.__version__, xgboost=xgboost.__version__,
                    sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
                    parameters=parameters(model),
                    feature_pipeline="ml.phase1.features", missing_policy="require complete input")
        (out/f"manifest_{h}h.json").write_text(json.dumps(info, indent=2, allow_nan=False),
                                               encoding="utf8")
        for name, candidate in models.items():
            p = predict(candidate, test[cols])
            scores.append(dict(horizon=h, split="test", model=name, **metrics(test.y,p)))
            if name == winner:
                groups.extend(diagnostics(test,p,h,train.y.quantile(.95)))
        ranks.extend(importance(model,val,cols,h))
        for name, records in [("metrics",scores), ("folds",folds), ("test_groups",groups),
                              ("validation_importance",ranks)]:
            pd.DataFrame(records).to_csv(out/f"{name}.csv",index=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, default=Path("data/raw/beijing.zip"))
    parser.add_argument("--out", type=Path, default=Path("reports/phase2"))
    args = parser.parse_args()
    run(args.archive, args.out)
