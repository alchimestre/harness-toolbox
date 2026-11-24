import json
import sqlite3

from jobs.models import Job

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    run_at REAL NOT NULL,
    max_attempts INTEGER NOT NULL,
    attempts INTEGER NOT NULL,
    status TEXT NOT NULL,
    tags TEXT NOT NULL,
    last_error TEXT
)
"""


def connect(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute(SCHEMA)
    return conn


def save(conn, job):
    conn.execute(
        "INSERT OR REPLACE INTO jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            job.job_id,
            json.dumps(job.payload),
            job.run_at,
            job.max_attempts,
            job.attempts,
            job.status,
            json.dumps(job.tags),
            job.last_error,
        ),
    )
    conn.commit()


def fetch_due(conn, now):
    rows = conn.execute(
        "SELECT * FROM jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at",
        (now,),
    ).fetchall()
    return [_to_job(row) for row in rows]


def _to_job(row):
    return Job(
        job_id=row["job_id"],
        payload=json.loads(row["payload"]),
        run_at=row["run_at"],
        max_attempts=row["max_attempts"],
        attempts=row["attempts"],
        status=row["status"],
        tags=json.loads(row["tags"]),
        last_error=row["last_error"],
    )
