import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData } from './esc-pos-helper';

/**
 * NATIVE INBUILT PRINTER SERVICE (Sunmi/PAX/etc)
 *
 * NOTE: The Sunmi SDK plugin was removed due to dependency conflicts with Capacitor v8.
 * This driver currently acts as a placeholder.
 */

class InbuiltPrinterService {
  async printReceipt(data: ReceiptData, paperWidth: '58mm' | '80mm' = '58mm') {
    if (!isNative()) return false;

    try {
      console.warn('Inbuilt printer driver is currently disabled due to dependency conflicts.');
      throw new Error('Inbuilt printer support is temporarily disabled. Please use USB or Bluetooth.');

      /*
      // Placeholder for future re-integration
      const commands = generateReceiptCommands(data, paperWidth);
      const bytes = encodeESC(commands);
      // await SunmiPrinter.sendRAWData({ data: btoa(String.fromCharCode(...bytes)) });
      */
    } catch (err) {
      console.error('Inbuilt Printing failed', err);
      throw err;
    }
  }
}

export const inbuiltPrinter = new InbuiltPrinterService();
