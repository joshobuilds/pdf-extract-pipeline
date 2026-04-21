# Example: Supplier Invoice Extraction

Demonstrates extraction of a supplier invoice using a custom schema tuned for Acme Corp's accounts-payable workflow.

## Run it

```bash
pdf-extract run examples/invoice/sample_invoice.pdf --schema examples/invoice/schema.yaml --out examples/invoice/out
```

## What you get

- `results.json` — structured JSON payload per PDF, including confidence score and warnings
- `results.xlsx` — human-readable Excel with one row per file, styled headers, frozen top row

See `expected_output.json` for what a typical run returns.

## Swap schemas in 30 seconds

The `schema.yaml` in this folder is the only thing specific to invoices. To target a different document type (bank statement, tax return, contract) edit the `fields:` section. The extraction engine and output are identical.
