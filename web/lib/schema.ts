import { Type, type FunctionDeclaration, type Schema } from '@google/genai';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const fieldDefSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'integer', 'boolean', 'date', 'array']),
  required: z.boolean().optional().default(false),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
  item_type: z
    .enum(['string', 'number', 'integer', 'boolean', 'date'])
    .optional(),
});

export const extractionSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(''),
  instructions: z.string().optional().default(''),
  fields: z.array(fieldDefSchema).min(1),
});

export type FieldDef = z.infer<typeof fieldDefSchema>;
export type ExtractionSchema = z.infer<typeof extractionSchema>;

export function parseSchemaYaml(yaml: string): ExtractionSchema {
  const raw = parseYaml(yaml);
  return extractionSchema.parse(raw);
}

const TYPE_MAP: Record<FieldDef['type'], Type> = {
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  date: Type.STRING,
  array: Type.ARRAY,
};

function fieldToGeminiProp(field: FieldDef): Schema {
  const prop: Schema = { type: TYPE_MAP[field.type] };
  if (field.description) prop.description = field.description;
  if (field.enum && field.enum.length) prop.enum = field.enum;
  if (field.type === 'date' && !prop.description) {
    prop.description = 'ISO date YYYY-MM-DD';
  }
  if (field.type === 'array') {
    const itemType = field.item_type ?? 'string';
    prop.items = { type: TYPE_MAP[itemType] };
  }
  if (!field.required) prop.nullable = true;
  return prop;
}

export function schemaToGeminiTool(schema: ExtractionSchema): FunctionDeclaration {
  const properties: Record<string, Schema> = {};
  const required: string[] = [];
  for (const f of schema.fields) {
    properties[f.name] = fieldToGeminiProp(f);
    if (f.required) required.push(f.name);
  }

  properties._confidence = {
    type: Type.NUMBER,
    description: 'Confidence in extraction, 0.0 to 1.0',
    minimum: 0,
    maximum: 1,
  };
  properties._missing_fields = {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    description: 'Required field names that were not found',
  };
  properties._warnings = {
    type: Type.ARRAY,
    items: { type: Type.STRING },
    description: 'Notes on ambiguity, guesses, quality issues',
  };
  required.push('_confidence', '_missing_fields', '_warnings');

  return {
    name: 'record_extraction',
    description: `Record extracted fields from the document. Schema: ${schema.name}.`,
    parameters: {
      type: Type.OBJECT,
      properties,
      required,
    },
  };
}

export function buildSystemPrompt(schema: ExtractionSchema): string {
  const fieldLines = schema.fields.map((f) => {
    let line = `- ${f.name} (${f.type})`;
    if (f.required) line += ' [required]';
    if (f.description) line += `: ${f.description}`;
    if (f.enum?.length) line += ` | allowed values: ${f.enum.join(', ')}`;
    return line;
  });

  let base = `You are a document data extractor.

Task: read the attached PDF and call the \`record_extraction\` function with the extracted fields.

Schema: ${schema.name}
${schema.description}

Fields to extract:
${fieldLines.join('\n')}

Rules:
- If a field is not stated in the document, return null. Do not guess or hallucinate.
- Dates: output ISO YYYY-MM-DD.
- Numbers: strip currency symbols and thousand separators.
- _confidence: a number between 0.0 and 1.0 reflecting your confidence.
- _missing_fields: names of required fields you could not locate.
- _warnings: free-text notes about ambiguity, guesses, scanning quality, or unusual details.
- Call the function exactly once. Never respond with prose.`;

  if (schema.instructions) {
    base += `\n\nSchema-specific rules:\n${schema.instructions}`;
  }
  return base;
}
