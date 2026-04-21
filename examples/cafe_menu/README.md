# Example: Cafe Menu Extraction

Demonstrates extraction from a cafe menu PDF, covering multilingual documents (Arabic + English) and structured pricing.

## Run it

```bash
pdf-extract run examples/cafe_menu/riyadh_cafe_menu.pdf --schema examples/cafe_menu/schema.yaml --out examples/cafe_menu/out
```

## Why this matters

Menu extraction jobs are common on freelance platforms (market research, restaurant aggregators, delivery-app competitive analysis). This schema shows how to pull high-level metadata (item count, price range, categories) without needing to extract every single item, which is usually what market-research clients actually want.

See `expected_output.json` for a typical run.
