from datetime import UTC, datetime

from jobs import store
from jobs.backoff import next_run_at
from jobs.errors import RetryableError
from jobs.journal import record


def current_epoch():
    return datetime.now(UTC).replace(tzinfo=None).timestamp()


def is_due(job, now):
    return job.run_at < now


def run_due(conn, handlers, now=None):
    current = current_epoch() if now is None else now
    for job in store.fetch_due(conn, current):
        if is_due(job, current):
            run_job(conn, job, handlers, current)


def run_job(conn, job, handlers, now):
    job.status = "running"
    store.save(conn, job)
    try:
        handlers[job.payload["kind"]](job.payload)
    except RetryableError as error:
        reschedule(conn, job, now, error)
    except Exception as error:
        finish(conn, job, "failed", error)
    else:
        finish(conn, job, "done", None)


def reschedule(conn, job, now, error):
    if job.attempts >= job.max_attempts:
        finish(conn, job, "failed", error)
        return
    job.attempts += 1
    job.tags.append("retried")
    job.run_at = next_run_at(now, job.attempts)
    job.status = "pending"
    store.save(conn, job)


def finish(conn, job, status, error):
    job.last_error = None if error is None else str(error)
    job.status = status
    store.save(conn, job)
    record({"job_id": job.job_id, "status": status})
