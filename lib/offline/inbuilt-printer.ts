import { SunmiPrinter } from '@kduma-autoid/capacitor-sunmi-printer';
import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData } from './esc-pos-helper';

/**
 * NATIVE INBUILT PRINTER SERVICE (Sunmi/PAX/etc)
 */

class InbuiltPrinterService {
  async printReceipt(data: ReceiptData, paperWidth: '58mm' | '80mm' = '58mm') {
    if (!isNative()) return false;

    try {
      // 1. Check if we are on a Sunmi device by probing the service
      // The plugin usually handles the binding automatically if configured.

      // 2. Generate commands
      const commands = generateReceiptCommands(data, paperWidth);
      const bytes = encodeESC(commands);

      // 3. Send raw ESC/POS to the inbuilt printer
      // Sunmi supports raw data transmission
      await SunmiPrinter.sendRAWData({ data: btoa(String.fromCharCode(...bytes)) });

      return true;
    } catch (err) {
      console.error('Inbuilt Printing failed', err);
      throw new Error('Inbuilt printer not detected or failed to print');
    }
  }
}

export const inbuiltPrinter = new InbuiltPrinterService();
