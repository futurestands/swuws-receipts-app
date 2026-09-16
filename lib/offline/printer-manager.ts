import { sqliteService } from './sqlite-service';
import { bluetoothLePrinter } from './bluetooth-printer';
import { networkPrinter } from './network-printer';
import { ReceiptData } from './esc-pos-helper';
import { officeInvoiceHtml, officeReceiptHtml, printOfficeHtml } from './office-print';
import type { PrinterKind } from './printer-kind';

const OFFICE_DRIVER_HINT =
  'No office printer appeared. Install Mopria Print Service from Play Store (that is the driver for HP, Epson and Kyocera), turn the printer on, then try again.';

function resolvedKind(settings: { type?: string; printerKind?: string | null } | null): PrinterKind {
  if (settings?.printerKind === 'office' || settings?.printerKind === 'thermal') {
    return settings.printerKind;
  }
  if (settings?.type === 'bluetooth' || settings?.type === 'bluetooth-le') return 'thermal';
  return 'thermal';
}

/**
 * UNIFIED PRINTER MANAGER
 *
 * Thermal roll printers: Network TCP 9100 and Bluetooth LE (ESC/POS).
 * Office A4 (HP / Epson / Kyocera): Android PrintManager. USB / inbuilt /
 * classic are stubs and are skipped.
 */
export class PrinterManager {
  async print(data: ReceiptData) {
    const settings = await sqliteService.getPrinterSettings();
    const kind = resolvedKind(settings);

    if (kind === 'office') {
      try {
        await printOfficeHtml(officeReceiptHtml(data), `Receipt ${data.receiptNumber}`);
        await sqliteService.logPrint({ receiptId: data.receiptNumber, printerType: 'office', status: 'success' });
        return true;
      } catch (err: any) {
        const message = err?.message || OFFICE_DRIVER_HINT;
        await sqliteService.logPrint({
          receiptId: data.receiptNumber,
          printerType: 'office',
          status: 'failed',
          error: message,
        });
        throw new Error(message.includes('Mopria') ? message : OFFICE_DRIVER_HINT);
      }
    }

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

  async printInvoice(data: Parameters<typeof officeInvoiceHtml>[0]) {
    try {
      await printOfficeHtml(officeInvoiceHtml(data), `Invoice ${data.customerAccount || data.customerName}`);
      await sqliteService.logPrint({
        receiptId: `INV-${data.customerAccount || data.customerName}`,
        printerType: 'office',
        status: 'success',
      });
      return true;
    } catch (err: any) {
      const message = err?.message || OFFICE_DRIVER_HINT;
      await sqliteService.logPrint({
        receiptId: `INV-${data.customerAccount || data.customerName}`,
        printerType: 'office',
        status: 'failed',
        error: message,
      });
      throw new Error(message.includes('Mopria') ? message : OFFICE_DRIVER_HINT);
    }
  }

  async getAvailableUSB() {
    return [];
  }
}

export const printerManager = new PrinterManager();
