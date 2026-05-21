from __future__ import annotations

import argparse
import hashlib
import json
import re
from collections import Counter
from collections.abc import Callable, Iterable, Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from html import unescape
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse

import requests
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from worker.db import connect, load_environment
from worker.gdelt_common import domain_from_url, parse_float, parse_timestamp

USER_AGENT = "MapNewsBot/0.2 (+metadata-only)"
MAX_EXCERPT_LENGTH = 900
OLD_ARTICLE_DAYS = 30
DEFAULT_FETCH_CONCURRENCY = 5
DEFAULT_CANDIDATE_SOURCES_PER_HOTSPOT = 50
DEFAULT_SOURCES_PER_HOTSPOT = 12
MAX_CANDIDATES_PER_DOMAIN = 3
THEME_LABELS = {
    "TRADE": "贸易",
    "EPU_ECONOMY": "经济政策",
    "CONFLICT_AND_VIOLENCE": "冲突与暴力",
    "CRISISLEX_C07_SAFETY": "安全",
    "EDUCATION": "教育",
    "AGRICULTURE": "农业",
    "ENERGY_AND_EXTRACTIVES": "能源与资源",
    "COMPETITIVE_INDUSTRIES": "产业竞争",
    "ETHNICITY_CHINESE": "中国相关族群",
    "ETHNICITY": "族群议题",
}
NOISY_THEME_PREFIXES = (
    "TAX_FNCACT",
    "TAX_WORLDLANGUAGES",
    "AFFECT",
    "FNCACT",
    "CRISISLEX_CRISISLEXREC",
)


@dataclass(frozen=True)
class ArticleMetadata:
    url: str
    canonical_url: str | None = None
    source_domain: str | None = None
    title: str | None = None
    description: str | None = None
    site_name: str | None = None
    author: str | None = None
    published_at: datetime | None = None
    language: str | None = None
    excerpt: str | None = None
    fetch_status: str = "success"
    http_status: int | None = None
    error_message: str | None = None
    quality_flags: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class SourceCandidate:
    url: str
    domain: str | None
    rank: int
    metadata: ArticleMetadata
    event_count: int = 0
    mention_count: int = 0
    source_score: float = 0
    first_seen_at: datetime | None = None
    latest_seen_at: datetime | None = None
    event_root_codes: list[str] = field(default_factory=list)
    actors: list[str] = field(default_factory=list)
    metadata_fetched: bool = True


@dataclass
class StoryDraft:
    key: str
    representative_title: str
    sources: list[SourceCandidate] = field(default_factory=list)
    event_ids: set[int] = field(default_factory=set)
    mention_count: int = 0
    first_seen_at: datetime | None = None
    last_seen_at: datetime | None = None
    topics: list[dict[str, int | str]] = field(default_factory=list)
    entities: list[dict[str, int | str]] = field(default_factory=list)
    quality_flags: set[str] = field(default_factory=set)


class ArticleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.meta: list[dict[str, str]] = []
        self.links: list[dict[str, str]] = []
        self.title_parts: list[str] = []
        self.paragraphs: list[str] = []
        self.jsonld: list[str] = []
        self.language: str | None = None
        self._in_title = False
        self._in_paragraph = False
        self._paragraph_parts: list[str] = []
        self._in_jsonld = False
        self._jsonld_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {key: value or "" for key, value in attrs}
        if tag == "html":
            self.language = attr_map.get("lang") or self.language
        if tag == "meta":
            self.meta.append(attr_map)
        elif tag == "link":
            self.links.append(attr_map)
        elif tag == "title":
            self._in_title = True
        elif tag == "p":
            self._in_paragraph = True
            self._paragraph_parts = []
        elif tag == "script" and attr_map.get("type") == "application/ld+json":
            self._in_jsonld = True
            self._jsonld_parts = []

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False
        elif tag == "p" and self._in_paragraph:
            paragraph = clean_text(" ".join(self._paragraph_parts))
            if len(paragraph) >= 45 and not is_boilerplate(paragraph):
                self.paragraphs.append(paragraph)
            self._in_paragraph = False
        elif tag == "script" and self._in_jsonld:
            self.jsonld.append("".join(self._jsonld_parts))
            self._in_jsonld = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)
        if self._in_paragraph:
            self._paragraph_parts.append(data)
        if self._in_jsonld:
            self._jsonld_parts.append(data)


def clean_text(value: str | None) -> str:
    return unescape(re.sub(r"\s+", " ", value or "").strip())


def is_boilerplate(value: str) -> bool:
    lowered = value.lower()
    fragments = (
        "saved items",
        "subscribe",
        "privacy policy",
        "cookie",
        "advertisement",
        "sign up",
        "remove items from your saved list",
    )
    return any(fragment in lowered for fragment in fragments)


def meta_value(parser: ArticleParser, *keys: str) -> str | None:
    wanted = {key.lower() for key in keys}
    for item in parser.meta:
        name = (
            item.get("property")
            or item.get("name")
            or item.get("itemprop")
            or item.get("itemProp")
            or ""
        ).lower()
        if name in wanted and item.get("content"):
            return clean_text(item["content"])
    return None


def canonical_url(parser: ArticleParser) -> str | None:
    for item in parser.links:
        if item.get("rel", "").lower() == "canonical" and item.get("href"):
            return clean_text(item["href"])
    return None


def jsonld_values(parser: ArticleParser) -> dict[str, str]:
    values: dict[str, str] = {}
    for payload in parser.jsonld:
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            continue
        stack: list[Any] = parsed if isinstance(parsed, list) else [parsed]
        while stack:
            item = stack.pop(0)
            if isinstance(item, list):
                stack.extend(item)
                continue
            if not isinstance(item, dict):
                continue
            graph = item.get("@graph")
            if isinstance(graph, list):
                stack.extend(graph)
            for key in ("headline", "description", "datePublished", "author"):
                if key not in item or key in values:
                    continue
                raw_value = item[key]
                if key == "author" and isinstance(raw_value, list):
                    names = [
                        clean_text(author.get("name"))
                        for author in raw_value
                        if isinstance(author, dict) and author.get("name")
                    ]
                    values[key] = ", ".join(names)
                elif isinstance(raw_value, dict):
                    values[key] = clean_text(raw_value.get("name"))
                else:
                    values[key] = clean_text(str(raw_value))
    return values


