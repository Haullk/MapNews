from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import TypedDict

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from worker.channels import channel_for_event_code
from worker.db import connect, load_environment
from worker.gdelt_common import domain_from_url, parse_float, parse_int, parse_timestamp, parse_yyyymmdd
from worker.p2_enrichment import enrich_day


@dataclass(frozen=True)
class CleanEvent:
    global_event_id: int
    event_date: date
    date_added: datetime | None
    actor1_name: str | None
    actor1_country_code: str | None
    actor2_name: str | None
    actor2_country_code: str | None
    event_code: str | None
    event_base_code: str | None
    event_root_code: str | None
    channel: str
    quad_class: int | None
    goldstein_scale: float | None
    num_mentions: int
    num_sources: int
    num_articles: int
    avg_tone: float | None
    action_geo_type: int | None
    action_geo_fullname: str | None
    action_geo_country_code: str | None
    action_geo_adm1_code: str | None
    action_geo_feature_id: str | None
    region_key: str
    region_name: str
    lat: float
    lon: float
    source_url: str | None
    source_domain: str | None
    import_batch_id: int | None = None


@dataclass(frozen=True)
class CleanMention:
    raw_id: str
    global_event_id: int
    mention_time_date: datetime | None
    event_time_date: datetime | None
    mention_source_name: str | None
    mention_identifier: str | None
    source_url: str | None
    source_domain: str | None
    confidence: int | None
    mention_doc_tone: float | None


@dataclass
class HotspotAggregate:
    data_date: date
    region_key: str
    region_name: str
    country_code: str | None
    channel: str
    event_ids: set[int] = field(default_factory=set)
    mention_count: int = 0
    article_count: int = 0
    source_urls: set[str] = field(default_factory=set)
    source_domains: set[str] = field(default_factory=set)
    lat_sum: float = 0
    lon_sum: float = 0

    def add_event(self, event: CleanEvent, mentions: list[CleanMention]) -> None:
        self.event_ids.add(event.global_event_id)
        self.mention_count += max(event.num_mentions, len(mentions))
        self.article_count += event.num_articles
        self.lat_sum += event.lat
        self.lon_sum += event.lon
        if event.source_url:
            self.source_urls.add(event.source_url)
        if event.source_domain:
            self.source_domains.add(event.source_domain)
        for mention in mentions:
            if mention.source_url:
                self.source_urls.add(mention.source_url)
            if mention.source_domain:
                self.source_domains.add(mention.source_domain)

    @property
    def event_count(self) -> int:
        return len(self.event_ids)

    @property
    def centroid_lat(self) -> float:
        return self.lat_sum / max(self.event_count, 1)

    @property
    def centroid_lon(self) -> float:
        return self.lon_sum / max(self.event_count, 1)

    @property
    def heat_score(self) -> float:
        return (
            self.event_count * 10
            + self.mention_count * 1.5
            + len(self.source_urls) * 2
            + len(self.source_domains) * 3
            + self.article_count * 0.8
        )


class BriefCount(TypedDict):
    name: str
    count: int


def _value(row: list[str], index: int) -> str | None:
    if index >= len(row) or row[index] == "":
        return None
    return row[index]


