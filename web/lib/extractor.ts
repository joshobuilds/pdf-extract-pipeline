import { FunctionCallingConfigMode, GoogleGenAI } from '@google/genai';
import { buildSystemPrompt, schemaToGeminiTool, type ExtractionSchema } from './schema';

const PRIMARY_MODEL = process.env.PRIMARY_MODEL ?? 'gemini-2.5-flash-lite';
const FALLBACK_MODEL = process.env.FALLBACK_MODEL ?? 'gemini-2.5-flash-lite';
const RETRY_DELAYS_MS = [1000, 3000, 8000];

export type ExtractionResult = {
  data: Record<string, unknown>;
  confidence: number;
  missing_fields: string[];
  warnings: string[];
  model_used: string;
};

export async function extract(
  pdfBase64: string,
  schema: ExtractionSchema,
): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set on the server');

  const ai = new GoogleGenAI({ apiKey });
  const tool = schemaToGeminiTool(schema);
  const systemPrompt = buildSystemPrompt(schema);
  const extraWarnings: string[] = [];

  const callModel = (model: string) =>
    ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            { text: `Extract the ${schema.name} fields from the attached PDF.` },
          ],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: [tool] }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: ['record_extraction'],
          },
        },
      },
    });

  let response;
  let modelUsed = PRIMARY_MODEL;
  try {
    response = await callWithRetry(() => callModel(PRIMARY_MODEL));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isRetriable(msg) || PRIMARY_MODEL === FALLBACK_MODEL) throw err;
    extraWarnings.push(
      `Primary model ${PRIMARY_MODEL} unavailable after retries (${shortErr(msg)}); fell back to ${FALLBACK_MODEL}.`,
    );
    modelUsed = FALLBACK_MODEL;
    response = await callWithRetry(() => callModel(FALLBACK_MODEL));
  }

  const call = response.functionCalls?.[0];
  if (!call || call.name !== 'record_extraction') {
    throw new Error('Gemini did not return a record_extraction function call');
  }

  const args = { ...(call.args ?? {}) } as Record<string, unknown>;
  const confidence = Number(args._confidence ?? 0) || 0;
  const missing = Array.isArray(args._missing_fields) ? (args._missing_fields as string[]) : [];
  const warnings = Array.isArray(args._warnings) ? (args._warnings as string[]) : [];
  delete args._confidence;
  delete args._missing_fields;
  delete args._warnings;

  return {
    data: args,
    confidence,
    missing_fields: missing,
    warnings: [...warnings, ...extraWarnings],
    model_used: modelUsed,
  };
}

function isRetriable(msg: string): boolean {
  return /\b(503|429|500|502|504|UNAVAILABLE|overloaded|high demand)\b/i.test(msg);
}

function shortErr(msg: string): string {
  return msg.length > 80 ? `${msg.slice(0, 80)}…` : msg;
}

async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!isRetriable(msg) || attempt === RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastErr;
}
