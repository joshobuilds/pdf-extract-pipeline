# pdf-extract web

Drag-and-drop web UI for the PDF extraction pipeline. Built on Next.js 16 / React 19, deploys to Vercel in one click.

## Run locally

```bash
cd web
cp .env.example .env.local
# paste your Gemini API key into .env.local

npm install
npm run dev
```

Open http://localhost:3000.

## Deploy to Vercel

1. Push the repo to GitHub (already done if you're reading this from the repo).
2. Import the repo at https://vercel.com/new.
3. Set the **Root Directory** to `web`.
4. Add an environment variable: `GEMINI_API_KEY` = your Google AI Studio key.
5. (Optional) `PRIMARY_MODEL` = `gemini-2.5-flash` for production accuracy; defaults to `gemini-2.5-flash-lite` for clean free-tier demos.

Vercel auto-detects Next.js and deploys on every push to `main`.

## How it works

- `app/page.tsx` — single-page UI: upload → preset/schema → results
- `app/api/extract/route.ts` — server route that calls Gemini with function calling
- `app/api/export/route.ts` — streams an `.xlsx` back to the browser
- `lib/schema.ts` — YAML schema parsing + Gemini tool declaration
- `lib/extractor.ts` — retry + model fallback logic
- `lib/excel.ts` — ExcelJS export with styled header

PDFs are processed in-memory on the server and never persisted.
