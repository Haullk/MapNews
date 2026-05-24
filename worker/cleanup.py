from __future__ import annotations

import argparse
from datetime import UTC, date, datetime, timedelta
from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row

from worker.db import connect, load_environment

RAW_TABLES = (
    "gdelt_events_raw",
    "gdelt_mentions_raw",
    "gdelt_gkg_raw",
    "gdelt_gkg_preserved",
)
SUCCESSFUL_PROCESSING_STATUSES = {"success", "partial_success"}
DEFAULT_RETENTION_DAYS = 90


def retention_cutoff(reference_date: date, retention_days: int) -> date:
    return reference_date - timedelta(days=max(retention_days, 1) - 1)


def raw_clear_allowed(latest_batch: dict[str, Any] | None) -> bool:
    if latest_batch is None:
        return True
    return str(latest_batch.get("processing_status") or "") in SUCCESSFUL_PROCESSING_STATUSES


def latest_import_batch(conn: Connection) -> dict[str, Any] | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select import_date, status, processing_status, error_message
            from gdelt_import_batches
            order by started_at desc, id desc
            limit 1
            """,
        )
        row = cur.fetchone()
    return dict(row) if row else None


def clear_raw_before_import(conn: Connection) -> dict[str, Any]:
    latest_batch = latest_import_batch(conn)
    if not raw_clear_allowed(latest_batch):
        return {
            "cleared": False,
            "reason": "latest_batch_not_processed",
            "latest_batch": latest_batch,
        }
    with conn.cursor() as cur:
        cur.execute(f"truncate table {', '.join(RAW_TABLES)}")
    return {"cleared": True, "reason": "ok", "latest_batch": latest_batch}


def read_retention_days(conn: Connection, default: int = DEFAULT_RETENTION_DAYS) -> int:
    with conn.cursor() as cur:
        cur.execute("select value from system_parameters where key = 'retention_days'")
        row = cur.fetchone()
    if not row:
        return default
    try:
        return max(1, int(row[0]))
    except (TypeError, ValueError):
        return default


def latest_product_date(conn: Connection) -> date | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select max(data_date)
            from (
              select max(data_date) as data_date from map_hotspots
              union all
              select max(data_date) as data_date from map_region_daily_metrics
              union all
              select max(data_date) as data_date from daily_briefs
            ) dates
            """,
        )
        row = cur.fetchone()
    return row[0] if row and row[0] else None


def cleanup_product_retention(
    conn: Connection,
    retention_days: int,
    reference_date: date | None = None,
) -> dict[str, int | str]:
    reference = reference_date or latest_product_date(conn) or datetime.now(UTC).date()
    cutoff = retention_cutoff(reference, retention_days)
    with conn.cursor() as cur:
        cur.execute("delete from map_hotspots where data_date < %s", (cutoff,))
        deleted_hotspots = cur.rowcount
        cur.execute("delete from map_region_daily_metrics where data_date < %s", (cutoff,))
        deleted_metrics = cur.rowcount
        cur.execute("delete from daily_briefs where data_date < %s", (cutoff,))
        deleted_briefs = cur.rowcount
        cur.execute(
            """
            delete from article_metadata a
            where not exists (
              select 1 from map_hotspot_sources s where s.source_url = a.url
            )
              and not exists (
                select 1 from story_group_sources s where s.source_url = a.url
              )
            """,
        )
        deleted_article_metadata = cur.rowcount
    return {
        "cutoff": cutoff.isoformat(),
        "hotspots": deleted_hotspots,
        "region_daily_metrics": deleted_metrics,
        "daily_briefs": deleted_briefs,
        "article_metadata": deleted_article_metadata,
    }


def cleanup_intermediate_for_day(conn: Connection, day: date) -> dict[str, int]:
    start_at = datetime(day.year, day.month, day.day, tzinfo=UTC)
    end_at = start_at + timedelta(days=1)
    with conn.cursor() as cur:
        cur.execute(
            """
            delete from gdelt_mentions_clean m
            where exists (
              select 1
              from gdelt_events_clean e
              where e.global_event_id = m.global_event_id
                and e.event_date = %s
            )
            """,
            (day,),
        )
        deleted_mentions = cur.rowcount
        cur.execute("delete from gdelt_events_clean where event_date = %s", (day,))
        deleted_events = cur.rowcount
        cur.execute(
            """
            delete from gkg_documents
            where source_file_timestamp >= %s and source_file_timestamp < %s
            """,
            (start_at, end_at),
        )
        deleted_gkg_documents = cur.rowcount
    return {
        "events_clean": deleted_events,
        "mentions_clean": deleted_mentions,
        "gkg_documents": deleted_gkg_documents,
    }


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean MapNews raw, intermediate, and product-layer data.")
    parser.add_argument("--clear-raw-before-import", action="store_true")
    parser.add_argument("--cleanup-day", help="Clean intermediate tables for one UTC date, YYYY-MM-DD.")
    parser.add_argument("--product-retention", action="store_true")
    parser.add_argument("--retention-days", type=int)
    parser.add_argument("--reference-date", help="Retention reference date, YYYY-MM-DD. Defaults to current UTC date.")
    args = parser.parse_args()

    load_environment()
    with connect() as conn:
        if args.clear_raw_before_import:
            print(clear_raw_before_import(conn))
        if args.cleanup_day:
            print(cleanup_intermediate_for_day(conn, parse_date(args.cleanup_day)))
        if args.product_retention:
            retention_days = args.retention_days or read_retention_days(conn)
            reference_date = parse_date(args.reference_date) if args.reference_date else None
            print(cleanup_product_retention(conn, retention_days, reference_date))
        conn.commit()


if __name__ == "__main__":
    main()
