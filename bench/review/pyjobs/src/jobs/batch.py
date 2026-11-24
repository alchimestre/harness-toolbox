from jobs.queue import enqueue
from jobs.worker import run_job


def report_thunks(jobs, report):
    return [lambda: report(job) for job in jobs]


def flush_reports(thunks):
    for thunk in thunks:
        thunk()


def run_batch(conn, handlers, payloads, report, now):
    jobs = [enqueue(conn, payload, run_at=now) for payload in payloads]
    for job in jobs:
        run_job(conn, job, handlers, now)
    flush_reports(report_thunks(jobs, report))
