import { sqliteService } from './sqlite-service';
import { bluetoothLePrinter } from './bluetooth-printer';
import { networkPrinter } from './network-printer';
import { ReceiptData } from './esc-pos-helper';

/**
 * UNIFIED PRINTER MANAGER
 *
 * Working drivers on Capacitor 8: Network (TCP 9100) and Bluetooth LE.
 * USB / inbuilt / classic are stubs and are skipped.
 */

export class PrinterManager {
  async print(data: ReceiptData) {
    const settings = await sqliteService.getPrinterSettings();
    const type = settings?.type || 'auto';
    const paperWidth = (settings?.paperWidth || '58mm') as '58mm' | '80mm';
    let usedType = type;

    const tryNetwork = async () => {
      if (!settings?.networkIp) throw new Error('No printer IP saved. Open Printer Settings while online.');
      await networkPrinter.printReceipt(data, settings.networkIp, paperWidth);
      return 'network';
    };

    const tryBle = async () => {
      await bluetoothLePrinter.printReceipt(data, paperWidth);
      return 'bluetooth-le';
    };

    try {
      if (type === 'network') {
        usedType = await tryNetwork();
      } else if (type === 'bluetooth' || type === 'bluetooth-le') {
        usedType = await tryBle();
      } else {
        // USB / inbuilt / classic are stubs on Capacitor 8. Auto and
        // leftover settings from those modes must use a working driver.
        if (settings?.networkIp) {
          try {
            usedType = await tryNetwork();
          } catch {
            usedType = await tryBle();
          }
        } else {
          usedType = await tryBle();
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