def parse_published_at(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            return parse_timestamp(value)
        except ValueError:
            return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def article_fingerprint(value: str | None, fallback_url: str = "") -> str:
    text = clean_text(value).lower()
    text = re.sub(r"\|.*$", "", text)
    words = re.findall(r"[a-z0-9\u4e00-\u9fff]+", text)
    stop_words = {"the", "a", "an", "to", "from", "in", "of", "and", "s"}
    useful = [word for word in words if word not in stop_words]
    if useful:
        return " ".join(useful[:12])
    parsed = urlparse(fallback_url)
    slug = parsed.path.strip("/").split("/")[-1] or parsed.netloc
    cleaned_slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", " ", slug).strip().lower()
    return cleaned_slug or stable_key(fallback_url)


def stable_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def fetch_article_metadata(url: str, timeout_seconds: int) -> ArticleMetadata:
    try:
        response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout_seconds)
    except requests.RequestException as error:
        return ArticleMetadata(
            url=url,
            source_domain=domain_from_url(url),
            fetch_status="failed",
            error_message=str(error)[:500],
            quality_flags=["fetch_failed"],
        )

    if response.status_code >= 400:
        return ArticleMetadata(
            url=url,
            source_domain=domain_from_url(url),
            fetch_status="failed",
            http_status=response.status_code,
            error_message=f"HTTP {response.status_code}",
            quality_flags=["fetch_failed"],
        )

    parser = ArticleParser()
    parser.feed(response.text[:700_000])
    jsonld = jsonld_values(parser)
    title = (
        meta_value(parser, "og:title", "twitter:title", "title")
        or jsonld.get("headline")
        or clean_text(" ".join(parser.title_parts))
        or None
    )
    description = (
        meta_value(parser, "description", "og:description", "twitter:description")
        or jsonld.get("description")
        or None
    )
    published_value = meta_value(parser, "article:published_time", "pubdate", "datePublished")
    published_at = parse_published_at(published_value or jsonld.get("datePublished"))
    excerpt = clean_text(" ".join(parser.paragraphs[:4]))[:MAX_EXCERPT_LENGTH] or description
    flags: list[str] = []
    if not title:
        flags.append("missing_title")
    if not published_at:
        flags.append("missing_published_at")

    return ArticleMetadata(
        url=url,
        canonical_url=canonical_url(parser),
        source_domain=domain_from_url(url),
        title=title,
        description=description,
        site_name=meta_value(parser, "og:site_name"),
        author=meta_value(parser, "author") or jsonld.get("author"),
        published_at=published_at,
        language=parser.language,
        excerpt=excerpt,
        fetch_status="success",
        http_status=response.status_code,
        quality_flags=flags,
    )


def split_semicolon(value: str | None) -> list[str]:
    if not value:
        return []
    return [clean_text(item) for item in value.split(";") if clean_text(item)]


def clean_theme(value: str) -> str:
    normalized = value.upper()
    for key, label in THEME_LABELS.items():
        if key in normalized:
            return label
    if normalized.startswith(NOISY_THEME_PREFIXES):
        return ""
    value = re.sub(r"^(TAX_|USPEC_|WB_)", "", value)
    value = value.replace("_", " ")
    value = re.sub(r"\b[A-Za-z]?\d+\b", "", value)
    return clean_text(value).title()


def clean_entity(value: str) -> str:
    return clean_text(value).title()


def parse_locations(value: str | None) -> list[str]:
    locations: list[str] = []
    for item in split_semicolon(value):
        parts = item.split("#")
        if len(parts) > 1 and parts[1]:
            locations.append(clean_entity(parts[1]))
    return locations


def tone_from_raw(value: str | None) -> float | None:
    if not value:
        return None
    return parse_float(value.split(",")[0])


def top_counts(values: Iterable[str], limit: int = 8) -> list[dict[str, int | str]]:
    return [{"name": name, "count": count} for name, count in Counter(values).most_common(limit)]


def read_system_int(conn: Connection, key: str, default: int) -> int:
    with conn.cursor() as cur:
        cur.execute("select value from system_parameters where key = %s", (key,))
        row = cur.fetchone()
    if not row:
        return default
    try:
        return int(row[0])
    except (TypeError, ValueError):
        return default


def read_system_bool(conn: Connection, key: str, default: bool) -> bool:
    with conn.cursor() as cur:
        cur.execute("select value from system_parameters where key = %s", (key,))
        row = cur.fetchone()
    if not row:
        return default
    return str(row[0]).lower() in {"true", "1", "yes", "on"}


def int_value(value: Any, default: int = 0) -> int:
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def float_value(value: Any, default: float = 0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [clean_text(str(item)) for item in value if clean_text(str(item))]
    if isinstance(value, tuple):
        return [clean_text(str(item)) for item in value if clean_text(str(item))]
    return []


def upsert_article_metadata(conn: Connection, article: ArticleMetadata) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into article_metadata (
              url, canonical_url, source_domain, title, description, site_name, author, published_at,
              language, excerpt, fetch_status, http_status, error_message, quality_flags,
              fetched_at, updated_at
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now())
            on conflict (url) do update set
              canonical_url = excluded.canonical_url,
              source_domain = excluded.source_domain,
              title = excluded.title,
              description = excluded.description,
              site_name = excluded.site_name,
              author = excluded.author,
              published_at = excluded.published_at,
              language = excluded.language,
              excerpt = excluded.excerpt,
              fetch_status = excluded.fetch_status,
              http_status = excluded.http_status,
              error_message = excluded.error_message,
              quality_flags = excluded.quality_flags,
              fetched_at = excluded.fetched_at,
              updated_at = now()
            """,
            (
                article.url,
                article.canonical_url,
                article.source_domain,
                article.title,
                article.description,
                article.site_name,
                article.author,
                article.published_at,
                article.language,
                article.excerpt,
                article.fetch_status,
                article.http_status,
                article.error_message,
                Jsonb(article.quality_flags),
            ),
        )


def article_from_row(row: dict[str, Any]) -> ArticleMetadata:
    return ArticleMetadata(
        url=row["url"],
        canonical_url=row["canonical_url"],
        source_domain=row["source_domain"],
        title=row["title"],
        description=row["description"],
        site_name=row["site_name"],
        author=row["author"],
        published_at=row["published_at"],
        language=row["language"],
        excerpt=row["excerpt"],
        fetch_status=row["fetch_status"],
        http_status=row["http_status"],
        error_message=row["error_message"],
        quality_flags=list(row["quality_flags"] or []),
    )


def ensure_article_metadata(
    conn: Connection,
    url: str,
    timeout_seconds: int,
    fetcher: Callable[[str, int], ArticleMetadata] = fetch_article_metadata,
    force: bool = False,
) -> ArticleMetadata:
    if not force:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("select * from article_metadata where url = %s", (url,))
            row = cur.fetchone()
        if row and row["fetch_status"] == "success":
            return article_from_row(dict(row))
        conn.commit()

    article = fetcher(url, timeout_seconds)
    upsert_article_metadata(conn, article)
    conn.commit()
    return article


def failed_article_metadata(url: str, error: Exception) -> ArticleMetadata:
    return ArticleMetadata(
        url=url,
        source_domain=domain_from_url(url),
        fetch_status="failed",
        error_message=str(error)[:500],
        quality_flags=["fetch_failed"],
    )


def cached_article_metadata(conn: Connection, urls: Sequence[str]) -> dict[str, ArticleMetadata]:
    if not urls:
        return {}
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select *
            from article_metadata
            where url = any(%s) and fetch_status = 'success'
            """,
            (list(urls),),
        )
        rows = cur.fetchall()
    conn.commit()
    return {str(row["url"]): article_from_row(dict(row)) for row in rows}


