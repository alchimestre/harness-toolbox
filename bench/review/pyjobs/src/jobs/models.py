from dataclasses import dataclass, field


@dataclass
class Job:
    job_id: str
    payload: dict
    run_at: float
    max_attempts: int = 3
    attempts: int = 0
    status: str = "pending"
    tags: list = field(default_factory=list)
    last_error: str | None = None
