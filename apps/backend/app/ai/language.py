"""Language detection helper (multilingual support)."""

from __future__ import annotations


def detect_language(text: str, default: str = "en") -> str:
    """Detect the ISO-639-1 language code of `text`, falling back to `default`."""
    sample = (text or "").strip()
    if len(sample) < 8:
        return default
    try:
        from langdetect import DetectorFactory, detect

        DetectorFactory.seed = 0
        return detect(sample[:2000])
    except Exception:  # noqa: BLE001
        return default
