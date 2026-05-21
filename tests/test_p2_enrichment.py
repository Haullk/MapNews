from datetime import UTC, date, datetime
from typing import Any

from pytest import MonkeyPatch

from worker.p2_enrichment import (
    ArticleMetadata,
    ArticleParser,
    SourceCandidate,
    StoryDraft,
    article_fingerprint,
    build_story_drafts,
    fetch_article_metadata,
    fetch_urls_for_story_coverage,
    is_old_article,
    jsonld_values,
    meta_value,
    source_quality_flags,
    story_group_key,
)


def test_article_fingerprint_merges_syndicated_titles() -> None:
    assert (
        article_fingerprint("One key takeaway from Trump’s China visit should worry Australia")
        == article_fingerprint(
            "One key takeaway from Trump's China visit should worry Australia | Brisbane Times"
        )
    )


def test_article_parser_extracts_metadata_without_body_storage() -> None:
    parser = ArticleParser()
    parser.feed(
        """
        <html lang="en">
          <head>
            <title>Fallback title</title>
            <meta property="og:title" content="Readable title">
            <meta name="description" content="Short description">
            <script type="application/ld+json">
              {"@type":"NewsArticle","headline":"JSON title","datePublished":"2026-05-18T19:00:00Z"}
            </script>
          </head>
          <body><p>This is a useful article paragraph with enough text to keep as an excerpt.</p></body>
        </html>
        """
    )

    assert parser.language == "en"
    assert meta_value(parser, "og:title") == "Readable title"
    assert meta_value(parser, "description") == "Short description"
    assert jsonld_values(parser)["datePublished"] == "2026-05-18T19:00:00Z"
    assert parser.paragraphs == ["This is a useful article paragraph with enough text to keep as an excerpt."]


def test_source_quality_flags_detect_old_and_missing_metadata() -> None:
    article = ArticleMetadata(
        url="https://example.com/old",
        published_at=datetime(2013, 10, 12, tzinfo=UTC),
        quality_flags=["missing_title"],
    )
    source = SourceCandidate(url=article.url, domain="example.com", rank=1, metadata=article)

    flags = source_quality_flags(source, date(2026, 5, 18))

    assert "old_article" in flags
    assert "missing_title" in flags
    assert is_old_article(article.published_at, date(2026, 5, 18))


def test_source_quality_flags_distinguish_skipped_metadata() -> None:
    article = ArticleMetadata(url="https://example.com/skipped", fetch_status="skipped")
    source = SourceCandidate(
        url=article.url,
        domain="example.com",
        rank=1,
        metadata=article,
        metadata_fetched=False,
    )

    flags = source_quality_flags(source, date(2026, 5, 18))

    assert "metadata_not_fetched" in flags
    assert "fetch_failed" not in flags
    assert "missing_title" not in flags
    assert "missing_published_at" not in flags


def test_story_group_key_prefers_fetched_title_over_structured_signal() -> None:
    article = ArticleMetadata(url="https://example.com/a", title="Different headline")
    source = SourceCandidate(
        url=article.url,
        domain="example.com",
        rank=1,
        metadata=article,
        event_root_codes=["04"],
        actors=["Actor A", "Actor B"],
    )

    assert story_group_key(source, ["Trade"]) != story_group_key(
        SourceCandidate(
            url="https://example.com/b",
            domain="example.com",
            rank=2,
            metadata=ArticleMetadata(url="https://example.com/b", title="Another headline"),
            event_root_codes=["04"],
            actors=["Actor A", "Actor B"],
        ),
        ["Trade"],
    )


def test_build_story_drafts_aliases_unfetched_sources_to_single_title_signal(
    monkeypatch: MonkeyPatch,
) -> None:
    fetched = SourceCandidate(
        url="https://example.com/fetched",
        domain="example.com",
        rank=1,
        metadata=ArticleMetadata(url="https://example.com/fetched", title="Shared covered story"),
        event_root_codes=["04"],
        actors=["Actor A"],
        metadata_fetched=True,
    )
    skipped = SourceCandidate(
        url="https://other.example/skipped",
        domain="other.example",
        rank=2,
        metadata=ArticleMetadata(url="https://other.example/skipped", fetch_status="skipped"),
        event_root_codes=["04"],
        actors=["Actor A"],
        metadata_fetched=False,
    )

    monkeypatch.setattr(
        "worker.p2_enrichment.gkg_signatures",
        lambda _conn, _urls: {
            "https://example.com/fetched": ["Trade"],
            "https://other.example/skipped": ["Trade"],
        },
    )
    monkeypatch.setattr("worker.p2_enrichment.group_gkg_stats", lambda _conn, _doc_ids: ([], []))

    stories = build_story_drafts(
        None,  # type: ignore[arg-type]
        {"data_date": date(2026, 5, 18)},
        [fetched, skipped],
        compute_event_stats=False,
    )

    assert len(stories) == 1
    assert len(stories[0].sources) == 2


def test_fetch_url_budget_covers_top_story_groups_before_filling_rank() -> None:
    source_a = SourceCandidate(
        url="https://example.com/story-a",
        domain="example.com",
        rank=8,
        metadata=ArticleMetadata(url="https://example.com/story-a"),
    )
    source_b = SourceCandidate(
        url="https://other.example/story-b",
        domain="other.example",
        rank=20,
        metadata=ArticleMetadata(url="https://other.example/story-b"),
    )
    candidate_rows = [
        {"source_url": f"https://ranked.example/{index}"} for index in range(1, 10)
    ]

    urls = fetch_urls_for_story_coverage(
        candidate_rows,
        [
            StoryDraft(key="a", representative_title="A", sources=[source_a]),
            StoryDraft(key="b", representative_title="B", sources=[source_b]),
        ],
        5,
    )

    assert urls[:2] == ["https://example.com/story-a", "https://other.example/story-b"]
    assert len(urls) == 5


def test_fetch_article_metadata_reports_http_failures(monkeypatch: MonkeyPatch) -> None:
    class Response:
        status_code = 403
        text = ""

    def fake_get(*args: object, **kwargs: Any) -> Response:
        return Response()

    monkeypatch.setattr("worker.p2_enrichment.requests.get", fake_get)

    article = fetch_article_metadata("https://example.com/blocked", 1)

    assert article.fetch_status == "failed"
    assert article.http_status == 403
    assert "fetch_failed" in article.quality_flags