def fetch_articles(
    urls: Sequence[str],
    timeout_seconds: int,
    fetcher: Callable[[str, int], ArticleMetadata],
    fetch_concurrency: int,
) -> dict[str, ArticleMetadata]:
    unique_urls = list(dict.fromkeys(urls))
    if not unique_urls:
        return {}
    max_workers = max(1, min(fetch_concurrency, len(unique_urls)))
    if max_workers == 1:
        articles: dict[str, ArticleMetadata] = {}
        for url in unique_urls:
            try:
                articles[url] = fetcher(url, timeout_seconds)
            except Exception as error:  # pragma: no cover - defensive guard for custom fetchers.
                articles[url] = failed_article_metadata(url, error)
        return articles

    concurrent_articles: dict[str, ArticleMetadata] = {}
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(fetcher, url, timeout_seconds): url for url in unique_urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                concurrent_articles[url] = future.result()
            except Exception as error:  # pragma: no cover - defensive guard for custom fetchers.
                concurrent_articles[url] = failed_article_metadata(url, error)
    return concurrent_articles


def source_candidates_for_rows(
    conn: Connection,
    source_rows: Sequence[dict[str, Any]],
    timeout_seconds: int,
    fetcher: Callable[[str, int], ArticleMetadata],
    force_fetch: bool,
    fetch_concurrency: int,
    fetch_urls: Sequence[str],
) -> list[SourceCandidate]:
    urls = [str(row["source_url"]) for row in source_rows]
    metadata_by_url = {} if force_fetch else cached_article_metadata(conn, urls)
    fetch_url_list = list(dict.fromkeys(fetch_urls))
    fetch_url_set = set(fetch_url_list)
    missing_urls = [url for url in fetch_url_list if url not in metadata_by_url]
    if missing_urls:
        fetched = fetch_articles(missing_urls, timeout_seconds, fetcher, fetch_concurrency)
        for article in fetched.values():
            upsert_article_metadata(conn, article)
        conn.commit()
        metadata_by_url.update(fetched)

    sources: list[SourceCandidate] = []
    for source_row in source_rows:
        url = str(source_row["source_url"])
        metadata = metadata_by_url.get(url)
        metadata_fetched = metadata is not None and url in fetch_url_set
        if metadata is None:
            metadata = ArticleMetadata(
                url=url,
                source_domain=source_row["source_domain"] or domain_from_url(url),
                fetch_status="skipped",
                quality_flags=["metadata_not_fetched"],
            )
        sources.append(
            SourceCandidate(
                url=url,
                domain=source_row["source_domain"] or metadata.source_domain or domain_from_url(url),
                rank=int_value(source_row.get("source_rank"), 100),
                metadata=metadata,
                event_count=int_value(source_row.get("event_count")),
                mention_count=int_value(source_row.get("mention_count")),
                source_score=float_value(source_row.get("source_score")),
                first_seen_at=source_row.get("first_seen_at"),
                latest_seen_at=source_row.get("latest_seen_at"),
                event_root_codes=string_list(source_row.get("event_root_codes")),
                actors=string_list(source_row.get("actors")),
                metadata_fetched=metadata_fetched,
            )
        )
    return sources


def parse_gkg_for_day(conn: Connection, day: date, document_urls: Sequence[str] | None = None) -> int:
    start_at = datetime(day.year, day.month, day.day, tzinfo=UTC)
    end_at = start_at + timedelta(days=1)
    parsed = 0
    params: list[Any] = [start_at, end_at]
    url_filter = ""
    if document_urls:
        params.append(list(document_urls))
        url_filter = "and raw_row->>4 = any(%s)"
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""
            select raw_id, source_file_timestamp, raw_row
            from gdelt_gkg_raw
            where source_file_timestamp >= %s and source_file_timestamp < %s
              {url_filter}
            """,
            params,
        )
        rows = cur.fetchall()

    for row in rows:
        raw_row = list(row["raw_row"])
        if len(raw_row) < 5 or not raw_row[4]:
            continue
        document_identifier = raw_row[4]
        raw_themes = raw_row[7] if len(raw_row) > 7 else None
        raw_persons = raw_row[11] if len(raw_row) > 11 else None
        themes = [theme for item in split_semicolon(raw_themes)[:30] if (theme := clean_theme(item))]
        persons = [clean_entity(item) for item in split_semicolon(raw_persons)[:20]]
        organizations = [
            clean_entity(item) for item in split_semicolon(raw_row[13] if len(raw_row) > 13 else None)[:20]
        ]
        locations = parse_locations(raw_row[9] if len(raw_row) > 9 else None)[:20]
        entities = [("person", name) for name in persons]
        entities.extend(("organization", name) for name in organizations)
        entities.extend(("location", name) for name in locations)
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into gkg_documents (
                  document_identifier, gkg_record_id, source_common_name, source_file_timestamp,
                  tone, raw_tone, theme_count, entity_count, raw_id, parsed_at
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                on conflict (document_identifier) do update set
                  gkg_record_id = excluded.gkg_record_id,
                  source_common_name = excluded.source_common_name,
                  source_file_timestamp = excluded.source_file_timestamp,
                  tone = excluded.tone,
                  raw_tone = excluded.raw_tone,
                  theme_count = excluded.theme_count,
                  entity_count = excluded.entity_count,
                  raw_id = excluded.raw_id,
                  parsed_at = now()
                """,
                (
                    document_identifier,
                    raw_row[0] if raw_row else None,
                    raw_row[3] if len(raw_row) > 3 else None,
                    row["source_file_timestamp"],
                    tone_from_raw(raw_row[15] if len(raw_row) > 15 else None),
                    raw_row[15] if len(raw_row) > 15 else None,
                    len(themes),
                    len(entities),
                    row["raw_id"],
                ),
            )
            cur.execute("delete from gkg_themes where document_identifier = %s", (document_identifier,))
            cur.execute("delete from gkg_entities where document_identifier = %s", (document_identifier,))
            for theme, weight in Counter(themes).items():
                cur.execute(
                    """
                    insert into gkg_themes (document_identifier, theme, weight)
                    values (%s, %s, %s)
                    on conflict (document_identifier, theme) do update set weight = excluded.weight
                    """,
                    (document_identifier, theme, weight),
                )
            for (entity_type, entity_name), weight in Counter(entities).items():
                cur.execute(
                    """
                    insert into gkg_entities (document_identifier, entity_type, entity_name, weight)
                    values (%s, %s, %s, %s)
                    on conflict (document_identifier, entity_type, entity_name) do update
                    set weight = excluded.weight
                    """,
                    (document_identifier, entity_type, entity_name, weight),
                )
        parsed += 1
    return parsed


