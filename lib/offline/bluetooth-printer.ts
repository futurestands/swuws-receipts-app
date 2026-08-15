import { BleClient } from '@capacitor-community/bluetooth-le';
import { isNative } from '../mobile-hardware';

/**
 * NATIVE BLUETOOTH PRINTER SERVICE (58mm)
 *
 * Uses ESC/POS commands to print receipts offline via BLE.
 */

// Common BLE Printer Service/Characteristic UUIDs
const PRINTER_SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
const PRINTER_CHARACTERISTIC_UUID = '0000ff01-0000-1000-8000-00805f9b34fb';

class BluetoothPrinterService {
  private deviceId: string | null = null;
  private isInitialized = false;

  async init() {
    if (this.isInitialized || !isNative()) return;
    try {
      await BleClient.initialize();
      this.isInitialized = true;
    } catch (err) {
      console.error('BLE initialization failed', err);
    }
  }

  async scanAndConnect(): Promise<boolean> {
    await this.init();
    try {
      const device = await BleClient.requestDevice({
        // services: [PRINTER_SERVICE_UUID], // Some printers don't advertise the service correctly
        optionalServices: [PRINTER_SERVICE_UUID]
      });

      this.deviceId = device.deviceId;
      await BleClient.connect(this.deviceId);
      return true;
    } catch (err) {
      console.error('BLE connection failed', err);
      return false;
    }
  }

  async disconnect() {
    if (this.deviceId) {
      await BleClient.disconnect(this.deviceId);
      this.deviceId = null;
    }
  }

  /**
   * Encodes a string as bytes and adds ESC/POS commands
   */
  private encodeESC(text: string): Uint8Array {
    const encoder = new TextEncoder();
    const data = encoder.encode(text + '\n');
    return data;
  }

  async printReceipt(receipt: {
    receiptNumber: string;
    customerName: string;
    amount: number;
    paymentMethod: string;
    paymentDate: string;
    isProvisional?: boolean;
  }) {
    if (!this.deviceId) {
      const connected = await this.scanAndConnect();
      if (!connected) throw new Error('No printer connected');
    }

    try {
      // ESC/POS Commands
      const ESC = '\u001b';
      const GS = '\u001d';
      const CENTER = ESC + 'a' + '\u0001';
      const LEFT = ESC + 'a' + '\u0000';
      const BOLD_ON = ESC + 'E' + '\u0001';
      const BOLD_OFF = ESC + 'E' + '\u0000';
      const DOUBLE_HEIGHT = GS + '!' + '\u0010';
      const RESET_SIZE = GS + '!' + '\u0000';

      let commands = '';

      // Header
      commands += CENTER + BOLD_ON + DOUBLE_HEIGHT + "SWUWS PORTAL" + RESET_SIZE + BOLD_OFF + '\n';
      commands += "Collection Receipt" + '\n';
      commands += "--------------------------------" + '\n';

      if (receipt.isProvisional) {
        commands += BOLD_ON + "PROVISIONAL RECEIPT" + BOLD_OFF + '\n';
        commands += "(Pending Server Sync)" + '\n';
      }

      commands += LEFT + '\n';
      commands += "Receipt #: " + receipt.receiptNumber + '\n';
      commands += "Date: " + new Date(receipt.paymentDate).toLocaleString() + '\n';
      commands += "Customer: " + receipt.customerName + '\n';
      commands += "Method: " + receipt.paymentMethod.toUpperCase() + '\n';
      commands += "--------------------------------" + '\n';

      commands += BOLD_ON + "TOTAL PAID: UGX " + receipt.amount.toLocaleString() + BOLD_OFF + '\n';
      commands += "--------------------------------" + '\n';

      commands += CENTER + '\n';
      commands += "Thank you for paying your bill." + '\n';
      commands += "Water is Life. Save it." + '\n';
      commands += '\n\n\n'; // Paper feed

      const data = this.encodeESC(commands);
      const dataView = new DataView(data.buffer);

      // BLE usually has a MTU limit, we should send in chunks if needed
      // Most thermal printers use 20-byte chunks by default but BleClient handles some of this.
      await BleClient.write(this.deviceId!, PRINTER_SERVICE_UUID, PRINTER_CHARACTERISTIC_UUID, dataView);

      return true;
    } catch (err) {
      console.error('Printing failed', err);
      throw err;
    }
  }
}

export const bluetoothPrinter = new BluetoothPrinterService();
