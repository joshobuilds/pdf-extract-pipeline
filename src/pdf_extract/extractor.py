"""Core extraction: PDF in, structured dict out. Gemini 2.5 Flash with function calling."""

from __future__ import annotations

import base64
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types

from pdf_extract.schema import Schema

MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.5-flash-lite"
RETRY_DELAYS = (1.0, 3.0, 8.0)


@dataclass
class ExtractionResult:
    data: dict[str, Any]
    confidence: float
    missing_fields: list[str]
    warnings: list[str]
    source_path: str


def extract(
    pdf_path: str | Path,
    schema: Schema,
    api_key: str | None = None,
) -> ExtractionResult:
    """Extract fields from a PDF according to the given schema."""
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set. Pass api_key= or set the env var.")

    pdf_bytes = Path(pdf_path).read_bytes()
    client = genai.Client(api_key=key)
    tool = types.Tool(function_declarations=[schema.to_gemini_tool()])

    system_prompt = _build_system_prompt(schema)
    extra_warnings: list[str] = []

    def call_model(model_name: str):
        return client.models.generate_content(
            model=model_name,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_bytes(data=pdf_bytes, mime_type="application/pdf"),
                        types.Part.from_text(
                            text=f"Extract the {schema.name} fields from the attached PDF."
                        ),
                    ],
                )
            ],
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=[tool],
                tool_config=types.ToolConfig(
                    function_calling_config=types.FunctionCallingConfig(
                        mode="ANY",
                        allowed_function_names=["record_extraction"],
                    )
                ),
            ),
        )

    try:
        response = _call_with_retry(lambda: call_model(MODEL))
    except Exception as primary_err:
        if not _is_retriable(str(primary_err)):
            raise
        extra_warnings.append(
            f"Primary model {MODEL} unavailable after retries ({_short_err(primary_err)}); "
            f"fell back to {FALLBACK_MODEL}."
        )
        response = _call_with_retry(lambda: call_model(FALLBACK_MODEL))

    call = _extract_function_call(response)
    args = dict(call.args or {})

    confidence = float(args.pop("_confidence", 0.0) or 0.0)
    missing = list(args.pop("_missing_fields", []) or [])
    warnings = list(args.pop("_warnings", []) or []) + extra_warnings

    return ExtractionResult(
        data=args,
        confidence=confidence,
        missing_fields=missing,
        warnings=warnings,
        source_path=str(pdf_path),
    )


def extract_many(
    pdf_paths: list[str | Path],
    schema: Schema,
    api_key: str | None = None,
) -> list[ExtractionResult]:
    """Extract against many PDFs. Failures return an ExtractionResult with warnings."""
    results: list[ExtractionResult] = []
    for p in pdf_paths:
        try:
            results.append(extract(p, schema, api_key=api_key))
        except Exception as exc:
            results.append(
                ExtractionResult(
                    data={},
                    confidence=0.0,
                    missing_fields=schema.required_field_names(),
                    warnings=[f"Extraction failed: {exc}"],
                    source_path=str(p),
                )
            )
    return results


def _build_system_prompt(schema: Schema) -> str:
    field_lines = []
    for f in schema.fields:
        line = f"- {f.name} ({f.type})"
        if f.required:
            line += " [required]"
        if f.description:
            line += f": {f.description}"
        if f.enum:
            line += f" | allowed values: {', '.join(f.enum)}"
        field_lines.append(line)
    fields_block = "\n".join(field_lines)

    base = f"""You are a document data extractor.

Task: read the attached PDF and call the `record_extraction` function with the extracted fields.

Schema: {schema.name}
{schema.description}

Fields to extract:
{fields_block}

Rules:
- If a field is not stated in the document, return null. Do not guess or hallucinate.
- Dates: output ISO YYYY-MM-DD.
- Numbers: strip currency symbols and thousand separators.
- _confidence: a number between 0.0 and 1.0 reflecting your confidence in the extraction.
- _missing_fields: names of required fields you could not locate in the document.
- _warnings: free-text notes about ambiguity, guesses, scanned quality, or unusual details.
- Call the function exactly once. Never respond with prose."""

    if schema.instructions:
        base += f"\n\nSchema-specific rules:\n{schema.instructions}"

    return base


_RETRIABLE_MARKERS = (
    "503", "429", "500", "502", "504",
    "UNAVAILABLE", "overloaded", "high demand",
)


def _is_retriable(msg: str) -> bool:
    return any(m.lower() in msg.lower() for m in _RETRIABLE_MARKERS)


def _short_err(err: Exception) -> str:
    msg = str(err)
    return msg[:80] + "…" if len(msg) > 80 else msg


def _call_with_retry(fn):
    """Retry on transient Gemini errors (429, 503, overloaded)."""
    last_err: Exception | None = None
    for attempt in range(len(RETRY_DELAYS) + 1):
        try:
            return fn()
        except Exception as err:
            last_err = err
            if not _is_retriable(str(err)) or attempt == len(RETRY_DELAYS):
                raise
            time.sleep(RETRY_DELAYS[attempt])
    assert last_err is not None
    raise last_err


def _extract_function_call(response) -> Any:
    """Pull the first function call out of a Gemini response."""
    candidates = getattr(response, "candidates", None) or []
    for cand in candidates:
        content = getattr(cand, "content", None)
        if not content:
            continue
        parts = getattr(content, "parts", None) or []
        for part in parts:
            fc = getattr(part, "function_call", None)
            if fc and getattr(fc, "name", None) == "record_extraction":
                return fc
    raise RuntimeError("Gemini did not return a record_extraction function call.")
