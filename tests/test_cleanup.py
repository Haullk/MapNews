from datetime import date

from worker.cleanup import raw_clear_allowed, retention_cutoff


def test_retention_cutoff_keeps_recent_window() -> None:
    assert retention_cutoff(date(2026, 5, 24), 90) == date(2026, 2, 24)


def test_raw_clear_allowed_requires_finished_processing() -> None:
    assert raw_clear_allowed(None)
    assert raw_clear_allowed({"processing_status": "success"})
    assert raw_clear_allowed({"processing_status": "partial_success"})
    assert not raw_clear_allowed({"processing_status": "pending"})
    assert not raw_clear_allowed({"processing_status": "failed"})