def clean_event_from_raw(row: list[str], import_batch_id: int | None = None) -> CleanEvent | None:
    if len(row) < 61:
        return None
    event_date = parse_yyyymmdd(_value(row, 1))
    lat = parse_float(_value(row, 56))
    lon = parse_float(_value(row, 57))
    if event_date is None or lat is None or lon is None or not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        return None

    event_code = _value(row, 26)
    geo_name = _value(row, 52)
    country_code = _value(row, 53)
    adm1_code = _value(row, 54)
    region_key = adm1_code or country_code or geo_name or f"{lat:.3f},{lon:.3f}"
    region_name = geo_name or country_code or region_key
    source_url = _value(row, 60)
    return CleanEvent(
        global_event_id=int(row[0]),
        event_date=event_date,
        date_added=parse_timestamp(_value(row, 59)),
        actor1_name=_value(row, 6),
        actor1_country_code=_value(row, 7),
        actor2_name=_value(row, 16),
        actor2_country_code=_value(row, 17),
        event_code=event_code,
        event_base_code=_value(row, 27),
        event_root_code=_value(row, 28),
        channel=channel_for_event_code(event_code),
        quad_class=parse_int(_value(row, 29)),
        goldstein_scale=parse_float(_value(row, 30)),
        num_mentions=parse_int(_value(row, 31)) or 0,
        num_sources=parse_int(_value(row, 32)) or 0,
        num_articles=parse_int(_value(row, 33)) or 0,
        avg_tone=parse_float(_value(row, 34)),
        action_geo_type=parse_int(_value(row, 51)),
        action_geo_fullname=geo_name,
        action_geo_country_code=country_code,
        action_geo_adm1_code=adm1_code,
        action_geo_feature_id=_value(row, 58),
        region_key=region_key,
        region_name=region_name,
        lat=lat,
        lon=lon,
        source_url=source_url,
        source_domain=domain_from_url(source_url),
        import_batch_id=import_batch_id,
    )


def clean_mention_from_raw(raw_id: str, row: list[str]) -> CleanMention | None:
    if len(row) < 6 or not row[0]:
        return None
    source_url = _value(row, 5)
    return CleanMention(
        raw_id=raw_id,
        global_event_id=int(row[0]),
        mention_time_date=parse_timestamp(_value(row, 2)),
        event_time_date=parse_timestamp(_value(row, 1)),
        mention_source_name=_value(row, 4),
        mention_identifier=source_url,
        source_url=source_url,
        source_domain=domain_from_url(source_url or _value(row, 4)),
        confidence=parse_int(_value(row, 11)),
        mention_doc_tone=parse_float(_value(row, 13)),
    )


def aggregate_hotspots(
    events: list[CleanEvent],
    mentions_by_event: dict[int, list[CleanMention]],
) -> list[HotspotAggregate]:
    grouped: dict[tuple[date, str, str], HotspotAggregate] = {}
    for event in events:
        key = (event.event_date, event.region_key, event.channel)
        hotspot = grouped.setdefault(
            key,
            HotspotAggregate(
                data_date=event.event_date,
                region_key=event.region_key,
                region_name=event.region_name,
                country_code=event.action_geo_country_code,
                channel=event.channel,
            ),
        )
        hotspot.add_event(event, mentions_by_event.get(event.global_event_id, []))
    return sorted(grouped.values(), key=lambda item: item.heat_score, reverse=True)


def hotspot_summary(hotspot: HotspotAggregate) -> str:
    return (
        f"{hotspot.data_date.isoformat()}，{hotspot.region_name}出现{hotspot.channel}类热点，"
        f"包含 {hotspot.event_count} 个事件、{hotspot.mention_count} 次相关报道提及。"
    )


