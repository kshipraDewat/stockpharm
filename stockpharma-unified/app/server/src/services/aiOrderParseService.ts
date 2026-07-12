import { env } from '../env.js';
import { getDb } from '../db/client.js';
import { products } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';

/**
 * AI order-text parsing (UNIFIED_FEATURES headline: "AI order parsing from
 * pasted WhatsApp text, fuzzy-matched to catalogue").
 * Takes a free-text order (e.g. a WhatsApp message) and returns catalogue-matched
 * line items scoped to the caller's own product catalog.
 * Server-only — exposed at POST /api/orders/parse-text. No UI changes.
 */
export interface ParsedOrderItem {
  productName: string;
  qty: number;
  productId: string | null;
  saleRate: number | null;
  matchConfidence: 'exact' | 'high' | 'low' | 'none';
}
export interface ParsedOrder {
  items: ParsedOrderItem[];
  matchedCount: number;
  unmatchedCount: number;
}

const PROMPT = `You parse pasted pharmacy order messages (often from WhatsApp) into line items.
Return ONLY a JSON object (no markdown, no prose):
{ "items": [ { "productName": "string", "qty": number } ] }
Rules:
- Extract each medicine and its quantity. Handle formats like "Dolo 650 x 10", "Azithral - 5 strips", "Pan40 50N", "Crocin 20".
- If no quantity is stated, use 1.
- productName is the medicine text as written (drop the quantity/unit words).`;

export async function parseOrderText(tenantId: string, text: string): Promise<ParsedOrder> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured. Set it in .env to enable AI order parsing.');
  }
  if (!text || !text.trim()) {
    throw new Error('Order text is empty');
  }

  const db = await getDb();
  const catalog = await db
    .select({ id: products.id, name: products.name, saleRate: products.saleRate })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.isActive, true)));

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\nOrder message:\n${text.trim()}` }] }],
  });

  const raw = (response.text ?? '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  let parsed: { items?: Array<{ productName?: string; qty?: number }> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  const items: ParsedOrderItem[] = (parsed.items ?? []).map((it) => {
    const name = (it.productName ?? '').trim();
    const qty = Math.max(1, Number(it.qty) || 1);
    const lower = name.toLowerCase();
    let match: (typeof catalog)[number] | undefined;
    let confidence: ParsedOrderItem['matchConfidence'] = 'none';
    if (name) {
      const exact = catalog.find((r) => r.name.toLowerCase() === lower);
      if (exact) { match = exact; confidence = 'exact'; }
      else {
        const partial = catalog.find(
          (r) => r.name.toLowerCase().includes(lower) || lower.includes(r.name.toLowerCase()),
        );
        if (partial) { match = partial; confidence = 'high'; }
        else {
          // token-overlap fallback
          const tokens = lower.split(/\s+/).filter(Boolean);
          const fuzzy = catalog.find((r) => tokens.some((t) => t.length > 2 && r.name.toLowerCase().includes(t)));
          if (fuzzy) { match = fuzzy; confidence = 'low'; }
        }
      }
    }
    return {
      productName: name,
      qty,
      productId: match?.id ?? null,
      saleRate: match ? Number(match.saleRate) : null,
      matchConfidence: confidence,
    };
  });

  const matchedCount = items.filter((i) => i.productId).length;
  return { items, matchedCount, unmatchedCount: items.length - matchedCount };
}
