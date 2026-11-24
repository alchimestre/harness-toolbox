from collections.abc import Iterable
from typing import Protocol

FINISHED_STATUSES = frozenset({"done", "failed"})


class JobLike(Protocol):
    @property
    def job_id(self) -> str: ...

    @property
    def status(self) -> str: ...

    @property
    def run_at(self) -> float: ...


def is_expired(job: JobLike, now: float, keep_seconds: float) -> bool:
    if keep_seconds < 0:
        raise ValueError("keep_seconds must be non-negative")
    if job.status not in FINISHED_STATUSES:
        return False
    return now - job.run_at >= keep_seconds


def expired_job_ids(jobs: Iterable[JobLike], now: float, keep_seconds: float) -> list[str]:
    return [job.job_id for job in jobs if is_expired(job, now, keep_seconds)]


def prune_plan(
    jobs: Iterable[JobLike],
    now: float,
    keep_seconds: float,
    batch_size: int,
) -> list[list[str]]:
    if batch_size < 1:
        raise ValueError("batch_size must be at least 1")
    job_ids = expired_job_ids(jobs, now, keep_seconds)
    return [job_ids[start:start + batch_size] for start in range(0, len(job_ids), batch_size)]
