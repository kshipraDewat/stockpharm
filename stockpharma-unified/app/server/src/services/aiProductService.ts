import { env } from '../env.js';

/**
 * AI product autofill (UNIFIED_FEATURES §11 "product-info enrichment").
 * Infers Indian-market pharma metadata from a product name using Gemini.
 * Returns only fields the model is confident about; the caller fills blanks.
 * Server-only — exposed at POST /api/products/autofill. No UI changes.
 */
export interface ProductAutofill {
  genericName: string | null;
  manufacturer: string | null;
  category: string | null;
  scheduleType: 'NONE' | 'H' | 'H1' | 'X' | 'NDPS' | null;
  hsnCode: string | null;
  gstRate: number | null;
}

const PROMPT = `You are a pharmaceutical catalogue assistant for the Indian market.
Given a medicine/product name, infer its metadata. Join multiple salts with " + ".
Return ONLY a JSON object (no markdown, no prose) with this exact shape:
{
  "genericName": "string or null",
  "manufacturer": "string or null",
  "category": "one of: Analgesics, Antibiotics, Antipyretics, Cardiovascular, Gastrointestinal, Respiratory, Diabetes, Vitamins & Supplements, Dermatology, Ophthalmic, Antacids, Antihistamines, General",
  "scheduleType": "one of: NONE, H, H1, X, NDPS",
  "hsnCode": "string or null (usually 3004 for formulations)",
  "gstRate": number (one of 0, 5, 12, 18, 28)
}
Use null when genuinely unknown. Antibiotics are usually schedule H/H1.`;

export async function autofillProductDetails(name: string): Promise<ProductAutofill> {
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured. Set it in .env to enable AI product autofill.');
  }
  if (!name || name.trim().length < 3) {
    throw new Error('Product name must be at least 3 characters');
  }

  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\nProduct name: ${name.trim()}` }] }],
  });

  const text = response.text ?? '';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed: Partial<ProductAutofill>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Gemini returned non-JSON response: ${text.slice(0, 200)}`);
  }

  const validRates = [0, 5, 12, 18, 28];
  const validSchedules = ['NONE', 'H', 'H1', 'X', 'NDPS'];
  const rate = Number(parsed.gstRate);
  const sched = parsed.scheduleType && validSchedules.includes(parsed.scheduleType) ? parsed.scheduleType : null;

  return {
    genericName: parsed.genericName?.trim() || null,
    manufacturer: parsed.manufacturer?.trim() || null,
    category: parsed.category?.trim() || null,
    scheduleType: sched,
    hsnCode: parsed.hsnCode?.trim() || null,
    gstRate: validRates.includes(rate) ? rate : null,
  };
}
