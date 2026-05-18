from __future__ import annotations

import argparse
import csv
import io
import os
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable


EVENT_COLUMNS = 61


@dataclass(frozen=True)
class ImportStats:
    files_attempted: int = 0
    files_imported: int = 0
    rows_seen: int = 0
    rows_inserted: int = 0
    rows_skipped: int = 0

    def add(self, other: "ImportStats") -> "ImportStats":
        return ImportStats(
            files_attempted=self.files_attempted + other.files_attempted,
            files_imported=self.files_imported + other.files_imported,
            rows_seen=self.rows_seen + other.rows_seen,
            rows_inserted=self.rows_inserted + other.rows_inserted,
            rows_skipped=self.rows_skipped + other.rows_skipped,
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import one day of GDELT 2.0 Events into PostGIS.")
    parser.add_argument("--date", help="UTC date to import, YYYY-MM-DD. Defaults to yesterday UTC.")
    parser.add_argument("--limit-files", type=int, help="Import only the first N 15-minute files.")
    parser.add_argument("--keep-raw", action="store_true", help="Keep downloaded zip files in GDELT_RAW_DIR.")
    return parser.parse_args()


def import_date(value: str | None) -> date:
    if value:
        return datetime.strptime(value, "%Y-%m-%d").date()
    return (datetime.now(timezone.utc) - timedelta(days=1)).date()


def intervals(day: date) -> Iterable[datetime]:
    start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    for index in range(96):
        yield start + timedelta(minutes=15 * index)


def event_url(base_url: str, stamp: datetime) -> str:
    name = stamp.strftime("%Y%m%d%H%M%S")
    return f"{base_url.rstrip('/')}/{name}.export.CSV.zip"


def raw_path(raw_dir: Path, stamp: datetime) -> Path:
    return raw_dir / f"{stamp.strftime('%Y%m%d%H%M%S')}.export.CSV.zip"


def download(url: str, path: Path) -> bool:
    import requests

    if path.exists() and path.stat().st_size > 0:
        return True

    response = requests.get(url, timeout=45)
    if response.status_code == 404:
        return False
    response.raise_for_status()
    path.write_bytes(response.content)
    return True


def parse_int(value: str) -> int | None:
    if value == "":
        return None
    return int(value)


def parse_float(value: str) -> float | None:
    if value == "":
        return None
    return float(value)


def parse_event_date(value: str) -> date:
    return datetime.strptime(value, "%Y%m%d").date()


def parse_date_added(value: str) -> datetime | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)


def row_to_record(row: list[str]) -> tuple | None:
    if len(row) < EVENT_COLUMNS:
        return None

    lat = parse_float(row[56])
    lon = parse_float(row[57])
    if lat is None or lon is None or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None

    return (
        int(row[0]),
        parse_event_date(row[1]),
        parse_date_added(row[59]),
        row[6] or None,
        row[7] or None,
        row[16] or None,
        row[17] or None,
        row[26] or None,
        row[27] or None,
        row[28] or None,
        parse_int(row[29]),
        parse_float(row[30]),
        parse_int(row[31]),
        parse_int(row[32]),
        parse_int(row[33]),
        parse_float(row[34]),
        parse_int(row[51]),
        row[52] or None,
        row[53] or None,
        row[54] or None,
        lat,
        lon,
        row[58] or None,
        row[60] or None,
    )


UPSERT_SQL = """
insert into gdelt_events (
  global_event_id,
  event_date,
  date_added,
  actor1_name,
  actor1_country_code,
  actor2_name,
  actor2_country_code,
  event_code,
  event_base_code,
  event_root_code,
  quad_class,
  goldstein_scale,
  num_mentions,
  num_sources,
  num_articles,
  avg_tone,
  action_geo_type,
  action_geo_fullname,
  action_geo_country_code,
  action_geo_adm1_code,
  action_geo_lat,
  action_geo_long,
  action_geo_feature_id,
  source_url,
  geom
) values (
  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
  ST_SetSRID(ST_MakePoint(%s, %s), 4326)
)
on conflict (global_event_id) do nothing
"""


def import_zip(conn, zip_path: Path) -> ImportStats:
    rows_seen = 0
    rows_inserted = 0
    rows_skipped = 0

    with zipfile.ZipFile(zip_path) as archive:
        csv_name = archive.namelist()[0]
        with archive.open(csv_name) as zipped_csv:
            text_stream = io.TextIOWrapper(zipped_csv, encoding="latin-1", newline="")
            reader = csv.reader(text_stream, delimiter="\t")
            with conn.cursor() as cur:
                for row in reader:
                    rows_seen += 1
                    record = row_to_record(row)
                    if record is None:
                        rows_skipped += 1
                        continue

                    cur.execute(UPSERT_SQL, (*record, record[21], record[20]))
                    rows_inserted += cur.rowcount
                    if cur.rowcount == 0:
                        rows_skipped += 1

    return ImportStats(files_imported=1, rows_seen=rows_seen, rows_inserted=rows_inserted, rows_skipped=rows_skipped)


def start_batch(conn, day: date) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into gdelt_import_batches (import_date, started_at, status)
            values (%s, now(), 'running')
            on conflict (import_date) do update
            set started_at = excluded.started_at,
                finished_at = null,
                status = 'running',
                error_message = null
            returning id
            """,
            (day,),
        )
        return int(cur.fetchone()[0])


def finish_batch(conn, batch_id: int, stats: ImportStats, status: str, error: str | None = None) -> None:
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


def run(day: date, limit_files: int | None, keep_raw: bool) -> ImportStats:
    from worker.db import connect, load_environment

    load_environment()
    raw_dir = Path(os.getenv("GDELT_RAW_DIR", "data/raw"))
    raw_dir.mkdir(parents=True, exist_ok=True)
    base_url = os.getenv("GDELT_BASE_URL", "http://data.gdeltproject.org/gdeltv2")
    stamps = list(intervals(day))[:limit_files]
    stats = ImportStats()

    with connect() as conn:
        batch_id = start_batch(conn, day)
        conn.commit()

        try:
            for stamp in stamps:
                stats = stats.add(ImportStats(files_attempted=1))
                path = raw_path(raw_dir, stamp)
                if not download(event_url(base_url, stamp), path):
                    continue

                file_stats = import_zip(conn, path)
                stats = stats.add(file_stats)
                conn.commit()

                if not keep_raw:
                    path.unlink(missing_ok=True)

            finish_batch(conn, batch_id, stats, "success")
            conn.commit()
            return stats
        except Exception as exc:
            conn.rollback()
            finish_batch(conn, batch_id, stats, "failed", str(exc))
            conn.commit()
            raise


def main() -> None:
    args = parse_args()
    day = import_date(args.date)
    stats = run(day=day, limit_files=args.limit_files, keep_raw=args.keep_raw)
    print(
        f"Imported {day}: files={stats.files_imported}/{stats.files_attempted}, "
        f"seen={stats.rows_seen}, inserted={stats.rows_inserted}, skipped={stats.rows_skipped}"
    )


if __name__ == "__main__":
    main()