def upsert_clean_event(conn: Connection, event: CleanEvent) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into gdelt_events_clean (
              global_event_id, import_batch_id, event_date, date_added, actor1_name, actor1_country_code,
              actor2_name, actor2_country_code, event_code, event_base_code, event_root_code, channel,
              quad_class, goldstein_scale, num_mentions, num_sources, num_articles, avg_tone,
              action_geo_type, action_geo_fullname, action_geo_country_code, action_geo_adm1_code,
              action_geo_feature_id, region_key, region_name, action_geo_lat, action_geo_long,
              source_url, source_domain, geom, cleaned_at
            )
            values (
              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), now()
            )
            on conflict (global_event_id) do update set
              num_mentions = excluded.num_mentions,
              num_sources = excluded.num_sources,
              num_articles = excluded.num_articles,
              cleaned_at = now()
            """,
            (
                event.global_event_id,
                event.import_batch_id,
                event.event_date,
                event.date_added,
                event.actor1_name,
                event.actor1_country_code,
                event.actor2_name,
                event.actor2_country_code,
                event.event_code,
                event.event_base_code,
                event.event_root_code,
                event.channel,
                event.quad_class,
                event.goldstein_scale,
                event.num_mentions,
                event.num_sources,
                event.num_articles,
                event.avg_tone,
                event.action_geo_type,
                event.action_geo_fullname,
                event.action_geo_country_code,
                event.action_geo_adm1_code,
                event.action_geo_feature_id,
                event.region_key,
                event.region_name,
                event.lat,
                event.lon,
                event.source_url,
                event.source_domain,
                event.lon,
                event.lat,
            ),
        )


def upsert_clean_mention(conn: Connection, mention: CleanMention) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into gdelt_mentions_clean (
              raw_id, global_event_id, mention_time_date, event_time_date, mention_source_name,
              mention_identifier, source_url, source_domain, confidence, mention_doc_tone, cleaned_at
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            on conflict (raw_id) do update set cleaned_at = now()
            """,
            (
                mention.raw_id,
                mention.global_event_id,
                mention.mention_time_date,
                mention.event_time_date,
                mention.mention_source_name,
                mention.mention_identifier,
                mention.source_url,
                mention.source_domain,
                mention.confidence,
                mention.mention_doc_tone,
            ),
        )


