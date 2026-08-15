import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData } from './esc-pos-helper';

/**
 * NATIVE USB PRINTER SERVICE (OTG)
 *
 * NOTE: The USB serial plugin was removed due to dependency conflicts with Capacitor v8.
 * This driver currently acts as a placeholder.
 */

class UsbPrinterService {
  async scanAndConnect(): Promise<boolean> {
    return false;
  }

  async disconnect() {
    // No-op
  }

  async printReceipt(data: ReceiptData, paperWidth: '58mm' | '80mm' = '58mm') {
    if (!isNative()) return false;

    console.warn('USB printer driver is currently disabled due to dependency conflicts.');
    throw new Error('USB printer support is temporarily disabled. Please use Bluetooth LE or Network.');
  }
}

export const usbPrinter = new UsbPrinterService();
