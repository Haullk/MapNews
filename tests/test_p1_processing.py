from datetime import date

from worker.channels import channel_for_event_code
from worker.processing import aggregate_hotspots, clean_event_from_raw, clean_mention_from_raw


def event_row(
    event_id: str = "100",
    event_code: str = "190",
    lat: str = "39.9",
    lon: str = "116.3",
) -> list[str]:
    row = [""] * 61
    row[0] = event_id
    row[1] = "20260517"
    row[6] = "ACTOR A"
    row[16] = "ACTOR B"
    row[26] = event_code
    row[27] = event_code[:2]
    row[28] = event_code[:2]
    row[31] = "3"
    row[32] = "2"
    row[33] = "4"
    row[51] = "4"
    row[52] = "Beijing, China"
    row[53] = "CH"
    row[54] = "CH22"
    row[56] = lat
    row[57] = lon
    row[59] = "20260517120000"
    row[60] = "https://example.com/story"
    return row


def mention_row(event_id: str = "100", url: str = "https://news.example.com/a") -> list[str]:
    row = [""] * 16
    row[0] = event_id
    row[1] = "20260517110000"
    row[2] = "20260517111500"
    row[4] = "news.example.com"
    row[5] = url
    row[13] = "80"
    row[14] = "-1.5"
    return row


def test_channel_mapping_uses_root_codes() -> None:
    assert channel_for_event_code("190") == "冲突"
    assert channel_for_event_code("041") == "国际"
    assert channel_for_event_code(None) == "社会"


def test_clean_event_filters_invalid_coordinates() -> None:
    assert clean_event_from_raw(event_row()) is not None
    assert clean_event_from_raw(event_row(lat="")) is None
    assert clean_event_from_raw(event_row(lat="99")) is None


def test_clean_mention_extracts_domain_and_event_id() -> None:
    mention = clean_mention_from_raw("raw-1", mention_row())

    assert mention is not None
    assert mention.global_event_id == 100
    assert mention.source_domain == "news.example.com"


def test_hotspot_aggregation_groups_by_date_region_and_channel() -> None:
    event_a = clean_event_from_raw(event_row(event_id="100", event_code="190"))
    event_b = clean_event_from_raw(event_row(event_id="101", event_code="193"))
    mention = clean_mention_from_raw("raw-1", mention_row(event_id="100"))

    assert event_a is not None
    assert event_b is not None
    assert mention is not None
    hotspots = aggregate_hotspots([event_a, event_b], {100: [mention]})

    assert len(hotspots) == 1
    assert hotspots[0].data_date == date(2026, 5, 17)
    assert hotspots[0].event_count == 2
    assert hotspots[0].mention_count >= 4
