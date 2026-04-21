# Example: Business Directory Extraction

Demonstrates extraction of business listings from a directory PDF, with controlled vocabularies via schema `enum:` constraints.

## Run it

```bash
pdf-extract run examples/business_directory/volleyball_clubs_2024.pdf --schema examples/business_directory/schema.yaml --out examples/business_directory/out
```

## Why enums matter

The schema uses `enum:` on `club_type` and `state` to force consistent output. Without this, the model might return "senior men's" or "seniors (male)" for the same concept, polluting the output. With enums, you get one of a known fixed set — critical for downstream database import.

See `expected_output.json` for a typical run.
