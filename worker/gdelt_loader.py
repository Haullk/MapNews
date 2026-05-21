from __future__ import annotations

import argparse
import os
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import requests
from psycopg import Connection
from psycopg.types.json import Jsonb

from worker.db import connect, load_environment
from worker.gdelt_common import (
    GDELT_BASE_URL,
    GdeltFile,
    files_for_day,
    parse_timestamp,
    rows_from_zip,
    stable_row_id,
)


@dataclass(frozen=True)
class LoaderStats:
    files_attempted: int = 0
    files_imported: int = 0
    rows_seen: int = 0
    rows_inserted: int = 0
    rows_skipped: int = 0

    def add(self, other: LoaderStats) -> LoaderStats:
        return LoaderStats(
            files_attempted=self.files_attempted + other.files_attempted,
            files_imported=self.files_imported + other.files_imported,
            rows_seen=self.rows_seen + other.rows_seen,
            rows_inserted=self.rows_inserted + other.rows_inserted,
            rows_skipped=self.rows_skipped + other.rows_skipped,
        )


def import_date(value: str | None) -> date:
    if value:
        return datetime.strptime(value, "%Y-%m-%d").date()
    return (datetime.now(UTC) - timedelta(days=1)).date()


def download_file(gdelt_file: GdeltFile, target: Path) -> bool:
    if target.exists() and target.stat().st_size > 0:
        return True

    response = requests.get(gdelt_file.url, timeout=45)
    if response.status_code == 404:
        return False
    response.raise_for_status()
    target.write_bytes(response.content)
    return True


def create_batch(conn: Connection, day: date) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into gdelt_import_batches (
              import_date, started_at, status, events_status, mentions_status, gkg_status, processing_status
            )
            values (%s, now(), 'running', 'pending', 'pending', 'pending', 'pending')
            on conflict (import_date) do update
            set started_at = excluded.started_at,
                finished_at = null,
                status = 'running',
                events_status = 'pending',
                mentions_status = 'pending',
                gkg_status = 'pending',
                processing_status = 'pending',
                error_message = null
            returning id
            """,
            (day,),
        )
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("Failed to create import batch.")
        return int(row[0])


def record_file_status(
    conn: Connection,
    batch_id: int,
    day: date,
    gdelt_file: GdeltFile,
    status: str,
    stats: LoaderStats | None = None,
    error_type: str | None = None,
    error_message: str | None = None,
    local_path: Path | None = None,
) -> None:
    stats = stats or LoaderStats()
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into gdelt_import_files (
              batch_id, import_date, dataset, file_timestamp, file_name, source_url, local_path,
              status, rows_seen, rows_inserted, rows_skipped, error_type, error_message, finished_at
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            on conflict (dataset, file_name) do update
            set batch_id = excluded.batch_id,
                import_date = excluded.import_date,
                file_timestamp = excluded.file_timestamp,
                source_url = excluded.source_url,
                local_path = excluded.local_path,
                status = excluded.status,
                rows_seen = excluded.rows_seen,
                rows_inserted = excluded.rows_inserted,
                rows_skipped = excluded.rows_skipped,
                error_type = excluded.error_type,
                error_message = excluded.error_message,
                finished_at = now()
            """,
            (
                batch_id,
                day,
                gdelt_file.dataset,
                gdelt_file.timestamp,
                gdelt_file.file_name,
                gdelt_file.url,
                str(local_path) if local_path else None,
                status,
                stats.rows_seen,
                stats.rows_inserted,
                stats.rows_skipped,
                error_type,
                error_message,
            ),
        )


def event_key(row: Sequence[str]) -> str | None:
    return row[0] if row and row[0] else None


def mention_key(source_file: str, line_number: int, row: Sequence[str]) -> str:
    event_id = row[0] if len(row) > 0 else ""
    mention_time = row[2] if len(row) > 2 else ""
    identifier = row[5] if len(row) > 5 else ""
    return stable_row_id("mentions", source_file, event_id, mention_time, identifier, line_number)


