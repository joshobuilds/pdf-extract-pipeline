'use client';

import { useCallback, useRef, useState } from 'react';

type ExtractionResult = {
  data: Record<string, unknown>;
  confidence: number;
  missing_fields: string[];
  warnings: string[];
  model_used: string;
};

type SchemaShape = {
  name: string;
  description?: string;
  fields: { name: string }[];
};

const PRESET_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'invoice', label: 'Invoice', hint: 'Supplier, customer, totals, tax, payment terms' },
  { value: 'bank_statement', label: 'Bank statement', hint: 'Account details, period, balances' },
  { value: 'business_directory', label: 'Business directory', hint: 'Listing: name, contact, address, website' },
  { value: 'mortgage_document', label: 'AU mortgage document', hint: 'Payslips, bank statements, tax returns' },
  { value: 'custom', label: 'Custom YAML schema', hint: 'Paste your own schema definition' },
];

const EXAMPLE_CUSTOM_YAML = `name: "My document type"
description: "What this schema covers."
instructions: |
  - Any domain rules for the extractor.

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
`;

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState('invoice');
  const [customYaml, setCustomYaml] = useState(EXAMPLE_CUSTOM_YAML);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [schema, setSchema] = useState<SchemaShape | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onPick = useCallback((f: File | null) => {
    setError(null);
    setResult(null);
    setSchema(null);
    if (f && f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('Please upload a PDF file.');
      return;
    }
    setFile(f);
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0] ?? null;
    onPick(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Pick a PDF first.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setSchema(null);

    try {
      const pdfBase64 = await fileToBase64(file);
      const body =
        preset === 'custom'
          ? { pdfBase64, schemaYaml: customYaml }
          : { pdfBase64, preset };

      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Extraction failed');
      setResult(json.result);
      setSchema(json.schema);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const downloadExcel = async () => {
    if (!result || !schema || !file) return;
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schema, result, sourceName: file.name }),
    });
    if (!res.ok) {
      setError('Excel export failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name.replace(/\.pdf$/i, '')}-extraction.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setSchema(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const selectedPreset = PRESET_OPTIONS.find((p) => p.value === preset);

  return (
    <main className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">PDF Extract</h1>
            <p className="text-xs text-neutral-500">Schema-driven PDF → JSON + Excel. Powered by Gemini 2.5 Flash.</p>
          </div>
          <a
            href="https://github.com/joshobuilds/pdf-extract-pipeline"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-neutral-600 hover:text-neutral-900 underline"
          >
            GitHub
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8 grid gap-6 md:grid-cols-2">
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold mb-3">1. Upload a PDF</h2>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-neutral-300 rounded-lg p-6 text-center cursor-pointer hover:border-neutral-400 hover:bg-neutral-50 transition"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="text-sm">
                  <div className="font-medium">{file.name}</div>
                  <div className="text-xs text-neutral-500">
                    {(file.size / 1024).toFixed(1)} KB &middot;{' '}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        reset();
                      }}
                      className="underline"
                    >
                      change
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-neutral-600">
                  <div className="font-medium">Drop a PDF here</div>
                  <div className="text-xs text-neutral-500 mt-1">or click to browse</div>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="text-sm font-semibold mb-3">2. Pick a schema</h2>
            <div className="flex flex-col gap-2">
              {PRESET_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition ${
                    preset === opt.value
                      ? 'border-neutral-900 bg-neutral-50'
                      : 'border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="preset"
                    value={opt.value}
                    checked={preset === opt.value}
                    onChange={() => setPreset(opt.value)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-xs text-neutral-500">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
            {preset === 'custom' && (
              <textarea
                value={customYaml}
                onChange={(e) => setCustomYaml(e.target.value)}
                spellCheck={false}
                className="mt-3 w-full h-64 font-mono text-xs rounded-lg border border-neutral-300 p-3 focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
            )}
          </section>

          <button
            type="submit"
            disabled={loading || !file}
            className="rounded-lg bg-neutral-900 text-white px-4 py-3 text-sm font-medium hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Extracting…' : 'Extract fields'}
          </button>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
              {error}
            </div>
          )}
        </form>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 min-h-[300px]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">3. Results</h2>
            {result && (
              <div className="flex gap-2">
                <button
                  onClick={copyJson}
                  className="text-xs rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50"
                >
                  Copy JSON
                </button>
                <button
                  onClick={downloadExcel}
                  className="text-xs rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50"
                >
                  Download Excel
                </button>
              </div>
            )}
          </div>

          {!result && !loading && (
            <div className="text-sm text-neutral-500">
              {selectedPreset ? (
                <>Extraction output will appear here. Selected schema: <span className="font-medium text-neutral-700">{selectedPreset.label}</span>.</>
              ) : (
                'Extraction output will appear here.'
              )}
            </div>
          )}

          {loading && (
            <div className="text-sm text-neutral-500">
              Sending PDF to Gemini. This typically takes 5–20 seconds.
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-neutral-100 px-2 py-1">
                  confidence <span className="font-semibold">{result.confidence.toFixed(2)}</span>
                </span>
                <span className="rounded bg-neutral-100 px-2 py-1">
                  model <span className="font-semibold">{result.model_used}</span>
                </span>
                {result.missing_fields.length > 0 && (
                  <span className="rounded bg-amber-100 text-amber-900 px-2 py-1">
                    {result.missing_fields.length} missing
                  </span>
                )}
              </div>

              {result.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="text-xs font-semibold text-amber-900 mb-1">Warnings</div>
                  <ul className="text-xs text-amber-900 list-disc pl-4 space-y-1">
                    {result.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-neutral-500 mb-1">Extracted fields</div>
                <pre className="rounded-lg bg-neutral-900 text-neutral-100 text-xs p-3 overflow-auto max-h-[420px] whitespace-pre-wrap break-words">
{JSON.stringify(result.data, null, 2)}
                </pre>
              </div>

              {result.missing_fields.length > 0 && (
                <div className="text-xs text-neutral-500">
                  Missing: {result.missing_fields.join(', ')}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <footer className="mx-auto max-w-5xl px-6 py-10 text-xs text-neutral-500">
        PDFs are processed in-memory on the server and never stored. Built by{' '}
        <a href="https://github.com/joshobuilds" className="underline">joshobuilds</a>.
      </footer>
    </main>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
