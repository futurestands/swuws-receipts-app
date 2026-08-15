/**
 * UNIFIED ESC/POS COMMAND GENERATOR
 *
 * Generates raw bytes for thermal printers (58mm/80mm).
 */

export const ESC = '\u001b';
export const GS = '\u001d';
export const INIT = ESC + '@';
export const CENTER = ESC + 'a' + '\u0001';
export const LEFT = ESC + 'a' + '\u0000';
export const RIGHT = ESC + 'a' + '\u0002';
export const BOLD_ON = ESC + 'E' + '\u0001';
export const BOLD_OFF = ESC + 'E' + '\u0000';
export const DOUBLE_HEIGHT = GS + '!' + '\u0010';
export const DOUBLE_WIDTH = GS + '!' + '\u0001';
export const RESET_SIZE = GS + '!' + '\u0000';

export interface ReceiptData {
  orgName?: string;
  orgPhone?: string;
  receiptNumber: string;
  customerName: string;
  customerAccount?: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  agentName?: string;
  isProvisional?: boolean;
}

export function generateReceiptCommands(data: ReceiptData, paperWidth: '58mm' | '80mm' = '58mm'): string {
  let commands = INIT;
  const line = paperWidth === '58mm' ? "--------------------------------" : "------------------------------------------------";

  // Header
  commands += CENTER + BOLD_ON + DOUBLE_HEIGHT + (data.orgName || "SWUWS PORTAL") + RESET_SIZE + BOLD_OFF + '\n';
  if (data.orgPhone) commands += data.orgPhone + '\n';
  commands += "Collection Receipt" + '\n';
  commands += line + '\n';

  if (data.isProvisional) {
    commands += BOLD_ON + "PROVISIONAL RECEIPT" + BOLD_OFF + '\n';
    commands += "(Pending Server Sync)" + '\n';
  }

  // Body
  commands += LEFT + '\n';
  commands += "Receipt #: " + data.receiptNumber + '\n';
  commands += "Date: " + new Date(data.paymentDate).toLocaleString() + '\n';
  commands += "Customer: " + data.customerName + '\n';
  if (data.customerAccount) commands += "Account: " + data.customerAccount + '\n';
  commands += "Method: " + data.paymentMethod.toUpperCase() + '\n';
  commands += line + '\n';

  // Amount
  commands += BOLD_ON + "TOTAL PAID: UGX " + data.amount.toLocaleString() + BOLD_OFF + '\n';
  commands += line + '\n';

  // Footer
  commands += CENTER + '\n';
  if (data.agentName) commands += "Agent: " + data.agentName + '\n';
  commands += "Thank you for your payment." + '\n';
  commands += "Water is Life. Save it." + '\n';
  commands += '\n\n\n'; // Paper feed

  return commands;
}

export function encodeESC(text: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}
