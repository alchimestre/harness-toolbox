from collections.abc import Mapping

type ExpectedType = type | tuple[type, ...]


def _type_names(expected: ExpectedType) -> str:
    types = expected if isinstance(expected, tuple) else (expected,)
    return " or ".join(item.__name__ for item in types)


def _key_errors(payload: Mapping[str, object], key: str, expected: ExpectedType) -> list[str]:
    if key not in payload:
        return [f"{key}: missing"]
    value = payload[key]
    if not isinstance(value, expected):
        return [f"{key}: expected {_type_names(expected)}, got {type(value).__name__}"]
    return []


def validate_payload(payload: object, schema: Mapping[str, ExpectedType]) -> list[str]:
    if not isinstance(payload, Mapping):
        return [f"payload: expected mapping, got {type(payload).__name__}"]
    errors: list[str] = []
    for key, expected in schema.items():
        errors.extend(_key_errors(payload, key, expected))
    return errors
