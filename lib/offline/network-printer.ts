import { TcpSocket, DataEncoding } from 'capacitor-tcp-socket';
import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData } from './esc-pos-helper';

/**
 * NATIVE NETWORK PRINTER SERVICE (WiFi/TCP 9100)
 */

class NetworkPrinterService {
  async printReceipt(data: ReceiptData, ip: string, paperWidth: '58mm' | '80mm' = '58mm') {
    if (!isNative()) return false;
    if (!ip) throw new Error('Printer IP address not configured');

    let clientId: number | null = null;

    try {
      // Connect to Port 9100 (Standard for JetDirect/Thermal printers)
      const connectRes = await TcpSocket.connect({
        ipAddress: ip,
        port: 9100
      });

      clientId = connectRes.client;

      const commands = generateReceiptCommands(data, paperWidth);
      const bytes = encodeESC(commands);

      // Convert bytes to base64 for transmission
      const base64 = btoa(String.fromCharCode(...bytes));

      await TcpSocket.send({
        client: clientId,
        data: base64,
        encoding: DataEncoding.BASE64
      });

      await TcpSocket.disconnect({ client: clientId });

      return true;
    } catch (err) {
      console.error('Network Printing failed', err);
      // Ensure socket is closed on error
      if (clientId !== null) {
        try { await TcpSocket.disconnect({ client: clientId }); } catch {}
      }
      throw new Error(`Could not connect to printer at ${ip}:9100`);
    }
  }
}

export const networkPrinter = new NetworkPrinterService();
