# Example: Bank Statement Extraction

Shows extraction from an Australian retail bank statement with privacy-safe handling of account numbers.

## Privacy note

The schema intentionally captures only the **last 4 digits** of the account number. Full account numbers are never stored.

## Run it

```bash
pdf-extract run examples/bank_statement/march_2026_statement.pdf --schema examples/bank_statement/schema.yaml --out examples/bank_statement/out
```

## Use as a built-in preset

The repo ships a generic `bank_statement` preset you can use without writing a schema file:

```bash
pdf-extract run your_statement.pdf --preset bank_statement --out outputs/
```

See `expected_output.json` for a typical run.
