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

type FileStatus = 'pending' | 'running' | 'done' | 'error';

type FileItem = {
  id: string;
  file: File;
  status: FileStatus;
  result?: ExtractionResult;
  error?: string;
};

const MAX_FILES = 10;

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
  const [items, setItems] = useState<FileItem[]>([]);
  const [preset, setPreset] = useState('invoice');
  const [customYaml, setCustomYaml] = useState(EXAMPLE_CUSTOM_YAML);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaShape | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    setError(null);
    const incoming = Array.from(files);
    const pdfs: FileItem[] = [];
    for (const f of incoming) {
      if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
        setError(`Skipped non-PDF file: ${f.name}`);
        continue;
      }
      pdfs.push({
        id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file: f,
        status: 'pending',
      });
    }
    setItems((prev) => {
      const merged = [...prev, ...pdfs];
      if (merged.length > MAX_FILES) {
        setError(`Capped at ${MAX_FILES} files per run. Extra files were dropped.`);
        return merged.slice(0, MAX_FILES);
      }
      return merged;
    });
  }, []);

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const clearAll = () => {
    setItems([]);
    setSchema(null);
    setError(null);
    setExpanded({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const patchItem = (id: string, patch: Partial<FileItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setError('Add at least one PDF.');
      return;
    }
    setLoading(true);
    setError(null);
    setSchema(null);

    const body = (pdfBase64: string) =>
      preset === 'custom'
        ? { pdfBase64, schemaYaml: customYaml }
        : { pdfBase64, preset };

    const pending = items.filter((it) => it.status !== 'done');
    for (const it of pending) {
      patchItem(it.id, { status: 'running', error: undefined });
      try {
        const pdfBase64 = await fileToBase64(it.file);
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body(pdfBase64)),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? 'Extraction failed');
        patchItem(it.id, { status: 'done', result: json.result });
        if (!schema && json.schema) setSchema(json.schema);
      } catch (err) {
        patchItem(it.id, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    setLoading(false);
  };

  const downloadExcel = async () => {
    const doneItems = items.filter((it) => it.status === 'done' && it.result);
    if (!schema || doneItems.length === 0) return;
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema,
        items: doneItems.map((it) => ({ sourceName: it.file.name, result: it.result })),
      }),
    });
    if (!res.ok) {
      setError('Excel export failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extraction-${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyJson = async () => {
    const doneItems = items.filter((it) => it.status === 'done' && it.result);
    if (doneItems.length === 0) return;
    const payload = doneItems.map((it) => ({
      source: it.file.name,
      ...it.result,
    }));
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  };

  const selectedPreset = PRESET_OPTIONS.find((p) => p.value === preset);
  const doneCount = items.filter((it) => it.status === 'done').length;
  const errorCount = items.filter((it) => it.status === 'error').length;

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
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">1. Upload PDFs</h2>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs text-neutral-500 hover:text-neutral-800 underline"
                >
                  Clear all
                </button>
              )}
            </div>
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
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(e.target.files);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />
              <div className="text-sm text-neutral-600">
                <div className="font-medium">Drop PDFs here</div>
                <div className="text-xs text-neutral-500 mt-1">
                  or click to browse &middot; up to {MAX_FILES} files per run
                </div>
              </div>
            </div>

            {items.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5">
                {items.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-center justify-between gap-2 rounded border border-neutral-200 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-neutral-800">{it.file.name}</div>
                      <div className="text-neutral-500">
                        {(it.file.size / 1024).toFixed(1)} KB
                        {it.status === 'done' && it.result && (
                          <>
                            {' '}&middot; confidence {it.result.confidence.toFixed(2)}
                          </>
                        )}
                        {it.status === 'error' && it.error && <> &middot; <span className="text-red-700">{shortErr(it.error)}</span></>}
                      </div>
                    </div>
                    <StatusPill status={it.status} />
                    {!loading && (
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="text-neutral-400 hover:text-neutral-700"
                        aria-label="Remove file"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
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
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs text-neutral-500">
                    YAML is whitespace-sensitive. If pasting loses indentation, click Reset.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCustomYaml(EXAMPLE_CUSTOM_YAML)}
                    className="shrink-0 whitespace-nowrap text-xs rounded border border-neutral-300 px-2 py-1 hover:bg-neutral-50"
                  >
                    Reset to example
                  </button>
                </div>
                <textarea
                  value={customYaml}
                  onChange={(e) => setCustomYaml(e.target.value)}
                  spellCheck={false}
                  className="w-full h-64 font-mono text-xs rounded-lg border border-neutral-300 p-3 focus:outline-none focus:ring-2 focus:ring-neutral-400"
                />
              </div>
            )}
          </section>

          <button
            type="submit"
            disabled={loading || items.length === 0}
            className="rounded-lg bg-neutral-900 text-white px-4 py-3 text-sm font-medium hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed transition"
          >
            {loading
              ? `Extracting ${doneCount + errorCount + 1}/${items.length}…`
              : items.length > 1
                ? `Extract ${items.length} PDFs`
                : 'Extract fields'}
          </button>

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
              <div>{error}</div>
              {/Schema YAML is invalid|Map keys must be unique|Implicit keys/i.test(error) && (
                <div className="mt-2 text-red-700">
                  Tip: pasting YAML sometimes drops indentation. Click{' '}
                  <span className="font-semibold">Reset to example</span> above the textarea,
                  then edit the template in place.
                </div>
              )}
            </div>
          )}
        </form>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 min-h-[300px]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">3. Results</h2>
            {doneCount > 0 && (
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

          {items.length === 0 && (
            <div className="text-sm text-neutral-500">
              {selectedPreset ? (
                <>Add PDFs and hit extract. Selected schema: <span className="font-medium text-neutral-700">{selectedPreset.label}</span>.</>
              ) : (
                'Extraction output will appear here.'
              )}
            </div>
          )}

          {items.length > 0 && (
            <div className="flex flex-col gap-3">
              {items.map((it) => (
                <ResultCard
                  key={it.id}
                  item={it}
                  expanded={!!expanded[it.id]}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [it.id]: !prev[it.id] }))
                  }
                />
              ))}
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

