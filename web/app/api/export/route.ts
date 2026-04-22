import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildExcel } from '@/lib/excel';
import { extractionSchema } from '@/lib/schema';

export const runtime = 'nodejs';

const resultSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  confidence: z.number(),
  missing_fields: z.array(z.string()),
  warnings: z.array(z.string()),
  model_used: z.string(),
});

const bodySchema = z.object({
  schema: extractionSchema,
  items: z
    .array(
      z.object({
        sourceName: z.string(),
        result: resultSchema,
      }),
    )
    .min(1),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    }
    const { schema, items } = parsed.data;
    const buf = await buildExcel(schema, items);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="extraction-${Date.now()}.xlsx"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
