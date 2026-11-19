import unittest
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.data import AIR, LOCAL, UTC, WEATHER, normalized
from backend.main import create_app
from backend.store import collect, hours


def sample(source, instant, *, pm=12):
    units = AIR if source == "air" else WEATHER
    stamps = [(instant+timedelta(hours=offset)).astimezone(LOCAL).strftime("%Y-%m-%dT%H:00")
              for offset in (-1, 0, 1)]
    hourly = dict(time=stamps)
    hourly.update({k: [pm,pm,pm] for k in units})
    return dict(utc_offset_seconds=25200, latitude=16.1, longitude=108.2,
                hourly=hourly, hourly_units=units.copy())


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app("sqlite://", schedule=False)
        self.client = self.enter_client()
        self.now = datetime.now(UTC).replace(minute=0,second=0,microsecond=0)

    def enter_client(self):
        client = TestClient(self.app)
        client.__enter__()
        self.addCleanup(client.__exit__, None,None,None)
        return client

    def fetch(self, source):
        return normalized(source, sample(source, self.now), self.now)

    def test_empty_and_model_gate(self):
        for path in ["air-quality/current","weather/current","aqi/current","alerts","stations",
                     "model/info","predictions","system/status","air-quality/history"]:
            self.assertEqual(self.client.get("/api/"+path).status_code,200,path)
        self.assertIsNone(self.client.get("/api/aqi/current").json()["data"]["value"])
        self.assertEqual(self.client.get("/api/predictions").json()["data"]["status"],"region_not_validated")

    def test_retries_are_idempotent_and_history_is_joined(self):
        for _ in range(2):
            collect(self.app.state.engine,self.fetch)
        with self.app.state.engine.connect() as conn:
            self.assertEqual(conn.scalar(select(func.count()).select_from(hours)),4)
        history = self.client.get("/api/air-quality/history?days=1").json()
        self.assertEqual(len(history["data"]),2)
        self.assertEqual(history["data"][-1]["temperature_2m"],12)
        self.assertEqual(history["data"][-1]["pm2_5"],12)
        self.assertEqual(self.client.get("/api/aqi/current").json()["data"]["value"],12)
        self.assertEqual(self.client.get("/api/air-quality/history?days=0").status_code,422)

    def test_source_failure_preserves_history(self):
        collect(self.app.state.engine,self.fetch)
        def fail(source):
            if source=="air":
                raise TimeoutError()
            return self.fetch(source)
        with self.assertLogs("backend.data",level="ERROR"):
            collect(self.app.state.engine,fail)
        self.assertEqual(len(self.client.get("/api/air-quality/history").json()["data"]),2)
        statuses=self.client.get("/api/system/status").json()["data"]["sources"]
        self.assertEqual({r["source_id"]:r["error"] for r in statuses},
                         {"air":"TimeoutError","weather":None})

    def test_qc_and_units(self):
        data=sample("air",self.now)
        data["hourly"]["pm2_5"][0]=-1
        rows=normalized("air",data,self.now)
        self.assertIsNone(rows[0]["values_json"]["pm2_5"])
        self.assertEqual(rows[0]["quality_flags"]["pm2_5"],"invalid")
        self.assertEqual(len(rows),2)
        data["hourly_units"]["pm2_5"]="USAQI"
        with self.assertRaises(ValueError):
            normalized("air",data,self.now)
