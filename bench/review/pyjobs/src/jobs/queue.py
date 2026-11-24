import time
import uuid

from jobs import store
from jobs.models import Job


def enqueue(conn, payload, run_at=None, max_attempts=3, tags=[]):
    job = Job(
        job_id=str(uuid.uuid4()),
        payload=payload,
        run_at=time.time() if run_at is None else run_at,
        max_attempts=max_attempts,
        tags=tags,
    )
    store.save(conn, job)
    return job
