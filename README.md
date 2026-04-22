# pdf-extract-pipeline

**Turn messy PDFs into clean, structured data.** Drop in a PDF, define the fields you want in a YAML config, get JSON and Excel back. Powered by Gemini 2.5 Flash with function calling.

Two interfaces:
- **CLI** — batch-process a folder of PDFs from the terminal or Python API.
- **Web app** (`web/`) — drag-and-drop one PDF, pick a preset or paste a schema, download the result. Next.js + Vercel deployable.

Built for freelance workflows where clients send a folder of PDFs and want the fields extracted, normalized, and handed back in a spreadsheet. Swap schemas in 30 seconds to target any document type: invoices, bank statements, tax returns, business directories, menus, resumes, construction takeoffs.

---

## What it does

1. **Accepts any PDF** — digital or scanned. Gemini handles OCR internally.
2. **Extracts fields you define** — configure extraction via a small YAML file. No code changes.
3. **Enforces consistency** — use `enum:` in the schema to lock fields to a fixed vocabulary (e.g. state codes, document types).
4. **Reports confidence** — every extraction comes back with a confidence score and flags for missing fields and warnings.
5. **Exports cleanly** — JSON for pipelines, Excel with styled headers for humans.

---

## Quickstart

```bash
pip install -e .
cp .env.example .env
# paste your Gemini API key into .env

# Run against a single PDF with a built-in preset
pdf-extract run my_invoice.pdf --preset invoice --out outputs/

# Run a batch with a custom schema
pdf-extract run docs/*.pdf --schema my_schema.yaml --out outputs/

# List built-in presets
pdf-extract presets
```

Output lands in `outputs/results.json` and `outputs/results.xlsx`.

---

## Built-in presets

| Preset | What it extracts |
|---|---|
| `mortgage_document` | Australian mortgage doc pack: payslips, bank statements, tax returns, ATO notices |
| `invoice` | Supplier invoices — number, dates, parties, totals, tax |
| `bank_statement` | Account statements — balances, totals, transaction counts |
| `business_directory` | Directory entries — business name, contact, address, website |

See `src/pdf_extract/presets/` for the YAML behind each. Copy one as a starting point for your own schema.

---

## Writing a custom schema

```yaml
name: "My document type"
description: "What this schema covers."
instructions: |
  - Any domain-specific rules you want the extractor to follow.
  - Formatting conventions (dates, currency, enums).
  - How to handle ambiguity.

fields:
  - name: customer_name
    type: string
    required: true

  - name: invoice_date
    type: date

  - name: total_amount
    type: number
    required: true

  - name: status
    type: string
    enum: [paid, pending, overdue]

  - name: line_items
    type: array
    item_type: string
```

**Field types:** `string`, `number`, `integer`, `boolean`, `date`, `array` (with `item_type`).
**Optional constraints:** `required: true`, `enum: [list, of, values]`, `description: "..."`.

---

## Examples

Four fully worked examples live in `examples/`. Each has a schema file, an expected output, and a README explaining the trick:

- `examples/invoice/` — custom AU invoice schema with PO numbers and ABN
- `examples/bank_statement/` — privacy-safe statement extraction (last-4 only)
- `examples/cafe_menu/` — multilingual menu extraction with category aggregation
- `examples/business_directory/` — directory entries with enum-constrained state codes

---

## Output shape

**JSON** (`results.json`):

```json
[
  {
    "source": "path/to/file.pdf",
    "confidence": 0.94,
    "missing_fields": [],
    "warnings": ["Page 3 had a slight scanning artifact but amounts were legible."],
    "data": {
      "invoice_number": "INV-2026-0419",
      "total": 9625.00,
      "invoice_date": "2026-04-15"
    }
  }
]
```

**Excel** (`results.xlsx`):

Styled header row, one row per PDF, columns for every field in the schema plus confidence, missing fields, and warnings. Frozen top row for easy scrolling.

---

## Python API

If you want to skip the CLI and use this from another Python project:

```python
from pdf_extract import extract, load_schema

schema = load_schema("my_schema.yaml")
result = extract("invoice.pdf", schema)

print(result.data)          # dict of extracted fields
print(result.confidence)    # float 0.0 to 1.0
print(result.warnings)      # list of strings
```

---

## How the extraction works

1. The YAML schema is translated into a Gemini function-calling tool declaration at runtime.
2. The PDF is sent to `gemini-2.5-flash` as raw bytes (no server-side OCR, no local parsing — Gemini handles all document understanding).
3. Gemini is forced to call the `record_extraction` function with your fields as arguments.
4. The model also reports confidence, missing required fields, and warnings alongside the data.
5. Results are validated and written to JSON + Excel.

Transient errors (`503`, `429`, overloaded) retry with exponential backoff. If the primary model (`gemini-2.5-flash`) stays unavailable after retries, the pipeline automatically falls back to `gemini-2.5-flash-lite` and records the fallback in the result's warnings.

---

## Built by

[joshobuilds](https://github.com/joshobuilds) — scrapers, automations, and AI data pipelines. Python developer on Upwork.

If you'd like this adapted to your exact document type, reach out through Upwork.

---

## License

MIT. Use it, fork it, ship it.
