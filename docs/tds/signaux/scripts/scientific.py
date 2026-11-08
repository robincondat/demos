"""Temporal signals only; no spectral calculation."""
from tds_signals import prepare_signals, sample_counts

def validate_payload(payload):
    sample_counts(payload["signals"])

def compute(payload):
    return {"signals": prepare_signals(payload["signals"])}
