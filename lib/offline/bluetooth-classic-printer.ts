import { isNative } from '../mobile-hardware';

/**
 * NATIVE BLUETOOTH CLASSIC PRINTER SERVICE (SPP)
 *
 * NOTE: The Bluetooth Classic printer plugin was removed due to dependency conflicts with Capacitor v8.
 * This driver currently acts as a placeholder.
 */

class BluetoothClassicPrinterService {
  async scanAndConnect(): Promise<boolean> {
    return false;
  }

  async printReceipt() {
    if (!isNative()) return false;

    console.warn('Bluetooth Classic driver is currently disabled due to dependency conflicts.');
    throw new Error('Bluetooth Classic support is temporarily disabled. Please use Bluetooth LE or Network.');
  }
}

export const bluetoothClassicPrinter = new BluetoothClassicPrinterService();
