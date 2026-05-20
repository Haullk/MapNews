from __future__ import annotations

import csv
import hashlib
import io
import zipfile
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

GDELT_BASE_URL = "http://data.gdeltproject.org/gdeltv2"
csv.field_size_limit(10 * 1024 * 1024)


@dataclass(frozen=True)
class DatasetSpec:
    name: str
    suffix: str
    table: str


DATASETS: dict[str, DatasetSpec] = {
    "events": DatasetSpec("events", "export.CSV.zip", "gdelt_events_raw"),
    "mentions": DatasetSpec("mentions", "mentions.CSV.zip", "gdelt_mentions_raw"),
    "gkg": DatasetSpec("gkg", "gkg.csv.zip", "gdelt_gkg_raw"),
}


@dataclass(frozen=True)
class GdeltFile:
    dataset: str
    timestamp: datetime
    file_name: str
    url: str


def intervals(day: date) -> Iterable[datetime]:
    start = datetime(day.year, day.month, day.day, tzinfo=UTC)
    for index in range(96):
        yield start + timedelta(minutes=15 * index)


def gdelt_file(dataset: str, stamp: datetime, base_url: str = GDELT_BASE_URL) -> GdeltFile:
    spec = DATASETS[dataset]
    prefix = stamp.strftime("%Y%m%d%H%M%S")
    file_name = f"{prefix}.{spec.suffix}"
    return GdeltFile(
        dataset=dataset,
        timestamp=stamp,
        file_name=file_name,
        url=f"{base_url.rstrip('/')}/{file_name}",
    )


def files_for_day(day: date, datasets: Iterable[str], base_url: str = GDELT_BASE_URL) -> list[GdeltFile]:
    return [gdelt_file(dataset, stamp, base_url) for stamp in intervals(day) for dataset in datasets]


def rows_from_zip(zip_path: Path) -> Iterator[list[str]]:
    with zipfile.ZipFile(zip_path) as archive:
        csv_name = archive.namelist()[0]
        with archive.open(csv_name) as zipped_csv:
            text_stream = io.TextIOWrapper(zipped_csv, encoding="latin-1", newline="")
            yield from csv.reader(text_stream, delimiter="\t")


def parse_int(value: str | None) -> int | None:
    if value in (None, ""):
        return None
    return int(str(value))


def parse_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    return float(str(value))


def parse_yyyymmdd(value: str | None) -> date | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y%m%d").date()


def parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.strptime(value, "%Y%m%d%H%M%S").replace(tzinfo=UTC)


def stable_row_id(*parts: object) -> str:
    payload = "\x1f".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def domain_from_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value if "://" in value else f"http://{value}")
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return host or None
