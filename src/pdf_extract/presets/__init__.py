"""Built-in schema presets for common document types."""

from __future__ import annotations

from pathlib import Path

from pdf_extract.schema import Schema, load_schema

_PRESET_DIR = Path(__file__).parent

PRESETS: tuple[str, ...] = (
    "mortgage_document",
    "invoice",
    "bank_statement",
    "business_directory",
)


def get_preset(name: str) -> Schema:
    if name not in PRESETS:
        raise ValueError(f"Unknown preset: {name!r}. Available: {', '.join(PRESETS)}")
    return load_schema(_PRESET_DIR / f"{name}.yaml")
