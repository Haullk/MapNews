from __future__ import annotations

import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv


def load_environment() -> None:
    for env_name in (".env", ".env.local"):
        env_path = Path.cwd() / env_name
        if env_path.exists():
            load_dotenv(env_path)


def database_url() -> str:
    load_environment()
    url = os.getenv("GDELT_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("Set GDELT_DATABASE_URL or DATABASE_URL before running the worker.")
    return url


def connect() -> psycopg.Connection:
    return psycopg.connect(database_url())
