import { CapacitorThermalPrinter } from 'capacitor-thermal-printer';
import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData } from './esc-pos-helper';

/**
 * NATIVE BLUETOOTH CLASSIC PRINTER SERVICE (SPP)
 */

class BluetoothClassicPrinterService {
  private deviceAddress: string | null = null;

  async scanAndConnect(): Promise<boolean> {
    if (!isNative()) return false;

    return new Promise((resolve) => {
      const handleDiscover = async (data: { devices: any[] }) => {
        if (data.devices.length > 0) {
          // Auto-connect to first printer for now, or we could show a list
          const target = data.devices[0];
          try {
            await CapacitorThermalPrinter.stopScan();
            await CapacitorThermalPrinter.connect({ address: target.address });
            this.deviceAddress = target.address;
            resolve(true);
          } catch (err) {
            console.error('BT Classic connection failed', err);
            resolve(false);
          }
        }
      };

      // Listen for devices
      const listener = CapacitorThermalPrinter.addListener('discoverDevices', handleDiscover);

      CapacitorThermalPrinter.startScan().catch(err => {
        console.error('BT Classic scan failed', err);
        resolve(false);
      });

      // Timeout scan after 10 seconds
      setTimeout(() => {
        CapacitorThermalPrinter.stopScan();
        listener.then(l => l.remove());
        if (!this.deviceAddress) resolve(false);
      }, 10000);
    });
  }

  async printReceipt(data: ReceiptData, paperWidth: '58mm' | '80mm' = '58mm') {
    const connected = await this.scanAndConnect();
    if (!connected) throw new Error('No Bluetooth Classic printer found');

    try {
      const commands = generateReceiptCommands(data, paperWidth);
      const bytes = encodeESC(commands);

      // Use the raw method of the plugin to send our unified template
      await CapacitorThermalPrinter.begin()
        .raw(Array.from(bytes))
        .write();

      return true;
    } catch (err) {
      console.error('BT Classic Printing failed', err);
      throw err;
    } finally {
      await CapacitorThermalPrinter.disconnect();
      this.deviceAddress = null;
    }
  }
}

export const bluetoothClassicPrinter = new BluetoothClassicPrinterService();
