import ExcelJS from 'exceljs';
import type { ExtractionSchema } from './schema';
import type { ExtractionResult } from './extractor';

export async function buildExcel(
  schema: ExtractionSchema,
  result: ExtractionResult,
  sourceName: string,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Extraction');

  const fieldNames = schema.fields.map((f) => f.name);
  const headers = ['source', ...fieldNames, 'confidence', 'missing_fields', 'warnings', 'model_used'];

  ws.columns = headers.map((h) => ({ header: h, key: h, width: 22 }));

  const row: Record<string, unknown> = {
    source: sourceName,
    confidence: result.confidence,
    missing_fields: result.missing_fields.join(', '),
    warnings: result.warnings.join(' | '),
    model_used: result.model_used,
  };
  for (const name of fieldNames) {
    const v = result.data[name];
    if (Array.isArray(v)) row[name] = v.join(', ');
    else if (v === null || v === undefined) row[name] = '';
    else row[name] = v;
  }
  ws.addRow(row);

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2F5496' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
