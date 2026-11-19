import json
import tempfile
import unittest
from pathlib import Path

import joblib
import pandas as pd

from ml.inference import forecast
from ml.phase1 import FIELDS, LOCAL, features
from ml.train import dataset


class ForecastTests(unittest.TestCase):
    def setUp(self):
        self.index = pd.date_range("2015-01-01", periods=9, freq="h", tz=LOCAL)
        self.series = pd.DataFrame({name: range(9) for name in FIELDS.values()}, index=self.index)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.path = Path(tmp.name)
        info = dict(verified_region="Beijing", timezone=LOCAL, version="test", selected="persistence",
                    features=list(features(self.series, LOCAL)))
        (self.path/"manifest_1h.json").write_text(json.dumps(info))
        joblib.dump(None, self.path/"model_1h.joblib")

    def call(self, series, region="Beijing"):
        return forecast(series, self.index[6], 1, region=region, artifact_dir=self.path)

    def test_inference_uses_only_past(self):
        result = self.call(self.series)
        self.assertEqual(result["pm25"], 6)
        self.assertEqual(result["trend"], "stable")
        self.assertEqual(result, self.call(self.series.iloc[:7]))

    def test_incomplete_history_and_unvalidated_region(self):
        self.assertEqual(self.call(self.series.iloc[1:])["status"], "insufficient_data")
        self.assertEqual(self.call(self.series.drop(columns="co"))["status"], "insufficient_data")
        self.assertEqual(self.call(self.series,"Da Nang")["status"], "region_not_validated")

    def test_station_isolation_and_labels(self):
        raw = self.series.rename(columns={v:k for k,v in FIELDS.items()}).reset_index(drop=True)
        raw = raw.assign(year=2015, month=1, day=1, hour=range(9))
        second = raw.copy()
        second["PM2.5"] += 100
        samples = dataset(pd.concat([raw.assign(station="A"), second.assign(station="B")]), 1)
        self.assertEqual(samples.groupby("station").size().to_dict(), {"A":2,"B":2})
        self.assertEqual(samples[samples.station=="B"].pm25_lag_6.tolist(), [100,101])
        self.assertEqual(samples[samples.station=="A"].y.tolist(), [7,8])
