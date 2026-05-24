from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import TypedDict

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from worker.cleanup import cleanup_intermediate_for_day, cleanup_product_retention, read_retention_days
from worker.channels import channel_for_event_code
from worker.db import connect, load_environment
from worker.gdelt_common import domain_from_url, parse_float, parse_int, parse_timestamp, parse_yyyymmdd
from worker.p2_enrichment import enrich_day, read_system_bool

QUAD_CLASS_LABELS = {
    1: "口头合作",
    2: "实质合作",
    3: "口头冲突",
    4: "实质冲突",
}


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
    quad_class_counts: Counter[int] = field(default_factory=Counter)
    goldstein_weighted_sum: float = 0
    goldstein_weight: float = 0
    goldstein_values: list[float] = field(default_factory=list)
    actor_counts: Counter[str] = field(default_factory=Counter)
    heat_delta: float | None = None
    trend_label: str = "暂无对比"

    def add_event(self, event: CleanEvent, mentions: list[CleanMention]) -> None:
        event_weight = max(event.num_mentions, len(mentions), 1)
        self.event_ids.add(event.global_event_id)
        self.mention_count += max(event.num_mentions, len(mentions))
        self.article_count += event.num_articles
        self.lat_sum += event.lat
        self.lon_sum += event.lon
        if event.quad_class in QUAD_CLASS_LABELS:
            self.quad_class_counts[event.quad_class] += 1
        if event.goldstein_scale is not None:
            self.goldstein_weighted_sum += event.goldstein_scale * event_weight
            self.goldstein_weight += event_weight
            self.goldstein_values.append(event.goldstein_scale)
        for actor_name in (event.actor1_name, event.actor2_name):
            if actor_name:
                self.actor_counts[actor_name] += 1
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

    @property
    def dominant_quad_class(self) -> int | None:
        if not self.quad_class_counts:
            return None
        return self.quad_class_counts.most_common(1)[0][0]

    @property
    def quad_class_breakdown(self) -> list[dict[str, float | int | str]]:
        total = sum(self.quad_class_counts.values())
        if total == 0:
            return []
        return [
            {
                "quadClass": quad_class,
                "label": QUAD_CLASS_LABELS[quad_class],
                "eventCount": count,
                "share": count / total,
            }
            for quad_class, count in self.quad_class_counts.most_common()
        ]

    @property
    def weighted_goldstein(self) -> float | None:
        if self.goldstein_weight == 0:
            return None
        return self.goldstein_weighted_sum / self.goldstein_weight

    @property
    def goldstein_min(self) -> float | None:
        return min(self.goldstein_values) if self.goldstein_values else None

    @property
    def goldstein_max(self) -> float | None:
        return max(self.goldstein_values) if self.goldstein_values else None

    @property
    def top_actors(self) -> list[dict[str, int | str]]:
        return [
            {"name": name, "count": count}
            for name, count in self.actor_counts.most_common(8)
        ]


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


def classify_trend(current_heat: float, previous_heat: float | None) -> tuple[float | None, str]:
    if previous_heat is None:
        return None, "暂无对比"
    delta = current_heat - previous_heat
    baseline = max(previous_heat, 1)
    if delta >= max(10, baseline * 0.15):
        return delta, "升温"
    if delta <= -max(10, baseline * 0.15):
        return delta, "冷却"
    return delta, "活跃"


def apply_hotspot_trends(
    hotspots: list[HotspotAggregate],
    previous_heat_by_key: dict[tuple[str, str], float],
) -> None:
    for hotspot in hotspots:
        delta, label = classify_trend(
            hotspot.heat_score,
            previous_heat_by_key.get((hotspot.region_key, hotspot.channel)),
        )
        hotspot.heat_delta = delta
        hotspot.trend_label = label


