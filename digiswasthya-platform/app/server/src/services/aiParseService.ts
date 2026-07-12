import { env } from '../env.js';
import { getDb } from '../db/client.js';
import { products } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { AiParsedBill } from '../../../shared/types.js';

const EXTRACTION_PROMPT = `You are a purchase invoice parser for an Indian pharmaceutical distributor.
Extract structured data from the provided invoice image/PDF.

Return ONLY a JSON object (no markdown, no explanation) with this exact structure:
{
  "supplierName": "string or null",
  "invoiceNo": "string or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "items": [
    {
      "productName": "string",
      "batchNumber": "string",
      "expiryDate": "MM/YY or MM/YYYY format",
      "qty": number,
      "freeQty": number (0 if not stated),
      "mrp": number,
      "purchaseRate": number,
      "gstRate": number (as percentage, e.g. 12 for 12%)
    }
  ]
}

Rules:
- productName: full product name as printed
- batchNumber: as printed (e.g. "A12345")
- expiryDate: as printed (keep original format)
- qty: invoice quantity (not including free goods)
- freeQty: free/bonus quantity from scheme (0 if not mentioned)
- mrp: Maximum Retail Price per unit
- purchaseRate: net purchase price per unit (after discounts if stated)
- gstRate: GST percentage (5, 12, or 18 — infer from product category if not explicit)
- If any field is unclear, make a reasonable estimate based on context
`;

export async function parseInvoiceWithAi(
  tenantId: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<AiParsedBill> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured. Set it in .env to enable AI bill parsing.');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  const base64Data = fileBuffer.toString('base64');

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: mimeType as any,
              data: base64Data,
            },
          },
          { text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  const text = response.text ?? '';

  // Strip markdown code blocks if present
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed: AiParsedBill;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`);
  }

  // Validate minimal structure
  if (!Array.isArray(parsed.items)) {
    throw new Error('Gemini response missing items array');
  }

  // Sanitize numeric fields and match products by name
  const db = await getDb();
  const catalog = await db.select({ id: products.id, name: products.name }).from(products)
    .where(eq(products.tenantId, tenantId));

  parsed.items = parsed.items.map(item => {
    const name = (item.productName ?? '').trim();
    let productId: string | undefined;
    if (name) {
      const exact = catalog.find(r => r.name.toLowerCase() === name.toLowerCase());
      const partial = catalog.find(r =>
        r.name.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(r.name.toLowerCase()));
      productId = exact?.id ?? partial?.id;
    }
    return {
      ...item,
      productId,
      qty: Number(item.qty) || 0,
      freeQty: Number(item.freeQty) || 0,
      mrp: Number(item.mrp) || 0,
      purchaseRate: Number(item.purchaseRate) || 0,
      gstRate: Number(item.gstRate) || 12,
    };
  });

  return parsed;
}
