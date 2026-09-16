import { BleClient } from '@capacitor-community/bluetooth-le';
import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData } from './esc-pos-helper';
import { sqliteService } from './sqlite-service';

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

  async pair(): Promise<{ ok: boolean; deviceId?: string; error?: string }> {
    const connected = await this.scanAndConnect();
    if (!connected || !this.deviceId) {
      return { ok: false, error: 'No Bluetooth printer selected' };
    }
    const deviceId = this.deviceId;
    await this.disconnect();
    return { ok: true, deviceId };
  }

  async disconnect() {
    if (this.deviceId) {
      try {
        await BleClient.disconnect(this.deviceId);
      } catch {
        /* already gone */
      }
      this.deviceId = null;
    }
  }

  async printReceipt(data: ReceiptData, paperWidth: '58mm' | '80mm' = '58mm') {
    await this.init();
    const settings = await sqliteService.getPrinterSettings();
    let connected = false;

    if (settings?.deviceId) {
      try {
        const savedId = settings.deviceId
        this.deviceId = savedId;
        await BleClient.connect(savedId);
        connected = true;
      } catch {
        this.deviceId = null;
      }
    }

    if (!connected) {
      connected = await this.scanAndConnect();
      if (connected && this.deviceId) {
        try {
          await sqliteService.updatePrinterSettings({
            type: settings?.type || 'auto',
            deviceId: this.deviceId,
            deviceName: settings?.deviceName,
            paperWidth: settings?.paperWidth || paperWidth,
            networkIp: settings?.networkIp,
            printerKind: settings?.printerKind || 'thermal',
          });
        } catch {
          /* settings persist is best-effort */
        }
      }
    }

    if (!connected || !this.deviceId) throw new Error('No Bluetooth printer connected');

    try {
      const commands = generateReceiptCommands(data, paperWidth);
      const bytes = encodeESC(commands);
      const dataView = new DataView(bytes.buffer);

      await BleClient.write(this.deviceId, PRINTER_SERVICE_UUID, PRINTER_CHARACTERISTIC_UUID, dataView);

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
