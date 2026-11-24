from jobs import store
from jobs.batch import run_batch
from jobs.queue import enqueue
from jobs.worker import run_due


def connect(path):
    return store.connect(path)


def submit(conn, payload, run_at=None):
    return enqueue(conn, payload, run_at=run_at)


def process_due(conn, handlers, now=None):
    run_due(conn, handlers, now)


def submit_batch(conn, handlers, payloads, report, now):
    run_batch(conn, handlers, payloads, report, now)