def gkg_key(source_file: str, line_number: int, row: Sequence[str]) -> str:
    identifier = row[0] if len(row) > 0 else ""
    extra = row[1] if len(row) > 1 else ""
    return stable_row_id("gkg", source_file, identifier, extra, line_number)


def insert_raw_row(
    conn: Connection,
    batch_id: int,
    gdelt_file: GdeltFile,
    line_number: int,
    row: list[str],
) -> int:
    with conn.cursor() as cur:
        if gdelt_file.dataset == "events":
            key = event_key(row)
            if key is None:
                return 0
            cur.execute(
                """
                insert into gdelt_events_raw (
                  global_event_id, import_batch_id, source_file, source_file_timestamp, raw_row
                )
                values (%s, %s, %s, %s, %s)
                on conflict (global_event_id) do nothing
                """,
                (int(key), batch_id, gdelt_file.file_name, gdelt_file.timestamp, Jsonb(row)),
            )
            return cur.rowcount

        if gdelt_file.dataset == "mentions":
            if len(row) < 6 or not row[0]:
                return 0
            cur.execute(
                """
                insert into gdelt_mentions_raw (
                  raw_id, global_event_id, import_batch_id, source_file, source_file_timestamp,
                  mention_identifier, mention_time_date, raw_row
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (raw_id) do nothing
                """,
                (
                    mention_key(gdelt_file.file_name, line_number, row),
                    int(row[0]),
                    batch_id,
                    gdelt_file.file_name,
                    gdelt_file.timestamp,
                    row[5] or None,
                    parse_timestamp(row[2] if len(row) > 2 else None),
                    Jsonb(row),
                ),
            )
            return cur.rowcount

        cur.execute(
            """
            insert into gdelt_gkg_raw (
              raw_id, import_batch_id, source_file, source_file_timestamp, document_identifier, raw_row
            )
            values (%s, %s, %s, %s, %s, %s)
            on conflict (raw_id) do nothing
            """,
            (
                gkg_key(gdelt_file.file_name, line_number, row),
                batch_id,
                gdelt_file.file_name,
                gdelt_file.timestamp,
                row[4] if len(row) > 4 and row[4] else None,
                Jsonb(row),
            ),
        )
        return cur.rowcount


def import_zip(conn: Connection, batch_id: int, gdelt_file: GdeltFile, zip_path: Path) -> LoaderStats:
    rows_seen = 0
    rows_inserted = 0
    rows_skipped = 0

    for line_number, row in enumerate(rows_from_zip(zip_path), start=1):
        rows_seen += 1
        inserted = insert_raw_row(conn, batch_id, gdelt_file, line_number, row)
        rows_inserted += inserted
        if inserted == 0:
            rows_skipped += 1

    return LoaderStats(
        files_imported=1,
        rows_seen=rows_seen,
        rows_inserted=rows_inserted,
        rows_skipped=rows_skipped,
    )


def dataset_status(stats: LoaderStats, failures: int) -> str:
    if stats.files_imported > 0 and failures == 0:
        return "success"
    if stats.files_imported > 0:
        return "partial_success"
    return "failed"


def update_batch_dataset(conn: Connection, batch_id: int, dataset: str, status: str, rows: int) -> None:
    column = {"events": "events_status", "mentions": "mentions_status", "gkg": "gkg_status"}[dataset]
    rows_column = {"events": "events_rows", "mentions": "mentions_rows", "gkg": "gkg_rows"}[dataset]
    with conn.cursor() as cur:
        cur.execute(
            f"update gdelt_import_batches set {column} = %s, {rows_column} = %s where id = %s",
            (status, rows, batch_id),
        )


