import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extract } from '@/lib/extractor';
import { extractionSchema, parseSchemaYaml } from '@/lib/schema';
import { PRESETS } from '@/lib/presets';

export const runtime = 'nodejs';
export const maxDuration = 60;

const bodySchema = z.object({
  pdfBase64: z.string().min(1),
  preset: z.string().optional(),
  schemaYaml: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    }
    const { pdfBase64, preset, schemaYaml } = parsed.data;

    let schema;
    if (schemaYaml && schemaYaml.trim()) {
      try {
        schema = parseSchemaYaml(schemaYaml);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json(
          { ok: false, error: `Schema YAML is invalid: ${msg}` },
          { status: 400 },
        );
      }
    } else if (preset && PRESETS[preset]) {
      schema = extractionSchema.parse(parseSchemaYaml(PRESETS[preset].yaml));
    } else {
      return NextResponse.json(
        { ok: false, error: 'Provide either a preset name or schemaYaml.' },
        { status: 400 },
      );
    }

    const result = await extract(pdfBase64, schema);
    return NextResponse.json({ ok: true, result, schema });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