def is_old_article(published_at: datetime | None, data_date: date) -> bool:
    if published_at is None:
        return False
    return abs((published_at.date() - data_date).days) > OLD_ARTICLE_DAYS


def source_quality_flags(source: SourceCandidate, data_date: date) -> set[str]:
    flags = set(source.metadata.quality_flags)
    if not source.metadata_fetched:
        flags.add("metadata_not_fetched")
    if source.metadata.fetch_status == "failed":
        flags.add("fetch_failed")
    elif source.metadata.fetch_status == "skipped":
        flags.add("metadata_not_fetched")
    if source.metadata.fetch_status in {"failed", "skipped"} or not source.metadata_fetched:
        return flags
    if not source.metadata.title:
        flags.add("missing_title")
    if not source.metadata.published_at:
        flags.add("missing_published_at")
    if is_old_article(source.metadata.published_at, data_date):
        flags.add("old_article")
    return flags


def selected_hotspot_ids(conn: Connection, day: date, top_per_channel: int) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id
            from (
              select id,
                     row_number() over (
                       partition by channel order by heat_score desc, event_count desc
                     ) as rank
              from map_hotspots
              where data_date = %s
            ) ranked
            where rank <= %s
            order by id
            """,
            (day, top_per_channel),
        )
        return [int(row[0]) for row in cur.fetchall()]


def rebuild_hotspot_sources(
    conn: Connection,
    hotspot: dict[str, Any],
    candidate_limit: int,
    max_per_domain: int = MAX_CANDIDATES_PER_DOMAIN,
) -> list[dict[str, Any]]:
    day = hotspot["data_date"]
    start_at = datetime(day.year, day.month, day.day, tzinfo=UTC)
    end_at = start_at + timedelta(days=1)
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            with url_events as (
              select e.source_url,
                     e.source_domain,
                     e.global_event_id,
                     coalesce(e.date_added, e.event_datetime) as seen_at,
                     e.event_root_code,
                     e.actor1_name,
                     e.actor2_name
              from gdelt_events_clean e
              where e.event_date = %s
                and e.region_key = %s
                and e.channel = %s
                and e.source_url is not null
              union all
              select m.source_url,
                     m.source_domain,
                     e.global_event_id,
                     coalesce(m.mention_time_date, e.date_added, e.event_datetime) as seen_at,
                     e.event_root_code,
                     e.actor1_name,
                     e.actor2_name
              from gdelt_events_clean e
              join gdelt_mentions_clean m on m.global_event_id = e.global_event_id
              where e.event_date = %s
                and e.region_key = %s
                and e.channel = %s
                and m.source_url is not null
            ),
            url_stats as (
              select source_url,
                     max(nullif(source_domain, '')) as source_domain,
                     count(distinct global_event_id)::int as event_count,
                     count(*)::int as mention_count,
                     min(seen_at) as first_seen_at,
                     max(seen_at) as latest_seen_at,
                     array_remove(array_agg(distinct event_root_code), null) as event_root_codes,
                     (
                       array_remove(array_agg(distinct actor1_name), null)
                       || array_remove(array_agg(distinct actor2_name), null)
                     ) as actors
              from url_events
              group by source_url
            ),
            scored as (
              select *,
                     exists (
                       select 1
                       from gdelt_gkg_raw g
                       where g.raw_row->>4 = url_stats.source_url
                         and g.source_file_timestamp >= %s
                         and g.source_file_timestamp < %s
                       limit 1
                     ) as has_gkg,
                     (
                       event_count * 5
                       + mention_count * 2
                       + case when exists (
                           select 1
                           from gdelt_gkg_raw g
                           where g.raw_row->>4 = url_stats.source_url
                             and g.source_file_timestamp >= %s
                             and g.source_file_timestamp < %s
                           limit 1
                         ) then 10 else 0 end
                     )::numeric as source_score
              from url_stats
            ),
            domain_limited as (
              select *,
                     row_number() over (
                       partition by coalesce(source_domain, source_url)
                       order by source_score desc, event_count desc, mention_count desc, source_url
                     ) as domain_rank
              from scored
            ),
            ranked as (
              select *,
                     row_number() over (
                       order by source_score desc, event_count desc, mention_count desc, source_url
                     ) as source_rank
              from domain_limited
              where domain_rank <= %s
            )
            select source_url, source_domain, source_rank, event_count, mention_count,
                   source_score, first_seen_at, latest_seen_at, event_root_codes, actors
            from ranked
            order by source_rank
            limit %s
            """,
            (
                day,
                hotspot["region_key"],
                hotspot["channel"],
                day,
                hotspot["region_key"],
                hotspot["channel"],
                start_at,
                end_at,
                start_at,
                end_at,
                max_per_domain,
                candidate_limit,
            ),
        )
        rows = [dict(row) for row in cur.fetchall()]

    with conn.cursor() as cur:
        cur.execute("delete from map_hotspot_sources where hotspot_id = %s", (hotspot["id"],))
        for row in rows:
            cur.execute(
                """
                insert into map_hotspot_sources (
                  hotspot_id, source_url, source_domain, source_rank, event_count, mention_count,
                  source_score, first_seen_at, latest_seen_at, event_root_codes, actors
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (hotspot_id, source_url) do update set
                  source_domain = excluded.source_domain,
                  source_rank = excluded.source_rank,
                  event_count = excluded.event_count,
                  mention_count = excluded.mention_count,
                  source_score = excluded.source_score,
                  first_seen_at = excluded.first_seen_at,
                  latest_seen_at = excluded.latest_seen_at,
                  event_root_codes = excluded.event_root_codes,
                  actors = excluded.actors
                """,
                (
                    hotspot["id"],
                    row["source_url"],
                    row["source_domain"] or domain_from_url(str(row["source_url"])),
                    row["source_rank"],
                    row["event_count"],
                    row["mention_count"],
                    row["source_score"],
                    row["first_seen_at"],
                    row["latest_seen_at"],
                    Jsonb(string_list(row["event_root_codes"])),
                    Jsonb(string_list(row["actors"])[:12]),
                ),
            )
    conn.commit()
    return fetch_hotspot_sources(conn, int(hotspot["id"]), candidate_limit)


