"""Schema config loader. Users define extraction fields in YAML; this parses them."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, field_validator

FieldType = Literal["string", "number", "integer", "boolean", "date", "array"]


class FieldDef(BaseModel):
    name: str
    type: FieldType = "string"
    description: str = ""
    required: bool = False
    enum: list[str] | None = None
    item_type: FieldType | None = None

    @field_validator("name")
    @classmethod
    def _valid_name(cls, v: str) -> str:
        if not v.isidentifier():
            raise ValueError(f"Field name '{v}' must be a valid identifier (snake_case, no spaces).")
        return v


class Schema(BaseModel):
    name: str = Field(description="Human-readable name for this extraction schema.")
    description: str = ""
    instructions: str = Field(
        default="",
        description="Extra extraction rules sent to the model as part of the system prompt.",
    )
    fields: list[FieldDef]

    def field_names(self) -> list[str]:
        return [f.name for f in self.fields]

    def required_field_names(self) -> list[str]:
        return [f.name for f in self.fields if f.required]

    def to_gemini_tool(self) -> dict[str, Any]:
        """Build a Gemini function-calling tool declaration from this schema."""
        properties: dict[str, Any] = {}
        for f in self.fields:
            properties[f.name] = _field_to_gemini(f)
        properties["_confidence"] = {
            "type": "NUMBER",
            "description": "Extractor's confidence in the result, 0.0 to 1.0.",
        }
        properties["_missing_fields"] = {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "Names of required fields that could not be located in the document.",
        }
        properties["_warnings"] = {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "Free-text notes about ambiguity, guesses, or unusual details.",
        }
        required = self.required_field_names() + ["_confidence", "_missing_fields", "_warnings"]
        return {
            "name": "record_extraction",
            "description": f"Record extracted fields from a {self.name}.",
            "parameters": {
                "type": "OBJECT",
                "properties": properties,
                "required": required,
            },
        }


_GEMINI_TYPE_MAP: dict[FieldType, str] = {
    "string": "STRING",
    "number": "NUMBER",
    "integer": "INTEGER",
    "boolean": "BOOLEAN",
    "date": "STRING",
    "array": "ARRAY",
}


def _field_to_gemini(field: FieldDef) -> dict[str, Any]:
    prop: dict[str, Any] = {
        "type": _GEMINI_TYPE_MAP[field.type],
        "nullable": not field.required,
    }
    if field.description:
        prop["description"] = field.description
    if field.type == "date":
        prop["description"] = (prop.get("description", "") + " ISO date YYYY-MM-DD or null.").strip()
    if field.enum:
        prop["enum"] = field.enum
    if field.type == "array":
        item_type = field.item_type or "string"
        prop["items"] = {"type": _GEMINI_TYPE_MAP[item_type]}
    return prop


def load_schema(path: str | Path) -> Schema:
    """Load a schema from a YAML file."""
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return Schema.model_validate(raw)
