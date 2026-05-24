from datetime import date

from worker.gdelt_common import files_for_day, gdelt_file, intervals, stable_row_id
from worker.gdelt_loader import gkg_key, gkg_loader_enabled, mention_key


def test_gdelt_file_names_cover_three_datasets() -> None:
    stamp = next(iter(intervals(date(2026, 5, 17))))

    assert gdelt_file("events", stamp).file_name == "20260517000000.export.CSV.zip"
    assert gdelt_file("mentions", stamp).file_name == "20260517000000.mentions.CSV.zip"
    assert gdelt_file("gkg", stamp).file_name == "20260517000000.gkg.csv.zip"


def test_files_for_day_builds_requested_datasets_per_interval() -> None:
    files = files_for_day(date(2026, 5, 17), ["events", "mentions"])

    assert len(files) == 192
    assert files[0].dataset == "events"
    assert files[1].dataset == "mentions"


def test_raw_ids_are_stable() -> None:
    row = ["100", "20260517110000", "20260517111500", "", "example.com", "https://example.com/a"]

    assert mention_key("file.zip", 1, row) == mention_key("file.zip", 1, row)
    assert gkg_key("file.zip", 1, ["doc", "20260517"]) == gkg_key("file.zip", 1, ["doc", "20260517"])
    assert stable_row_id("a", 1) != stable_row_id("a", 2)


def test_gkg_loader_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.delenv("MAPNEWS_ENABLE_GKG", raising=False)
    monkeypatch.delenv("GDELT_ENABLE_GKG", raising=False)

    assert gkg_loader_enabled() is False


def test_gkg_loader_can_be_enabled_explicitly(monkeypatch) -> None:
    monkeypatch.setenv("MAPNEWS_ENABLE_GKG", "true")

    assert gkg_loader_enabled() is True