def fetch_hotspot_sources(conn: Connection, hotspot_id: int, limit: int) -> list[dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select source_url, source_domain, source_rank, event_count, mention_count,
                   source_score, first_seen_at, latest_seen_at, event_root_codes, actors
            from map_hotspot_sources
            where hotspot_id = %s
            order by source_rank asc
            limit %s
            """,
            (hotspot_id, limit),
        )
        return [dict(row) for row in cur.fetchall()]


def source_urls_for_hotspots(
    conn: Connection,
    hotspot_ids: Sequence[int],
    limit_per_hotspot: int,
) -> list[str]:
    if not hotspot_ids:
        return []
    with conn.cursor() as cur:
        cur.execute(
            """
            select source_url
            from (
              select hotspot_id, source_url,
                     row_number() over (partition by hotspot_id order by source_rank asc) as rank
              from map_hotspot_sources
              where hotspot_id = any(%s)
            ) ranked
            where rank <= %s
            """,
            (list(hotspot_ids), limit_per_hotspot),
        )
        return [str(row[0]) for row in cur.fetchall()]


def group_gkg_stats(
    conn: Connection,
    document_identifiers: Sequence[str],
) -> tuple[list[dict[str, int | str]], list[dict[str, int | str]]]:
    if not document_identifiers:
        return [], []
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select theme as name, sum(weight)::int as count
            from gkg_themes
            where document_identifier = any(%s)
            group by theme
            order by count desc, theme
            limit 8
            """,
            (list(document_identifiers),),
        )
        topics = [{"name": row["name"], "count": int(row["count"])} for row in cur.fetchall()]
        cur.execute(
            """
            select entity_name as name, entity_type as type, sum(weight)::int as count
            from gkg_entities
            where document_identifier = any(%s)
            group by entity_name, entity_type
            order by count desc, entity_name
            limit 8
            """,
            (list(document_identifiers),),
        )
        entities = [
            {"name": row["name"], "type": row["type"], "count": int(row["count"])} for row in cur.fetchall()
        ]
    return topics, entities


def gkg_signatures(conn: Connection, document_identifiers: Sequence[str]) -> dict[str, list[str]]:
    if not document_identifiers:
        return {}
    signatures: dict[str, list[str]] = {}
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select document_identifier, theme as name
            from (
              select document_identifier, theme, weight,
                     row_number() over (partition by document_identifier order by weight desc, theme) as rank
              from gkg_themes
              where document_identifier = any(%s)
            ) ranked
            where rank <= 3
            """,
            (list(document_identifiers),),
        )
        for row in cur.fetchall():
            signatures.setdefault(str(row["document_identifier"]), []).append(str(row["name"]))
        cur.execute(
            """
            select document_identifier, entity_name as name
            from (
              select document_identifier, entity_name, weight,
                     row_number() over (
                       partition by document_identifier order by weight desc, entity_name
                     ) as rank
              from gkg_entities
              where document_identifier = any(%s)
            ) ranked
            where rank <= 3
            """,
            (list(document_identifiers),),
        )
        for row in cur.fetchall():
            signatures.setdefault(str(row["document_identifier"]), []).append(str(row["name"]))
    return {key: list(dict.fromkeys(value)) for key, value in signatures.items()}


def story_signal_key(source: SourceCandidate, gkg_signature: Sequence[str]) -> str | None:
    signal_parts = [*source.event_root_codes[:3], *source.actors[:4], *gkg_signature[:4]]
    if signal_parts:
        normalized = "|".join(clean_text(part).lower() for part in signal_parts if clean_text(part))
        return stable_key(f"signal:{normalized}")
    return None


def story_title_key(source: SourceCandidate) -> str | None:
    title_text = source.metadata.title or source.metadata.description
    if title_text:
        return stable_key(f"title:{article_fingerprint(title_text, source.url)}")
    return None


def story_group_key(source: SourceCandidate, gkg_signature: Sequence[str]) -> str:
    title_key = story_title_key(source)
    if title_key:
        return title_key
    signal_key = story_signal_key(source, gkg_signature)
    if signal_key:
        return signal_key
    return stable_key(f"url:{article_fingerprint(None, source.url)}")


def source_display_title(source: SourceCandidate) -> str:
    return (
        source.metadata.title
        or source.metadata.description
        or (f"{source.domain} 等来源" if source.domain else "")
        or source.url
    )


def refresh_story_title(story: StoryDraft) -> None:
    fetched_sources = [
        source for source in story.sources if source.metadata.title or source.metadata.description
    ]
    best_source = min(fetched_sources or story.sources, key=lambda source: source.rank)
    story.representative_title = clean_text(source_display_title(best_source))


def build_story_drafts(
    conn: Connection,
    hotspot: dict[str, Any],
    sources: Sequence[SourceCandidate],
    compute_event_stats: bool,
) -> list[StoryDraft]:
    signatures = gkg_signatures(conn, [source.url for source in sources])
    title_keys: dict[str, str] = {}
    signal_keys: dict[str, str | None] = {}
    signal_to_title_keys: dict[str, set[str]] = {}

    for source in sources:
        title_key = story_title_key(source)
        signal_key = story_signal_key(source, signatures.get(source.url, []))
        if title_key:
            title_keys[source.url] = title_key
        if signal_key:
            signal_keys[source.url] = signal_key
        if title_key and signal_key:
            signal_to_title_keys.setdefault(signal_key, set()).add(title_key)

    signal_aliases = {
        signal_key: next(iter(mapped_title_keys))
        for signal_key, mapped_title_keys in signal_to_title_keys.items()
        if len(mapped_title_keys) == 1
    }

    grouped: dict[str, StoryDraft] = {}
    for source in sources:
        title_key = title_keys.get(source.url)
        signal_key = signal_keys.get(source.url)
        key = title_key or (signal_aliases.get(signal_key) if signal_key else None)
        if key is None:
            key = signal_key or story_group_key(source, signatures.get(source.url, []))
        story = grouped.setdefault(
            key,
            StoryDraft(key=key, representative_title=source_display_title(source)),
        )
        story.sources.append(source)
        story.quality_flags.update(source_quality_flags(source, hotspot["data_date"]))

    for story in grouped.values():
        if compute_event_stats:
            urls = list(dict.fromkeys([source.url for source in story.sources]))
            event_ids, mention_count, first_seen, last_seen = group_event_stats(conn, hotspot, urls)
            story.event_ids = event_ids
            story.mention_count = mention_count
            story.first_seen_at = first_seen
            story.last_seen_at = last_seen
        else:
            story.mention_count = sum(source.mention_count for source in story.sources)
            first_seen_values = [
                source.first_seen_at for source in story.sources if source.first_seen_at is not None
            ]
            latest_seen_values = [
                source.latest_seen_at for source in story.sources if source.latest_seen_at is not None
            ]
            story.first_seen_at = min(first_seen_values, default=None)
            story.last_seen_at = max(latest_seen_values, default=None)
        doc_ids = list(
            dict.fromkeys(
                candidate
                for source in story.sources
                for candidate in (source.url, source.metadata.canonical_url)
                if candidate
            )
        )
        topics, entities = group_gkg_stats(conn, doc_ids)
        story.topics = topics
        story.entities = entities
        refresh_story_title(story)
        if len(story.sources) > 1:
            story.quality_flags.add("same_title_repost")
        if not topics and not entities:
            story.quality_flags.add("gkg_missing")

    return sorted(
        grouped.values(),
        key=lambda item: (
            len({source.domain for source in item.sources if source.domain}),
            len(item.sources),
            item.mention_count,
            sum(source.event_count for source in item.sources),
        ),
        reverse=True,
    )


def fetch_urls_for_story_coverage(
    candidate_rows: Sequence[dict[str, Any]],
    preview_stories: Sequence[StoryDraft],
    fetch_limit: int,
) -> list[str]:
    selected: list[str] = []
    for story in preview_stories[:5]:
        best_source = min(story.sources, key=lambda source: source.rank)
        selected.append(best_source.url)
    for row in candidate_rows:
        selected.append(str(row["source_url"]))
    return list(dict.fromkeys(selected))[:fetch_limit]


def group_event_stats(
    conn: Connection,
    hotspot: dict[str, Any],
    urls: Sequence[str],
) -> tuple[set[int], int, datetime | None, datetime | None]:
    if not urls:
        return set(), 0, None, None
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            select e.global_event_id,
                   coalesce(m.mention_time_date, e.date_added) as seen_at
            from gdelt_events_clean e
            left join gdelt_mentions_clean m
              on m.global_event_id = e.global_event_id
             and m.source_url = any(%s)
            where e.event_date = %s
              and e.region_key = %s
              and e.channel = %s
              and (e.source_url = any(%s) or m.source_url is not null)
            """,
            (list(urls), hotspot["data_date"], hotspot["region_key"], hotspot["channel"], list(urls)),
        )
        rows = cur.fetchall()
    event_ids = {int(row["global_event_id"]) for row in rows}
    seen_values = [row["seen_at"] for row in rows if row["seen_at"] is not None]
    return event_ids, len(rows), min(seen_values, default=None), max(seen_values, default=None)