function StatusPill({ status }: { status: FileStatus }) {
  const style =
    status === 'done'
      ? 'bg-green-100 text-green-800'
      : status === 'error'
        ? 'bg-red-100 text-red-800'
        : status === 'running'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-neutral-100 text-neutral-600';
  const label =
    status === 'done' ? 'done' : status === 'error' ? 'error' : status === 'running' ? 'running' : 'pending';
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${style}`}>
      {label}
    </span>
  );
}

function ResultCard({
  item,
  expanded,
  onToggle,
}: {
  item: FileItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { file, status, result, error } = item;
  return (
    <div className="rounded-lg border border-neutral-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-neutral-50"
      >
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{file.name}</div>
          <div className="text-xs text-neutral-500 flex flex-wrap gap-x-2">
            {status === 'done' && result && (
              <>
                <span>confidence {result.confidence.toFixed(2)}</span>
                <span>model {result.model_used}</span>
                {result.missing_fields.length > 0 && (
                  <span className="text-amber-700">{result.missing_fields.length} missing</span>
                )}
                {result.warnings.length > 0 && (
                  <span className="text-amber-700">{result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}</span>
                )}
              </>
            )}
            {status === 'running' && <span>extracting…</span>}
            {status === 'pending' && <span>queued</span>}
            {status === 'error' && <span className="text-red-700">{shortErr(error ?? 'failed')}</span>}
          </div>
        </div>
        <StatusPill status={status} />
      </button>

      {expanded && status === 'done' && result && (
        <div className="border-t border-neutral-200 p-3 flex flex-col gap-3">
          {result.warnings.length > 0 && (
            <div className="rounded border border-amber-300 bg-amber-50 p-2">
              <div className="text-xs font-semibold text-amber-900 mb-1">Warnings</div>
              <ul className="text-xs text-amber-900 list-disc pl-4 space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <pre className="rounded bg-neutral-900 text-neutral-100 text-xs p-3 overflow-auto max-h-[320px] whitespace-pre-wrap break-words">
{JSON.stringify(result.data, null, 2)}
          </pre>
          {result.missing_fields.length > 0 && (
            <div className="text-xs text-neutral-500">
              Missing: {result.missing_fields.join(', ')}
            </div>
          )}
        </div>
      )}

      {expanded && status === 'error' && (
        <div className="border-t border-neutral-200 p-3 text-xs text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}

function shortErr(msg: string): string {
  return msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
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
