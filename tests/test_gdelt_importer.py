from datetime import date, datetime, timezone
import unittest

from worker.gdelt_importer import import_date, intervals, row_to_record


def sample_row() -> list[str]:
    row = [""] * 61
    row[0] = "123456"
    row[1] = "20260517"
    row[6] = "CHINA"
    row[7] = "CHN"
    row[16] = "UNITED STATES"
    row[17] = "USA"
    row[26] = "042"
    row[27] = "04"
    row[28] = "04"
    row[29] = "1"
    row[30] = "1.9"
    row[31] = "8"
    row[32] = "3"
    row[33] = "5"
    row[34] = "-1.2"
    row[51] = "4"
    row[52] = "Beijing, Beijing, China"
    row[53] = "CH"
    row[54] = "CH22"
    row[56] = "39.9289"
    row[57] = "116.3883"
    row[58] = "12345"
    row[59] = "20260517120000"
    row[60] = "https://example.com/news"
    return row


class GdeltImporterTests(unittest.TestCase):
    def test_import_date_parses_explicit_value(self) -> None:
        self.assertEqual(import_date("2026-05-17"), date(2026, 5, 17))

    def test_intervals_builds_96_quarter_hour_slots(self) -> None:
        slots = list(intervals(date(2026, 5, 17)))

        self.assertEqual(len(slots), 96)
        self.assertEqual(slots[0], datetime(2026, 5, 17, 0, 0, tzinfo=timezone.utc))
        self.assertEqual(slots[-1], datetime(2026, 5, 17, 23, 45, tzinfo=timezone.utc))

    def test_row_to_record_parses_valid_action_geo(self) -> None:
        record = row_to_record(sample_row())

        self.assertIsNotNone(record)
        assert record is not None
        self.assertEqual(record[0], 123456)
        self.assertEqual(record[1], date(2026, 5, 17))
        self.assertEqual(record[20], 39.9289)
        self.assertEqual(record[21], 116.3883)
        self.assertEqual(record[23], "https://example.com/news")

    def test_row_to_record_skips_missing_coordinates(self) -> None:
        row = sample_row()
        row[56] = ""

        self.assertIsNone(row_to_record(row))


if __name__ == "__main__":
    unittest.main()
