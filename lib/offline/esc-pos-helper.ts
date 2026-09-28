/**
 * UNIFIED ESC/POS COMMAND GENERATOR
 *
 * Generates raw bytes for thermal printers (58mm/80mm).
 * Formatted specifically for handheld POS / Bluetooth mobile thermal roll printers.
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
  schemeName?: string;
  branchName?: string;
  amount: number;
  previousBalance?: number;
  newBalance?: number;
  paymentMethod: string;
  paymentReference?: string;
  paymentDate: string;
  agentName?: string;
  agentPhone?: string;
  isProvisional?: boolean;
}

function formatTwoColumnLine(left: string, right: string, width: number = 32): string {
  const spaceNeeded = width - left.length - right.length;
  if (spaceNeeded <= 0) {
    return `${left}\n${right.padStart(width)}\n`;
  }
  return `${left}${" ".repeat(spaceNeeded)}${right}\n`;
}

export function generateReceiptCommands(data: ReceiptData, paperWidth: '58mm' | '80mm' = '58mm'): string {
  let commands = INIT;
  const width = paperWidth === '58mm' ? 32 : 48;
  const line = "-".repeat(width);

  // Header
  commands += CENTER + BOLD_ON + (data.orgName || "SOUTH WESTERN UMWS") + BOLD_OFF + '\n';
  if (data.orgPhone) commands += "Tel: " + data.orgPhone + '\n';
  commands += BOLD_ON + "Official Payment Receipt" + BOLD_OFF + '\n';
  commands += line + '\n';

  if (data.isProvisional) {
    commands += BOLD_ON + "PROVISIONAL RECEIPT" + BOLD_OFF + '\n';
    commands += "(Pending Server Sync)" + '\n';
    commands += line + '\n';
  }

  // Key-Value Rows (Formatted like Cente Agent thermal rolls)
  commands += LEFT;
  commands += formatTwoColumnLine("Receipt No", data.receiptNumber, width);
  commands += formatTwoColumnLine("Date", new Date(data.paymentDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), width);
  commands += formatTwoColumnLine("Time", new Date(data.paymentDate).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), width);
  commands += line + '\n';

  commands += formatTwoColumnLine("Cust Name", data.customerName.slice(0, width - 11), width);
  if (data.customerAccount) commands += formatTwoColumnLine("Cust Account", data.customerAccount, width);
  if (data.schemeName) commands += formatTwoColumnLine("Scheme", data.schemeName, width);
  if (data.branchName) commands += formatTwoColumnLine("Branch", data.branchName, width);
  commands += formatTwoColumnLine("Method", data.paymentMethod.toUpperCase(), width);
  if (data.paymentReference) commands += formatTwoColumnLine("Ref ID", data.paymentReference, width);
  commands += line + '\n';

  // Financial Breakdown
  if (data.previousBalance !== undefined) {
    commands += formatTwoColumnLine("Prev Arrears", "UGX " + Math.round(Number(data.previousBalance)).toLocaleString(), width);
  }

  commands += BOLD_ON + formatTwoColumnLine("AMOUNT PAID", "UGX " + Math.round(Number(data.amount)).toLocaleString(), width) + BOLD_OFF;

  if (data.newBalance !== undefined) {
    const isCredit = Number(data.newBalance) < 0;
    const label = isCredit ? "Credit Balance" : "New Arrears";
    commands += formatTwoColumnLine(label, "UGX " + Math.round(Math.abs(Number(data.newBalance))).toLocaleString(), width);
  }
  commands += line + '\n';

  // Footer & Agent Details
  commands += CENTER;
  if (data.agentName) {
    commands += "Collected By: " + data.agentName + '\n';
    if (data.agentPhone) commands += "(" + data.agentPhone + ")" + '\n';
  }
  commands += '\n';
  commands += "Thank you for your payment.\n";
  commands += "Water is Life. Save it.\n";
  commands += line + '\n';
  commands += "\n\n\n"; // Paper feed cut space

  return commands;
}

export function encodeESC(text: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}
