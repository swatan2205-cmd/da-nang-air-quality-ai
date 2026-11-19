"""Store keyed source hours and ingestion status with independent transactions."""
from datetime import datetime, timedelta

from sqlalchemy import (JSON, Column, DateTime, Float, MetaData, String, Table,
                        and_, create_engine, select)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.pool import StaticPool

from backend.data import AIR, POINT, SOURCES, UTC, WEATHER, LOG, download

meta = MetaData()
hours = Table("environment_hours", meta,
    Column("location_id", String, primary_key=True), Column("source_id", String, primary_key=True),
    Column("valid_at", DateTime(timezone=True), primary_key=True, index=True),
    Column("retrieved_at", DateTime(timezone=True), nullable=False),
    Column("grid_lat", Float, nullable=False), Column("grid_lon", Float, nullable=False),
    Column("values_json", JSON, nullable=False), Column("quality_flags", JSON, nullable=False))
jobs = Table("source_status", meta, Column("source_id", String, primary_key=True),
    Column("attempt_at", DateTime(timezone=True), nullable=False),
    Column("error", String))


def database(url):
    if url in ("sqlite://", "sqlite:///:memory:"):
        return create_engine(url, poolclass=StaticPool, connect_args={"check_same_thread": False})
    return create_engine(url, pool_pre_ping=True)


def write_rows(conn, table, rows):
    insert = pg_insert if conn.dialect.name == "postgresql" else sqlite_insert
    stmt = insert(table)
    changed = {c.name: stmt.excluded[c.name] for c in table.c if not c.primary_key}
    stamp = table.c.retrieved_at if table is hours else table.c.attempt_at
    stmt = stmt.on_conflict_do_update(index_elements=list(table.primary_key),
        set_=changed, where=stamp <= stmt.excluded[stamp.name])
    conn.execute(stmt, rows)


def collect(engine, fetch=download):
    for source in SOURCES:
        attempt = datetime.now(UTC)
        try:
            rows = fetch(source)
            with engine.begin() as conn:
                write_rows(conn, hours, rows)
                write_rows(conn, jobs, [dict(source_id=source, attempt_at=attempt, error=None)])
            LOG.info("Collected %d hourly estimates from %s", len(rows), source)
        except Exception as exc:
            LOG.exception("Collection failed for %s", source)
            with engine.begin() as conn:
                write_rows(conn, jobs, [dict(source_id=source, attempt_at=attempt, error=type(exc).__name__)])


def utc(value):
    return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)


def history(engine, begin, end, source=None):
    cond = [hours.c.location_id == POINT["id"], hours.c.valid_at <= end]
    if begin is not None:
        cond.append(hours.c.valid_at >= begin)
    if source:
        cond.append(hours.c.source_id == source)
    query = select(hours).where(and_(*cond)).order_by(hours.c.valid_at)
    if begin is None and source:
        query = query.order_by(None).order_by(hours.c.valid_at.desc()).limit(1)
    result, last_fetch = {}, None
    with engine.connect() as conn:
        for row in conn.execute(query).mappings():
            stamp, fetched = utc(row["valid_at"]), utc(row["retrieved_at"])
            fields = AIR if source == "air" else WEATHER if source == "weather" else {**AIR, **WEATHER}
            item = result.setdefault(stamp, dict(time=stamp, **dict.fromkeys(fields), sources={}))
            item.update(row["values_json"])
            item["sources"][row["source_id"]] = dict(retrieved_at=fetched, grid_lat=row["grid_lat"],
                grid_lon=row["grid_lon"], quality_flags=row["quality_flags"])
            last_fetch = max(fetched, last_fetch) if last_fetch else fetched
    latest = max(result, default=None)
    return dict(data=list(result.values()), updated_at=latest, retrieved_at=last_fetch,
                stale=latest is None or datetime.now(UTC)-latest > timedelta(hours=3),
                kind="atmospheric_model_estimate", location_id=POINT["id"])