def story_summary(story: StoryDraft, hotspot: dict[str, Any]) -> str:
    domains = sorted({source.domain for source in story.sources if source.domain})
    topic_text = "、".join(str(topic["name"]) for topic in story.topics[:3])
    domain_text = "、".join(domains[:3])
    if topic_text:
        return (
            f"{hotspot['region_name']}的{hotspot['channel']}热点中，"
            f"多个来源围绕“{story.representative_title}”报道，主题集中在{topic_text}。"
        )
    if domain_text:
        return (
            f"{hotspot['region_name']}的{hotspot['channel']}热点中，"
            f"{domain_text}等来源围绕“{story.representative_title}”报道。"
        )
    return (
        f"{hotspot['region_name']}的{hotspot['channel']}热点中，"
        f"来源围绕“{story.representative_title}”报道。"
    )


def build_importance_reasons(hotspot: dict[str, Any], story_count: int) -> list[str]:
    reasons: list[str] = []
    if hotspot["event_count"] >= 100:
        reasons.append(f"该热点聚合了 {hotspot['event_count']} 个结构化事件，事件密度较高。")
    if hotspot["mention_count"] >= 500:
        reasons.append(f"相关报道提及达到 {hotspot['mention_count']} 次，说明报道信号较强。")
    if hotspot["source_domain_count"] >= 20:
        reasons.append(f"来源覆盖 {hotspot['source_domain_count']} 个域名，来源分布相对多样。")
    if story_count > 1:
        reasons.append(f"热点内拆分出 {story_count} 个主要故事，说明该地区同频道下存在多个议题。")
    if hotspot["channel"] in {"冲突", "灾害"}:
        reasons.append(f"{hotspot['channel']}类热点通常对普通读者有更高即时关注价值。")
    if not reasons:
        reasons.append("该热点进入地图展示，主要因为事件、提及和来源信号共同达到当前筛选阈值。")
    return reasons


def build_warnings(
    hotspot: dict[str, Any],
    stories: Sequence[StoryDraft],
    source_count: int,
    duplicate_count: int,
    old_count: int,
    missing_title_count: int,
    gkg_covered_sources: int,
) -> list[str]:
    warnings: list[str] = []
    if source_count <= 1:
        warnings.append("当前仅有单一代表来源，摘要可能无法覆盖多方视角。")
    elif source_count < 3:
        warnings.append("当前代表来源较少，热点解释仍需结合原文判断。")
    if duplicate_count > 0:
        warnings.append("部分来源标题高度相似，可能是同源转载或集团同步稿。")
    if old_count > 0:
        warnings.append("部分来源发布时间与热点日期相差较大，已作为旧文风险处理。")
    if missing_title_count > 0:
        warnings.append("部分来源缺少标题元数据，故事组可能不完整。")
    if gkg_covered_sources == 0:
        warnings.append("当前没有匹配到主题/实体数据，已回退到事件和来源信息解释。")
    if not stories:
        warnings.append("当前仅有结构化事件数据，来源增强信息仍在补充。")
    if hotspot["source_count"] <= 3:
        warnings.append("热点整体来源数量较少，不宜视为稳定结论。")
    return warnings