def sync_region_daily_metrics(conn: Connection, day: date) -> int:
    previous_day = day - timedelta(days=1)
    with conn.cursor() as cur:
        cur.execute("delete from map_region_daily_metrics where data_date = %s", (day,))
        cur.execute(
            """
            with filtered as (
              select *
              from map_hotspots
              where data_date = %s
            ),
            quad_source as (
              select
                f.data_date,
                f.region_key,
                (item->>'quadClass')::int as quad_class,
                sum(coalesce((item->>'eventCount')::numeric, 0)) as event_count
              from filtered f
              cross join lateral jsonb_array_elements(f.quad_class_breakdown) item
              where item ? 'quadClass'
              group by f.data_date, f.region_key, (item->>'quadClass')::int
            ),
            quad_totals as (
              select
                data_date,
                region_key,
                quad_class,
                event_count,
                sum(event_count) over (partition by data_date, region_key) as total_event_count
              from quad_source
            ),
            quad_summary as (
              select
                data_date,
                region_key,
                (array_agg(quad_class order by event_count desc, quad_class desc))[1] as dominant_quad_class,
                jsonb_agg(
                  jsonb_build_object(
                    'quadClass', quad_class,
                    'label', case quad_class
                      when 1 then '口头合作'
                      when 2 then '实质合作'
                      when 3 then '口头冲突'
                      when 4 then '实质冲突'
                      else '混合态势'
                    end,
                    'eventCount', event_count,
                    'share', event_count / nullif(total_event_count, 0)
                  )
                  order by event_count desc, quad_class desc
                ) as quad_class_breakdown
              from quad_totals
              group by data_date, region_key
            ),
            actor_source as (
              select
                f.data_date,
                f.region_key,
                actor->>'name' as name,
                sum(coalesce((actor->>'count')::numeric, (actor->>'eventCount')::numeric, (actor->>'event_count')::numeric, 0)) as count
              from filtered f
              cross join lateral jsonb_array_elements(f.top_actors) actor
              where actor ? 'name' and actor->>'name' <> ''
              group by f.data_date, f.region_key, actor->>'name'
            ),
            actor_ranked as (
              select
                data_date,
                region_key,
                name,
                count,
                row_number() over (partition by data_date, region_key order by count desc, name asc) as rank
              from actor_source
            ),
            actor_summary as (
              select
                data_date,
                region_key,
                jsonb_agg(jsonb_build_object('name', name, 'count', count) order by count desc, name asc) as top_actors
              from actor_ranked
              where rank <= 8
              group by data_date, region_key
            ),
            grouped as (
              select
                data_date,
                region_key,
                (array_agg(region_name order by heat_score desc, event_count desc, id asc))[1] as region_name,
                (array_remove(array_agg(country_code order by heat_score desc, event_count desc, id asc), null))[1] as country_code,
                (array_agg(channel order by heat_score desc, event_count desc, id asc))[1] as primary_channel,
                sum(centroid_lat * greatest(event_count, 1)) / nullif(sum(greatest(event_count, 1)), 0) as centroid_lat,
                sum(centroid_long * greatest(event_count, 1)) / nullif(sum(greatest(event_count, 1)), 0) as centroid_long,
                sum(heat_score) as heat_score,
                sum(event_count) as event_count,
                sum(mention_count) as mention_count,
                sum(article_count) as article_count,
                sum(source_count) as source_count,
                sum(source_domain_count) as source_domain_count,
                sum(weighted_goldstein * greatest(event_count, 1))
                  / nullif(sum(greatest(event_count, 1)) filter (where weighted_goldstein is not null), 0) as weighted_goldstein,
                min(goldstein_min) as goldstein_min,
                max(goldstein_max) as goldstein_max,
                count(*) as channel_count,
                jsonb_agg(
                  jsonb_build_object(
                    'hotspotId', id,
                    'channel', channel,
                    'heatScore', heat_score,
                    'eventCount', event_count,
                    'mentionCount', mention_count,
                    'sourceCount', source_count,
                    'summary', summary
                  )
                  order by heat_score desc, event_count desc, id asc
                ) as channel_breakdown,
                max(data_updated_at) as data_updated_at
              from filtered
              group by data_date, region_key
            ),
            previous_grouped as (
              select region_key, sum(heat_score) as heat_score
              from map_hotspots
              where data_date = %s
              group by region_key
            ),
            final_rows as (
              select
                g.*,
                qs.dominant_quad_class,
                coalesce(qs.quad_class_breakdown, '[]'::jsonb) as quad_class_breakdown,
                coalesce(actor_summary.top_actors, '[]'::jsonb) as top_actors,
                case when p.heat_score is null then null else g.heat_score - p.heat_score end as heat_delta,
                case
                  when p.heat_score is null then '暂无对比'
                  when g.heat_score - p.heat_score >= greatest(10, p.heat_score * 0.15) then '升温'
                  when g.heat_score - p.heat_score <= -greatest(10, p.heat_score * 0.15) then '冷却'
                  else '活跃'
                end as trend_label
              from grouped g
              left join quad_summary qs using (data_date, region_key)
              left join actor_summary using (data_date, region_key)
              left join previous_grouped p using (region_key)
            )
            insert into map_region_daily_metrics (
              data_date, region_key, region_name, country_code, centroid_lat, centroid_long, geom,
              primary_channel, channel_count, channel_breakdown, heat_score, heat_delta, trend_label,
              event_count, mention_count, article_count, source_count, source_domain_count,
              weighted_goldstein, goldstein_min, goldstein_max, dominant_quad_class,
              quad_class_breakdown, top_actors, data_updated_at
            )
            select
              data_date, region_key, region_name, country_code, centroid_lat, centroid_long,
              ST_SetSRID(ST_MakePoint(centroid_long, centroid_lat), 4326),
              primary_channel, channel_count, channel_breakdown, heat_score, heat_delta, trend_label,
              event_count, mention_count, article_count, source_count, source_domain_count,
              weighted_goldstein, goldstein_min, goldstein_max, dominant_quad_class,
              quad_class_breakdown, top_actors, data_updated_at
            from final_rows
            on conflict (data_date, region_key) do update set
              region_name = excluded.region_name,
              country_code = excluded.country_code,
              centroid_lat = excluded.centroid_lat,
              centroid_long = excluded.centroid_long,
              geom = excluded.geom,
              primary_channel = excluded.primary_channel,
              channel_count = excluded.channel_count,
              channel_breakdown = excluded.channel_breakdown,
              heat_score = excluded.heat_score,
              heat_delta = excluded.heat_delta,
              trend_label = excluded.trend_label,
              event_count = excluded.event_count,
              mention_count = excluded.mention_count,
              article_count = excluded.article_count,
              source_count = excluded.source_count,
              source_domain_count = excluded.source_domain_count,
              weighted_goldstein = excluded.weighted_goldstein,
              goldstein_min = excluded.goldstein_min,
              goldstein_max = excluded.goldstein_max,
              dominant_quad_class = excluded.dominant_quad_class,
              quad_class_breakdown = excluded.quad_class_breakdown,
              top_actors = excluded.top_actors,
              data_updated_at = excluded.data_updated_at
            """,
            (day, previous_day),
        )
        return cur.rowcount


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
    previous_day = day - timedelta(days=1)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select region_key, channel, heat_score
            from map_hotspots
            where data_date = %s
            """,
            (previous_day,),
        )
        previous_heat_by_key = {
            (row["region_key"], row["channel"]): float(row["heat_score"])
            for row in cur.fetchall()
        }
    apply_hotspot_trends(hotspots, previous_heat_by_key)
    for hotspot in hotspots:
        uid = f"{hotspot.data_date.isoformat()}:{hotspot.region_key}:{hotspot.channel}"
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into map_hotspots (
                  hotspot_uid, data_date, region_key, region_name, country_code, channel,
                  centroid_lat, centroid_long, geom, event_count, mention_count, article_count,
                  source_count, source_domain_count, heat_score, summary, dominant_quad_class,
                  quad_class_breakdown, weighted_goldstein, goldstein_min, goldstein_max,
                  heat_delta, trend_label, top_actors, data_updated_at
                )
                values (
                  %s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
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
                    hotspot.dominant_quad_class,
                    Jsonb(hotspot.quad_class_breakdown),
                    hotspot.weighted_goldstein,
                    hotspot.goldstein_min,
                    hotspot.goldstein_max,
                    hotspot.heat_delta,
                    hotspot.trend_label,
                    Jsonb(hotspot.top_actors),
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

    region_metrics = sync_region_daily_metrics(conn, day)
    write_daily_brief(conn, day, hotspots, end_at)
    p2_stats: dict[str, int] = {"gkg_documents": 0, "hotspots": 0, "sources": 0, "stories": 0}
    p2_failed = False
    p2_enabled = read_system_bool(conn, "p2_enrichment_enabled", True)
    if p2_enabled:
        try:
            p2_stats = enrich_day(conn, day)
        except Exception as error:
            p2_failed = True
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
    cleanup_stats: dict[str, int | str] = {}
    if p2_enabled and not p2_failed:
        cleanup_stats.update(cleanup_intermediate_for_day(conn, day))
    cleanup_stats.update(cleanup_product_retention(conn, read_retention_days(conn)))
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
        "region_metrics": region_metrics,
        "p2_gkg_documents": p2_stats["gkg_documents"],
        "p2_hotspots": p2_stats["hotspots"],
        "p2_sources": p2_stats["sources"],
        "p2_stories": p2_stats["stories"],
        "cleanup_rows": sum(value for value in cleanup_stats.values() if isinstance(value, int)),
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
        brief = f"当前数据覆盖 {day.isoformat()}。态势热点主要集中在{region_text}，{channel_text}类事件信号较多。"
    else:
        brief = f"当前数据覆盖 {day.isoformat()}，暂无可展示态势热点。"
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
