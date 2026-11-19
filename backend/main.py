"""FastAPI service for the self-hosted Da Nang dashboard."""
import csv
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select

from backend.aqi import assess_us_aqi
from backend.data import POINT, UTC
from backend.pilot import load_model, predict_hours
from backend.store import collect, database, history, jobs, meta, utc

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")


class Envelope(BaseModel):
    data: Any
    updated_at: datetime | None = None
    retrieved_at: datetime | None = None
    stale: bool | None = None
    kind: str | None = None
    location_id: str | None = None


def current(engine, source):
    result = history(engine, None, datetime.now(UTC), source)
    result["data"] = next(iter(result["data"]), None)
    return result


def aqi(engine):
    result = current(engine, "air")
    value = (result["data"] or {}).get("us_aqi")
    item = assess_us_aqi(value, result["updated_at"], components=result["data"])
    result["data"] = {**item, "method": item.get("standard", "US AQI")}
    return result


def model_info():
    folder = ROOT/"reports"/"phase2"
    manifests = [json.loads((folder/f"manifest_{h}h.json").read_text("utf8")) for h in (1, 3)]
    with (folder/"metrics.csv").open(encoding="utf8") as stream:
        metrics = [dict(horizon=int(row["horizon"]), model=row["model"], samples=int(row["n"]),
                        **{k:float(row[k]) for k in ("mae","rmse","r2")})
                   for row in csv.DictReader(stream) if row["split"] == "test"]
    return dict(region="Beijing", danang_status="experimental_cams_only", manifests=manifests,
                test_metrics=metrics, danang_pilot=load_model())


def create_app(db_url=None, schedule=True):
    engine = database(db_url or os.getenv("DATABASE_URL", "sqlite:///./air_quality.sqlite3"))

    @asynccontextmanager
    async def lifespan(app):
        meta.create_all(engine)
        scheduler = BackgroundScheduler(timezone=UTC)
        if schedule:
            scheduler.add_job(collect, "interval", hours=1, next_run_time=datetime.now(UTC),
                              args=[engine], max_instances=1, coalesce=True)
            scheduler.start()
        try:
            yield
        finally:
            if scheduler.running:
                scheduler.shutdown(wait=True)
            engine.dispose()

    app = FastAPI(title="Da Nang Air Quality AI", version="1.0", lifespan=lifespan)
    app.state.engine = engine
    origins = [x.strip() for x in os.getenv("CORS_ORIGINS","").split(",") if x.strip()]
    if origins:
        app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"])

    @app.get("/api/air-quality/history", response_model=Envelope)
    def get_history(days: int = Query(7, ge=1, le=366), start: datetime | None = None,
                    end: datetime | None = None):
        if any(x is not None and x.tzinfo is None for x in (start,end)):
            raise HTTPException(422, "Provide UTC offset in start and end")
        until = min(utc(end), datetime.now(UTC)) if end else datetime.now(UTC)
        since = utc(start) if start else until.replace(minute=0,second=0,microsecond=0)-timedelta(hours=24*days-1)
        if since > until or until-since > timedelta(days=366):
            raise HTTPException(422, "Requested interval must be between 0 and 366 days")
        return history(engine, since, until)

    @app.get("/api/air-quality/current", response_model=Envelope)
    def get_air():
        return current(engine,"air")

    @app.get("/api/weather/current", response_model=Envelope)
    def get_weather():
        return current(engine,"weather")

    @app.get("/api/aqi/current", response_model=Envelope)
    def get_aqi():
        return aqi(engine)

    @app.get("/api/model/info", response_model=Envelope)
    def get_model():
        return {"data": model_info()}

    @app.get("/api/predictions", response_model=Envelope)
    def get_predictions():
        now = datetime.now(UTC)
        origin = now.replace(minute=0,second=0,microsecond=0)
        recent = history(engine, origin-timedelta(hours=24), now, "air")
        recent["data"] = predict_hours(recent["data"], now)
        recent["kind"] = "experimental_ml_forecast"
        recent["stale"] = recent["updated_at"] is None or recent["updated_at"] < origin
        return recent

    @app.get("/api/stations", response_model=Envelope)
    def get_stations():
        return {"data":[POINT]}

    @app.get("/api/alerts", response_model=Envelope)
    def get_alerts():
        result = aqi(engine)
        item = result["data"]
        if result["stale"] or item["value"] is None:
            message = "Dữ liệu cũ hoặc chưa đủ để đánh giá chất lượng không khí."
            result["data"] = [{"type":"data_quality", "message":message}]
        elif item["value"] > 50:
            result["data"] = [{"type":"current", "source":"Open-Meteo / CAMS",
                               "category":item["category"], "message":item["advice"]}]
        else:
            result["data"] = []
        return result

    @app.get("/api/system/status", response_model=Envelope)
    def get_status():
        with engine.connect() as conn:
            status = [dict(source_id=r.source_id, attempt_at=utc(r.attempt_at), error=r.error)
                      for r in conn.execute(select(jobs))]
        return {"data":{"database":"ok", "scheduler_enabled":schedule, "sources":status}}

    return app


app = create_app()