def finish_batch(
    conn: Connection,
    batch_id: int,
    stats: LoaderStats,
    status: str,
    error: str | None = None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            update gdelt_import_batches
            set finished_at = now(),
                status = %s,
                files_attempted = %s,
                files_imported = %s,
                rows_seen = %s,
                rows_inserted = %s,
                rows_skipped = %s,
                error_message = %s
            where id = %s
            """,
            (
                status,
                stats.files_attempted,
                stats.files_imported,
                stats.rows_seen,
                stats.rows_inserted,
                stats.rows_skipped,
                error,
                batch_id,
            ),
        )


def run_loader(
    conn: Connection,
    batch_id: int,
    day: date,
    dataset: str,
    raw_dir: Path,
    base_url: str,
    limit_files: int | None,
    keep_raw: bool,
) -> tuple[LoaderStats, int]:
    files = [file for file in files_for_day(day, [dataset], base_url)][:limit_files]
    stats = LoaderStats()
    failures = 0

    for gdelt_file in files:
        stats = stats.add(LoaderStats(files_attempted=1))
        target = raw_dir / gdelt_file.file_name
        try:
            if not download_file(gdelt_file, target):
                record_file_status(
                    conn,
                    batch_id,
                    day,
                    gdelt_file,
                    "skipped",
                    local_path=target,
                    error_type="not_found",
                )
                conn.commit()
                continue

            file_stats = import_zip(conn, batch_id, gdelt_file, target)
            stats = stats.add(file_stats)
            record_file_status(conn, batch_id, day, gdelt_file, "imported", file_stats, local_path=target)
            conn.commit()
            if not keep_raw:
                target.unlink(missing_ok=True)
        except Exception as exc:
            conn.rollback()
            failures += 1
            record_file_status(
                conn,
                batch_id,
                day,
                gdelt_file,
                "failed",
                error_type=type(exc).__name__,
                error_message=str(exc),
                local_path=target,
            )
            conn.commit()

    return stats, failures


def run_daily_import(day: date, limit_files: int | None = None, keep_raw: bool = False) -> LoaderStats:
    load_environment()
    raw_dir = Path(os.getenv("GDELT_RAW_DIR", "data/raw"))
    raw_dir.mkdir(parents=True, exist_ok=True)
    base_url = os.getenv("GDELT_BASE_URL", GDELT_BASE_URL)
    enabled_datasets = ["events", "mentions"]
    if os.getenv("MAPNEWS_ENABLE_GKG", os.getenv("GDELT_ENABLE_GKG", "true")).lower() != "false":
        enabled_datasets.append("gkg")

    total = LoaderStats()
    with connect() as conn:
        batch_id = create_batch(conn, day)
        conn.commit()
        try:
            dataset_failures = 0
            for dataset in enabled_datasets:
                stats, failures = run_loader(
                    conn,
                    batch_id,
                    day,
                    dataset,
                    raw_dir,
                    base_url,
                    limit_files,
                    keep_raw,
                )
                total = total.add(stats)
                dataset_failures += failures
                update_batch_dataset(
                    conn,
                    batch_id,
                    dataset,
                    dataset_status(stats, failures),
                    stats.rows_inserted,
                )
                conn.commit()

            status = "success" if dataset_failures == 0 else "partial_success"
            finish_batch(conn, batch_id, total, status)
            conn.commit()
            return total
        except Exception as exc:
            conn.rollback()
            finish_batch(conn, batch_id, total, "failed", str(exc))
            conn.commit()
            raise


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import one day of GDELT Events, Mentions and GKG raw files.",
    )
    parser.add_argument("--date", help="UTC date to import, YYYY-MM-DD. Defaults to yesterday UTC.")
    parser.add_argument("--limit-files", type=int, help="Import only the first N files per dataset.")
    parser.add_argument("--keep-raw", action="store_true", help="Keep downloaded zip files in GDELT_RAW_DIR.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    day = import_date(args.date)
    stats = run_daily_import(day=day, limit_files=args.limit_files, keep_raw=args.keep_raw)
    print(
        f"Imported {day}: files={stats.files_imported}/{stats.files_attempted}, "
        f"seen={stats.rows_seen}, inserted={stats.rows_inserted}, skipped={stats.rows_skipped}"
    )


if __name__ == "__main__":
    main()