def process_day(conn: Connection, day: date) -> dict[str, int]:
    start_at = datetime(day.year, day.month, day.day, tzinfo=UTC)
    end_at = start_at + timedelta(days=1)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select global_event_id, import_batch_id, raw_row
            from gdelt_events_raw
            where source_file_timestamp >= %s and source_file_timestamp < %s
            """,
            (start_at, end_at),
        )
        raw_events = cur.fetchall()
        cur.execute(
            """
            insert into gdelt_gkg_preserved (
              raw_id, document_identifier, source_file, source_file_timestamp, raw_row
            )
            select raw_id, document_identifier, source_file, source_file_timestamp, raw_row
            from gdelt_gkg_raw
            where source_file_timestamp >= %s and source_file_timestamp < %s
            on conflict (raw_id) do nothing
            """,
            (start_at, end_at),
        )

    events: list[CleanEvent] = []
    for raw in raw_events:
        event = clean_event_from_raw(raw["raw_row"], raw["import_batch_id"])
        if event and event.event_date == day:
            upsert_clean_event(conn, event)
            events.append(event)

    mentions_by_event: dict[int, list[CleanMention]] = defaultdict(list)
    event_ids = [event.global_event_id for event in events]
    if event_ids:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select raw_id, raw_row
                from gdelt_mentions_raw
                where source_file_timestamp >= %s
                  and source_file_timestamp < %s
                  and global_event_id = any(%s)
                """,
                (start_at, end_at, event_ids),
            )
            raw_mentions = cur.fetchall()

        for raw in raw_mentions:
            mention = clean_mention_from_raw(raw["raw_id"], raw["raw_row"])
            if mention:
                upsert_clean_mention(conn, mention)
                mentions_by_event[mention.global_event_id].append(mention)

    with conn.cursor() as cur:
        cur.execute("delete from map_hotspots where data_date = %s", (day,))

    hotspots = aggregate_hotspots(events, mentions_by_event)
    for hotspot in hotspots:
        uid = f"{hotspot.data_date.isoformat()}:{hotspot.region_key}:{hotspot.channel}"
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into map_hotspots (
                  hotspot_uid, data_date, region_key, region_name, country_code, channel,
                  centroid_lat, centroid_long, geom, event_count, mention_count, article_count,
                  source_count, source_domain_count, heat_score, summary, data_updated_at
                )
                values (
                  %s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                  %s, %s, %s, %s, %s, %s, %s, %s
                )
                returning id
                """,
                (
                    uid,
                    hotspot.data_date,
                    hotspot.region_key,
                    hotspot.region_name,
                    hotspot.country_code,
                    hotspot.channel,
                    hotspot.centroid_lat,
                    hotspot.centroid_lon,
                    hotspot.centroid_lon,
                    hotspot.centroid_lat,
                    hotspot.event_count,
                    hotspot.mention_count,
                    hotspot.article_count,
                    len(hotspot.source_urls),
                    len(hotspot.source_domains),
                    hotspot.heat_score,
                    hotspot_summary(hotspot),
                    end_at,
                ),
            )
            inserted = cur.fetchone()
            if inserted is None:
                raise RuntimeError("Failed to insert hotspot.")
            hotspot_id = int(inserted[0])
            for rank, url in enumerate(sorted(hotspot.source_urls)[:5], start=1):
                cur.execute(
                    """
                    insert into map_hotspot_sources (hotspot_id, source_url, source_domain, source_rank)
                    values (%s, %s, %s, %s)
                    on conflict (hotspot_id, source_url) do nothing
                    """,
                    (hotspot_id, url, domain_from_url(url), rank),
                )

    write_daily_brief(conn, day, hotspots, end_at)
    p2_stats: dict[str, int] = {"gkg_documents": 0, "hotspots": 0, "sources": 0, "stories": 0}
    try:
        p2_stats = enrich_day(conn, day)
    except Exception as error:
        with conn.cursor() as cur:
            cur.execute(
                """
                update gdelt_import_batches
                set processing_status = 'partial_success',
                    error_message = coalesce(error_message || E'\n', '') || %s
                where import_date = %s
                """,
                (f"P2 enrichment failed: {error}", day),
            )
    with conn.cursor() as cur:
        cur.execute(
            """
            update gdelt_import_batches
            set processing_status = case
              when processing_status = 'partial_success' then processing_status
              else 'success'
            end
            where import_date = %s
            """,
            (day,),
        )
    return {
        "events_cleaned": len(events),
        "hotspots": len(hotspots),
        "p2_gkg_documents": p2_stats["gkg_documents"],
        "p2_hotspots": p2_stats["hotspots"],
        "p2_sources": p2_stats["sources"],
        "p2_stories": p2_stats["stories"],
    }


def write_daily_brief(
    conn: Connection,
    day: date,
    hotspots: list[HotspotAggregate],
    data_updated_at: datetime,
) -> None:
    regions = Counter(item.region_name for item in hotspots)
    channels = Counter(item.channel for item in hotspots)
    top_regions: list[BriefCount] = [{"name": name, "count": count} for name, count in regions.most_common(5)]
    top_channels: list[BriefCount] = [
        {"name": name, "count": count} for name, count in channels.most_common(6)
    ]
    if hotspots:
        region_text = "、".join(item["name"] for item in top_regions[:3])
        channel_text = "、".join(item["name"] for item in top_channels[:3])
        brief = f"当前数据覆盖 {day.isoformat()}。热点主要集中在{region_text}，{channel_text}类报道较多。"
    else:
        brief = f"当前数据覆盖 {day.isoformat()}，暂无可展示热点。"
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into daily_briefs (
              data_date, hotspot_count, top_regions, top_channels, completeness, brief_text, data_updated_at
            )
            values (%s, %s, %s, %s, %s, %s, %s)
            on conflict (data_date) do update set
              hotspot_count = excluded.hotspot_count,
              top_regions = excluded.top_regions,
              top_channels = excluded.top_channels,
              brief_text = excluded.brief_text,
              data_updated_at = excluded.data_updated_at
            """,
            (
                day,
                len(hotspots),
                Jsonb(top_regions),
                Jsonb(top_channels),
                Jsonb({}),
                brief,
                data_updated_at,
            ),
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build clean and product hotspot tables for one GDELT date.")
    parser.add_argument("--date", required=True, help="Date to process, YYYY-MM-DD.")
    return parser.parse_args()


def main() -> None:
    load_environment()
    args = parse_args()
    day = datetime.strptime(args.date, "%Y-%m-%d").date()
    with connect() as conn:
        stats = process_day(conn, day)
        conn.commit()
    print(f"Processed {day}: {stats}")


if __name__ == "__main__":
    main()
