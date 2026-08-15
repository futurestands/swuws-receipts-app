import { BleClient } from '@capacitor-community/bluetooth-le';
import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData } from './esc-pos-helper';

/**
 * NATIVE BLUETOOTH PRINTER SERVICE (BLE)
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

  async printReceipt(data: ReceiptData, paperWidth: '58mm' | '80mm' = '58mm') {
    const connected = await this.scanAndConnect();
    if (!connected) throw new Error('No printer connected');

    try {
      const commands = generateReceiptCommands(data, paperWidth);
      const bytes = encodeESC(commands);
      const dataView = new DataView(bytes.buffer);

      await BleClient.write(this.deviceId!, PRINTER_SERVICE_UUID, PRINTER_CHARACTERISTIC_UUID, dataView);

      return true;
    } catch (err) {
      console.error('Printing failed', err);
      throw err;
    } finally {
      await this.disconnect();
    }
  }
}

export const bluetoothLePrinter = new BluetoothPrinterService();
