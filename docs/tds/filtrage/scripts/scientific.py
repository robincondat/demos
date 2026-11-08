"""Ideal filtering platform adapter."""

from tds_signals import prepare_signals, sample_counts
from tds_filtering import ideal_filter


def validate_payload(payload):
    if len(payload["signals"]) > 1:
        raise ValueError("Un seul signal est autoris\u00e9")
    sample_counts(payload["signals"])


def compute(payload):
    validate_payload(payload)
    prepared = prepare_signals(payload["signals"])
    if not prepared:
        return {"signals": [], "filter": None}
    result = ideal_filter(
        prepared[0]["values"],
        sample_rate=payload["signals"][0]["sampleRate"],
        **payload.get("filter", {})
    )
    return {"signals": prepared, "filter": result}
