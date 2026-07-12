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
  perLine: { cgst: number; sgst: number; igst: number; tax: number }[];
}

export function computeGst(
  lines: GstLine[],
  sellerStateCode: string,
  buyerStateCode: string,
): GstResult {
  const isInterstate = sellerStateCode !== buyerStateCode;
  let totalCgst = 0, totalSgst = 0, totalIgst = 0;
  const perLine: GstResult['perLine'] = [];

  for (const line of lines) {
    const tax = round2(line.lineSubtotal * line.gstRate / 100);
    if (isInterstate) {
      totalIgst += tax;
      perLine.push({ cgst: 0, sgst: 0, igst: tax, tax });
    } else {
      // me107: split symmetrically so cgst + sgst === tax exactly (no paisa drift)
      const cgst = round2(tax / 2);
      const sgst = round2(tax - cgst);
      totalCgst += cgst;
      totalSgst += sgst;
      perLine.push({ cgst, sgst, igst: 0, tax });
    }
  }

  return {
    isInterstate,
    cgst: round2(totalCgst),
    sgst: round2(totalSgst),
    igst: round2(totalIgst),
    totalTax: round2(totalCgst + totalSgst + totalIgst),
    perLine,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
