import { UsbSerial } from '@leeskies/capacitor-usb-serial';
import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData } from './esc-pos-helper';

/**
 * NATIVE USB PRINTER SERVICE (OTG)
 */

class UsbPrinterService {
  private portId: string | null = null;

  async scanAndConnect(): Promise<boolean> {
    if (!isNative()) return false;
    try {
      const devices = await UsbSerial.listDevices();
      if (devices.devices.length === 0) return false;

      const target = devices.devices[0];

      // Request permission if needed
      if (!target.hasPermission) {
        const res = await UsbSerial.requestPermission({ deviceId: target.deviceId });
        if (!res.granted) return false;
      }

      const openRes = await UsbSerial.open({
        deviceId: target.deviceId,
        portNum: 0
      });

      this.portId = openRes.portId;

      // Set standard thermal printer parameters
      await UsbSerial.setParameters({
        portId: this.portId,
        baudRate: 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      });

      return true;
    } catch (err) {
      console.error('USB connection failed', err);
      return false;
    }
  }

  async disconnect() {
    if (this.portId) {
      await UsbSerial.close({ portId: this.portId });
      this.portId = null;
    }
  }

  async printReceipt(data: ReceiptData, paperWidth: '58mm' | '80mm' = '58mm') {
    const connected = await this.scanAndConnect();
    if (!connected) throw new Error('No USB printer found');

    try {
      const commands = generateReceiptCommands(data, paperWidth);
      const bytes = encodeESC(commands);

      // Convert bytes to base64
      const base64 = btoa(String.fromCharCode(...bytes));

      await UsbSerial.write({
        portId: this.portId!,
        data: base64
      });

      return true;
    } catch (err) {
      console.error('USB Printing failed', err);
      throw err;
    } finally {
      await this.disconnect();
    }
  }
}

export const usbPrinter = new UsbPrinterService();
