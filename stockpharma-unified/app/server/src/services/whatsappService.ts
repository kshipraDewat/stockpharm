import { env } from '../env.js';

const WA_API_BASE = 'https://graph.facebook.com/v20.0';

export interface SendBillResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendBillViaWhatsApp(
  pharmacyPhone: string,
  pharmacyName: string,
  billNumber: string,
  billPdfBase64: string,
  senderName: string,
  mimeType: string = 'application/pdf',
): Promise<SendBillResult> {
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) {
    return { success: false, error: 'WhatsApp credentials not configured. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID in .env' };
  }

  // Normalize phone: strip leading zeros, spaces, dashes; add +91 if missing
  let phone = pharmacyPhone.replace(/[\s\-\(\)]/g, '');
  if (!phone.startsWith('+')) {
    phone = phone.startsWith('91') ? `+${phone}` : `+91${phone}`;
  }

  try {
    // Step 1: Upload the PDF as a media object
    const uploadFormData = new FormData();
    const pdfBuffer = Buffer.from(billPdfBase64, 'base64');
    const blob = new Blob([pdfBuffer], { type: mimeType });
    uploadFormData.append('file', blob, `${billNumber}.pdf`);
    uploadFormData.append('type', mimeType);
    uploadFormData.append('messaging_product', 'whatsapp');

    const uploadRes = await fetch(`${WA_API_BASE}/${env.WHATSAPP_PHONE_ID}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
      body: uploadFormData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      return { success: false, error: `Media upload failed: ${err}` };
    }
    const { id: mediaId } = await uploadRes.json() as { id: string };

    // Step 2: Send document message with caption
    const messagePayload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'document',
      document: {
        id: mediaId,
        caption: `Dear ${pharmacyName},\n\nPlease find your invoice ${billNumber} attached.\n\nThank you for your business!\n\n— ${senderName}`,
        filename: `${billNumber}.pdf`,
      },
    };

    const sendRes = await fetch(`${WA_API_BASE}/${env.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      return { success: false, error: `Message send failed: ${err}` };
    }

    const data = await sendRes.json() as { messages?: { id: string }[] };
    return { success: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
