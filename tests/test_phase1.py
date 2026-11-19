import unittest

import pandas as pd

from ml.phase1 import FIELDS, LOCAL, VAL, features, partitions, station_grid
from ml.probe import inspect


class DataTests(unittest.TestCase):
    def rows(self):
        hours = [0, 1, 2, 4, 5, 6, 7, 8]
        return pd.DataFrame(dict(year=2015, month=1, day=1, station="fixture",
                                 hour=hours, **{k: hours for k in FIELDS}))

    def test_gap_and_negative(self):
        raw = self.rows()
        raw.loc[0, "CO"] = -1
        frame, neg = station_grid(raw)
        self.assertEqual(neg["co"], 1)
        self.assertTrue(pd.isna(frame.co.iloc[0]))
        x = features(frame, LOCAL)
        self.assertTrue(pd.isna(x.pm25_lag_1.iloc[4]))
        self.assertTrue(pd.isna(x.pm25_mean_6.iloc[8]))
        self.assertEqual(x.pm25_lag_6.iloc[8], 2)
        self.assertEqual(x.pm25_mean_3.iloc[8], 7)

    def test_duplicate(self):
        raw = self.rows()
        with self.assertRaises(ValueError):
            station_grid(pd.concat([raw, raw]))

    def test_boundary(self):
        times = pd.date_range(VAL - pd.Timedelta(hours=4), periods=5, freq="h")
        masks = partitions(times, 3)
        self.assertEqual(masks["train"].tolist(), [True, False, False, False, False])
        self.assertTrue(masks["validation"][-1])

    def test_api(self):
        fields = {"relative_humidity_2m": "%"}
        payload = dict(utc_offset_seconds=25200, hourly_units=fields,
                       hourly=dict(time=["2020-01-01T07:00", "2020-01-01T08:00"],
                                   relative_humidity_2m=[110, 50]))
        now = pd.Timestamp("2020-01-01", tz="UTC")
        frame = inspect(payload, fields, now)
        self.assertEqual(list(frame.index), [now])
        self.assertTrue(pd.isna(frame.iloc[0, 0]))
        with self.assertRaises(ValueError):
            inspect(payload, {"relative_humidity_2m": "fraction"}, now)
