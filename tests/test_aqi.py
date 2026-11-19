from datetime import datetime, timedelta, timezone
import unittest

from backend.aqi import BANDS, COMPONENT_NAMES, assess_us_aqi
from backend.vn_aqi import hourly_vn_aqi, nowcast


class AQIAssessmentTests(unittest.TestCase):
    now = datetime(2025, 5, 22, 10, tzinfo=timezone.utc)

    def test_band_edges_and_rounded_value(self):
        for value, band in [(0, 0), (50.4, 0), (50.5, 1), (100, 1), (101, 2),
                            (150, 2), (151, 3), (200, 3), (201, 4), (300, 4), (301, 5), (501, 5)]:
            with self.subTest(value=value):
                result = assess_us_aqi(value, self.now, now=self.now)
                self.assertEqual(result["status"], "ok")
                self.assertEqual(result["category"], BANDS[band][1])
                self.assertTrue(result["advice"])
                self.assertEqual(result["standard"], "US AQI")

    def test_invalid_input(self):
        for value in [None, True, -1, "23", float("nan"), float("inf")]:
            result = assess_us_aqi(value, self.now, now=self.now)
            self.assertIsNone(result["value"])
            self.assertIsNone(result["advice"])

    def test_dominant_components_and_missing_inputs(self):
        components = dict.fromkeys(COMPONENT_NAMES, 10)
        components.update(us_aqi_pm2_5=95, us_aqi_pm10=95)
        result = assess_us_aqi(95, self.now, now=self.now, components=components)
        self.assertEqual(result["dominant_pollutant"], "PM2.5, PM10")
        self.assertIsNone(assess_us_aqi(96, self.now, now=self.now, components=components)["dominant_pollutant"])
        components["us_aqi_ozone"] = None
        self.assertIsNone(assess_us_aqi(95, self.now, now=self.now, components=components)["dominant_pollutant"])

    def test_future_and_unknown_time(self):
        for timestamp in [None, self.now.replace(tzinfo=None), "invalid", self.now + timedelta(hours=1)]:
            self.assertEqual(assess_us_aqi(20, timestamp, now=self.now)["status"], "unavailable")

    def test_freshness_uses_valid_time(self):
        result = assess_us_aqi(150, "2025-05-22T14:00:00+07:00", now=self.now)
        self.assertEqual(result["status"], "ok")
        result = assess_us_aqi(150, self.now - timedelta(hours=3, seconds=1), now=self.now)
        self.assertEqual(result["status"], "stale")
        self.assertEqual(result["value"], 150)
        self.assertIsNone(result["advice"])


class VietnameseIndexTests(unittest.TestCase):
    end = datetime(2025, 5, 22, 10, tzinfo=timezone.utc)

    def compute(self, rows, kind="station_observation"):
        return hourly_vn_aqi(rows, self.end, station_id="example", source_kind=kind, qc_verified=True)

    def test_official_particle_example_and_dominant_gas(self):
        history = [26.9, 24.7, 20.5, 23.5, 19.5, 16.5, 19, 16.5, 20.3, 22.4, 19.6, 20.6]
        rows = {self.end-timedelta(hours=i): {"pm25": val} for i, val in enumerate(reversed(history))}
        rows[self.end].update(no2=120, o3=136.1)
        result = self.compute(rows)
        self.assertEqual(result["value"], 60)
        self.assertEqual(result["components"]["pm25"], 41)
        self.assertEqual(result["dominant_pollutants"], ["no2"])

    def test_particle_window_and_provenance(self):
        rows = {self.end: {"co": 150000, "pm25": 50}}
        self.assertIsNone(self.compute(rows)["value"])
        rows[self.end - timedelta(hours=2)] = {"pm25": 50}
        self.assertEqual(self.compute(rows)["value"], 500)
        self.assertIsNone(self.compute(rows, "atmospheric_model_estimate")["value"])

    def test_weight_floor_keeps_positions(self):
        self.assertEqual(nowcast([10, None, 0, 8]+[None]*8), 5.5)
