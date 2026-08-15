import { sqliteService } from './sqlite-service';
import { bluetoothLePrinter } from './bluetooth-printer';
import { bluetoothClassicPrinter } from './bluetooth-classic-printer';
import { usbPrinter } from './usb-printer';
import { networkPrinter } from './network-printer';
import { inbuiltPrinter } from './inbuilt-printer';
import { ReceiptData } from './esc-pos-helper';

/**
 * UNIFIED PRINTER MANAGER
 *
 * Handles auto-fallback and user preferences for printing.
 * Fallback order: USB -> Network -> Inbuilt -> Bluetooth (Classic -> LE)
 */

export class PrinterManager {
  async print(data: ReceiptData) {
    const settings = await sqliteService.getPrinterSettings();
    const type = settings?.type || 'auto';
    const paperWidth = settings?.paperWidth || '58mm';
    let usedType = type;

    try {
      if (type === 'usb') {
        usedType = 'usb';
        await usbPrinter.printReceipt(data, paperWidth as any);
      } else if (type === 'network') {
        usedType = 'network';
        await networkPrinter.printReceipt(data, settings?.networkIp || '', paperWidth as any);
      } else if (type === 'inbuilt') {
        usedType = 'inbuilt';
        await inbuiltPrinter.printReceipt(data, paperWidth as any);
      } else if (type === 'bluetooth') {
        // For manual Bluetooth, try Classic first, then LE
        try {
          usedType = 'bluetooth-classic';
          await bluetoothClassicPrinter.printReceipt(data, paperWidth as any);
        } catch (err) {
          usedType = 'bluetooth-le';
          await bluetoothLePrinter.printReceipt(data, paperWidth as any);
        }
      } else {
        // Auto-fallback logic: USB -> Network -> Inbuilt -> Bluetooth
        try {
          console.log('Attempting USB print (auto)...');
          usedType = 'usb';
          await usbPrinter.printReceipt(data, paperWidth as any);
        } catch (err) {
          console.log('USB failed, attempting Network (auto)...');
          if (settings?.networkIp) {
            try {
              usedType = 'network';
              await networkPrinter.printReceipt(data, settings.networkIp, paperWidth as any);
              await sqliteService.logPrint({ receiptId: data.receiptNumber, printerType: usedType, status: 'success' });
              return true;
            } catch (netErr) {
              console.log('Network failed...');
            }
          }

          try {
            console.log('Attempting Inbuilt fallback (auto)...');
            usedType = 'inbuilt';
            await inbuiltPrinter.printReceipt(data, paperWidth as any);
          } catch (inbuiltErr) {
            console.log('Inbuilt failed, attempting Bluetooth Classic fallback (auto)...');
            try {
              usedType = 'bluetooth-classic';
              await bluetoothClassicPrinter.printReceipt(data, paperWidth as any);
            } catch (btCErr) {
              console.log('BT Classic failed, attempting Bluetooth LE fallback (auto)...');
              usedType = 'bluetooth-le';
              await bluetoothLePrinter.printReceipt(data, paperWidth as any);
            }
          }
        }
      }

      await sqliteService.logPrint({ receiptId: data.receiptNumber, printerType: usedType, status: 'success' });
      return true;
    } catch (err: any) {
      console.error('Unified Printing failed', err);
      await sqliteService.logPrint({
        receiptId: data.receiptNumber,
        printerType: usedType,
        status: 'failed',
        error: err.message || 'Unknown error'
      });
      throw err;
    }
  }

  async getAvailableUSB() {
    return [];
  }
}

export const printerManager = new PrinterManager();
