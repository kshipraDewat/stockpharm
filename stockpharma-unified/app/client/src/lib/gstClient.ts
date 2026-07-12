export interface GstLine {
  gstRate: number;
  lineSubtotal: number;
}

export interface GstResult {
  isInterstate: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeGst(
  lines: GstLine[],
  sellerStateCode: string,
  buyerStateCode: string,
): GstResult {
  const isInterstate = sellerStateCode !== buyerStateCode;
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;

  for (const line of lines) {
    const tax = round2(line.lineSubtotal * line.gstRate / 100);
    if (isInterstate) {
      totalIgst += tax;
    } else {
      const half = round2(tax / 2);
      totalCgst += half;
      totalSgst += half;
    }
  }

  return {
    isInterstate,
    cgst: round2(totalCgst),
    sgst: round2(totalSgst),
    igst: round2(totalIgst),
    totalTax: round2(totalCgst + totalSgst + totalIgst),
  };
}