def insert_story_group(conn: Connection, hotspot: dict[str, Any], story: StoryDraft) -> int:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into hotspot_story_groups (
              hotspot_id, story_key, representative_title, summary, event_count, mention_count,
              source_count, source_domain_count, first_seen_at, last_seen_at, topics, entities,
              quality_flags, updated_at
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            on conflict (hotspot_id, story_key) do update set
              representative_title = excluded.representative_title,
              summary = excluded.summary,
              event_count = excluded.event_count,
              mention_count = excluded.mention_count,
              source_count = excluded.source_count,
              source_domain_count = excluded.source_domain_count,
              first_seen_at = excluded.first_seen_at,
              last_seen_at = excluded.last_seen_at,
              topics = excluded.topics,
              entities = excluded.entities,
              quality_flags = excluded.quality_flags,
              updated_at = now()
            returning id
            """,
            (
                hotspot["id"],
                story.key,
                story.representative_title,
                story_summary(story, hotspot),
                len(story.event_ids),
                story.mention_count,
                len(story.sources),
                len({source.domain for source in story.sources if source.domain}),
                story.first_seen_at,
                story.last_seen_at,
                Jsonb(story.topics),
                Jsonb(story.entities),
                Jsonb(sorted(story.quality_flags)),
            ),
        )
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("Failed to upsert story group.")
        story_group_id = int(row[0])
        cur.execute("delete from story_group_sources where story_group_id = %s", (story_group_id,))
        display_sources = sorted(
            [source for source in story.sources if source.metadata_fetched],
            key=lambda source: source.rank,
        )[:5]
        if not display_sources:
            display_sources = sorted(story.sources, key=lambda source: source.rank)[:3]
        duplicate_of = display_sources[0].url if display_sources else None
        for index, source in enumerate(display_sources, start=1):
            cur.execute(
                """
                insert into story_group_sources (
                  story_group_id, source_url, source_domain, title, published_at, source_rank,
                  is_duplicate, duplicate_of_url, quality_flags
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (story_group_id, source_url) do nothing
                """,
                (
                    story_group_id,
                    source.url,
                    source.domain,
                    source.metadata.title,
                    source.metadata.published_at,
                    index,
                    index > 1,
                    duplicate_of if index > 1 else None,
                    Jsonb(sorted(source_quality_flags(source, hotspot["data_date"]))),
                ),
            )
    return story_group_id


def upsert_hotspot_explanation(
    conn: Connection,
    hotspot: dict[str, Any],
    stories: Sequence[StoryDraft],
    source_quality: dict[str, Any],
    warnings: list[str],
) -> None:
    topics = top_counts(
        str(topic["name"]) for story in stories for topic in story.topics for _ in range(int(topic["count"]))
    )
    entities = top_counts(
        str(entity["name"])
        for story in stories
        for entity in story.entities
        for _ in range(int(entity["count"]))
    )
    story_count = len(stories)
    topic_text = "、".join(str(topic["name"]) for topic in topics[:3])
    candidate_count = int_value(source_quality.get("candidateSourceCount"))
    fetched_count = int_value(source_quality.get("fetchedSourceCount"))
    if story_count and topic_text:
        what_happened = (
            f"{hotspot['data_date']}，{hotspot['region_name']}出现{hotspot['channel']}类热点。"
            f"系统从 {hotspot['event_count']} 个事件和 {hotspot['source_count']} 个来源中筛选 "
            f"{candidate_count} 个候选来源，抓取 {fetched_count} 个代表来源，识别出 "
            f"{story_count} 个主要故事；主题集中在{topic_text}。"
        )
    elif story_count:
        what_happened = (
            f"{hotspot['data_date']}，{hotspot['region_name']}出现{hotspot['channel']}类热点。"
            f"系统从 {hotspot['event_count']} 个事件中筛选 {candidate_count} 个候选来源，"
            f"抓取 {fetched_count} 个代表来源，识别出 {story_count} 个主要故事。"
        )
    else:
        what_happened = hotspot["summary"]

    with conn.cursor() as cur:
        cur.execute(
            """
            insert into hotspot_explanations (
              hotspot_id, title, what_happened, importance_reasons, source_quality,
              uncertainty_warnings, topics, entities, generated_at
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, now())
            on conflict (hotspot_id) do update set
              title = excluded.title,
              what_happened = excluded.what_happened,
              importance_reasons = excluded.importance_reasons,
              source_quality = excluded.source_quality,
              uncertainty_warnings = excluded.uncertainty_warnings,
              topics = excluded.topics,
              entities = excluded.entities,
              generated_at = now()
            """,
            (
                hotspot["id"],
                f"{hotspot['region_name']} · {hotspot['channel']}热点",
                what_happened,
                Jsonb(build_importance_reasons(hotspot, story_count)),
                Jsonb(source_quality),
                Jsonb(warnings),
                Jsonb(topics),
                Jsonb(entities),
            ),
        )


def enrich_hotspot(
    conn: Connection,
    hotspot_id: int,
    sources_per_hotspot: int,
    candidate_sources_per_hotspot: int,
    fetch_timeout_seconds: int,
    fetcher: Callable[[str, int], ArticleMetadata] = fetch_article_metadata,
    force_fetch: bool = False,
    parse_gkg_sources: bool = True,
    fetch_concurrency: int = DEFAULT_FETCH_CONCURRENCY,
    rebuild_sources: bool = True,
) -> dict[str, int]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("select * from map_hotspots where id = %s", (hotspot_id,))
        row = cur.fetchone()
    if row is None:
        return {"gkg_documents": 0, "hotspots": 0, "sources": 0, "stories": 0}
    hotspot = dict(row)

    source_rows = (
        rebuild_hotspot_sources(conn, hotspot, candidate_sources_per_hotspot)
        if rebuild_sources
        else fetch_hotspot_sources(conn, hotspot_id, candidate_sources_per_hotspot)
    )
    gkg_documents = 0
    if parse_gkg_sources:
        gkg_documents = parse_gkg_for_day(
            conn,
            hotspot["data_date"],
            [str(row["source_url"]) for row in source_rows],
        )
        conn.commit()
    preview_sources = source_candidates_for_rows(
        conn,
        source_rows,
        fetch_timeout_seconds,
        fetcher,
        force_fetch,
        fetch_concurrency,
        [],
    )
    preview_stories = build_story_drafts(conn, hotspot, preview_sources, compute_event_stats=False)
    fetch_urls = fetch_urls_for_story_coverage(source_rows, preview_stories, sources_per_hotspot)
    sources = source_candidates_for_rows(
        conn,
        source_rows,
        fetch_timeout_seconds,
        fetcher,
        force_fetch,
        fetch_concurrency,
        fetch_urls,
    )

    stories = build_story_drafts(conn, hotspot, sources, compute_event_stats=True)[:5]
    with conn.cursor() as cur:
        cur.execute("delete from hotspot_story_groups where hotspot_id = %s", (hotspot_id,))
        cur.execute("delete from hotspot_explanations where hotspot_id = %s", (hotspot_id,))
    for story in stories:
        insert_story_group(conn, hotspot, story)

    duplicate_count = sum(max(len(story.sources) - 1, 0) for story in stories)
    old_count = sum(
        1
        for source in sources
        if source.metadata_fetched and is_old_article(source.metadata.published_at, hotspot["data_date"])
    )
    missing_title_count = sum(
        1 for source in sources if source.metadata_fetched and not source.metadata.title
    )
    gkg_covered_sources = sum(
        1
        for story in stories
        for source in story.sources
        if story.topics or story.entities
    )
    first_seen_values = [story.first_seen_at for story in stories if story.first_seen_at is not None]
    last_seen_values = [story.last_seen_at for story in stories if story.last_seen_at is not None]
    source_quality = {
        "enhanced": bool(stories),
        "sourceCount": len(sources),
        "candidateSourceCount": len(sources),
        "fetchedSourceCount": sum(1 for source in sources if source.metadata_fetched),
        "sourceDomainCount": len({source.domain for source in sources if source.domain}),
        "storyCount": len(stories),
        "duplicateSourceCount": duplicate_count,
        "oldSourceCount": old_count,
        "missingTitleCount": missing_title_count,
        "gkgCoveredSourceCount": gkg_covered_sources,
        "firstMentionAt": min(first_seen_values).isoformat() if first_seen_values else None,
        "latestMentionAt": max(last_seen_values).isoformat() if last_seen_values else None,
    }
    warnings = build_warnings(
        hotspot,
        stories,
        len(sources),
        duplicate_count,
        old_count,
        missing_title_count,
        gkg_covered_sources,
    )
    upsert_hotspot_explanation(conn, hotspot, stories, source_quality, warnings)
    return {"gkg_documents": gkg_documents, "hotspots": 1, "sources": len(sources), "stories": len(stories)}


def enrich_day(
    conn: Connection,
    day: date,
    top_per_channel: int | None = None,
    sources_per_hotspot: int | None = None,
    candidate_sources_per_hotspot: int | None = None,
    fetch_timeout_seconds: int | None = None,
    fetch_concurrency: int | None = None,
    fetcher: Callable[[str, int], ArticleMetadata] = fetch_article_metadata,
    force_fetch: bool = False,
) -> dict[str, int]:
    if not read_system_bool(conn, "p2_enrichment_enabled", True):
        return {"gkg_documents": 0, "hotspots": 0, "sources": 0, "stories": 0}
    top_per_channel = top_per_channel or read_system_int(conn, "p2_top_hotspots_per_channel", 20)
    sources_per_hotspot = sources_per_hotspot or read_system_int(
        conn,
        "p2_sources_per_hotspot",
        DEFAULT_SOURCES_PER_HOTSPOT,
    )
    candidate_sources_per_hotspot = candidate_sources_per_hotspot or read_system_int(
        conn,
        "p2_candidate_sources_per_hotspot",
        DEFAULT_CANDIDATE_SOURCES_PER_HOTSPOT,
    )
    fetch_timeout_seconds = fetch_timeout_seconds or read_system_int(conn, "p2_fetch_timeout_seconds", 8)
    fetch_concurrency = fetch_concurrency or read_system_int(
        conn,
        "p2_fetch_concurrency",
        DEFAULT_FETCH_CONCURRENCY,
    )

    hotspot_ids = selected_hotspot_ids(conn, day, top_per_channel)
    stats = {"gkg_documents": 0, "hotspots": 0, "sources": 0, "stories": 0}
    for hotspot_id in hotspot_ids:
        hotspot_stats = enrich_hotspot(
            conn,
            hotspot_id,
            sources_per_hotspot,
            candidate_sources_per_hotspot,
            fetch_timeout_seconds,
            fetcher,
            force_fetch,
            parse_gkg_sources=True,
            fetch_concurrency=fetch_concurrency,
        )
        stats["gkg_documents"] += hotspot_stats["gkg_documents"]
        stats["hotspots"] += hotspot_stats["hotspots"]
        stats["sources"] += hotspot_stats["sources"]
        stats["stories"] += hotspot_stats["stories"]
    return stats


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build P2 hotspot explanations and story groups.")
    parser.add_argument("--date", help="Date to enrich, YYYY-MM-DD.")
    parser.add_argument("--hotspot-id", type=int, help="Only enrich one hotspot.")
    parser.add_argument("--url", help="Only fetch and cache one source URL.")
    parser.add_argument("--top-per-channel", type=int, help="Hotspots per channel for day mode.")
    parser.add_argument("--sources-per-hotspot", type=int, help="Representative URLs per hotspot.")
    parser.add_argument("--candidate-sources-per-hotspot", type=int, help="Candidate URLs per hotspot.")
    parser.add_argument("--timeout", type=int, help="Fetch timeout in seconds.")
    parser.add_argument("--fetch-concurrency", type=int, help="Concurrent URL fetches.")
    parser.add_argument(
        "--force-fetch",
        action="store_true",
        help="Refetch URLs even when metadata is cached.",
    )
    return parser.parse_args()


def main() -> None:
    load_environment()
    args = parse_args()
    timeout = args.timeout or 8
    with connect() as conn:
        if args.url:
            article = ensure_article_metadata(conn, args.url, timeout, force=args.force_fetch)
            conn.commit()
            print(f"Fetched {args.url}: {article.fetch_status}")
            return
        if args.hotspot_id:
            stats = enrich_hotspot(
                conn,
                args.hotspot_id,
                args.sources_per_hotspot
                or read_system_int(conn, "p2_sources_per_hotspot", DEFAULT_SOURCES_PER_HOTSPOT),
                args.candidate_sources_per_hotspot
                or read_system_int(
                    conn,
                    "p2_candidate_sources_per_hotspot",
                    DEFAULT_CANDIDATE_SOURCES_PER_HOTSPOT,
                ),
                timeout,
                force_fetch=args.force_fetch,
                fetch_concurrency=args.fetch_concurrency
                or read_system_int(conn, "p2_fetch_concurrency", DEFAULT_FETCH_CONCURRENCY),
            )
            conn.commit()
            print(f"Enriched hotspot {args.hotspot_id}: {stats}")
            return
        if not args.date:
            raise SystemExit("Provide --date, --hotspot-id, or --url.")
        day = datetime.strptime(args.date, "%Y-%m-%d").date()
        stats = enrich_day(
            conn,
            day,
            top_per_channel=args.top_per_channel,
            sources_per_hotspot=args.sources_per_hotspot,
            candidate_sources_per_hotspot=args.candidate_sources_per_hotspot,
            fetch_timeout_seconds=timeout,
            fetch_concurrency=args.fetch_concurrency,
            force_fetch=args.force_fetch,
        )
        conn.commit()
    print(f"Enriched {args.date}: {stats}")


if __name__ == "__main__":
    main()
