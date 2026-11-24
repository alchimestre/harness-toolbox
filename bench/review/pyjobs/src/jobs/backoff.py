BASE_SECONDS = 30
CAP_SECONDS = 3600


def retry_delay(attempts):
    if attempts > 0:
        return min(BASE_SECONDS * 2 ** attempts, CAP_SECONDS)
    return BASE_SECONDS


def next_run_at(now, attempts):
    return now + retry_delay(attempts)
