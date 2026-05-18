from __future__ import annotations

from pathlib import Path

from worker.db import connect


def main() -> None:
    schema_path = Path(__file__).resolve().parents[1] / "db" / "schema.sql"
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(schema_path.read_text(encoding="utf-8"))
        conn.commit()
    print(f"Applied schema from {schema_path}")


if __name__ == "__main__":
    main()
