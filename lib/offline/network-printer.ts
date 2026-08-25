import { TcpSocket, DataEncoding } from 'capacitor-tcp-socket';
import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData, INIT } from './esc-pos-helper';

/**
 * NATIVE NETWORK PRINTER SERVICE (WiFi/TCP 9100)
 */

// Common private-network prefixes actually used by consumer/small-office
// routers and Android's own mobile-hotspot default. There is no reliable
// way to read this device's own subnet from within Capacitor without
// adding new native code (@capacitor/network only exposes connection
// TYPE, not local IP) -- rather than build and ship untested native
// plumbing for that, this scans the ranges that cover the overwhelming
// majority of real small networks. Manual IP entry remains available as
// a fallback for anything outside these ranges.
const COMMON_SUBNET_PREFIXES = ['192.168.1.', '192.168.0.', '192.168.43.', '10.0.0.'];
const SCAN_TIMEOUT_MS = 350;
const SCAN_BATCH_SIZE = 32; // parallel connection attempts per batch

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

class NetworkPrinterService {
  /**
   * Attempts a real TCP connection + a tiny, harmless ESC/POS reset
   * command, then disconnects. This is the actual "is a printer really
   * there" check -- used both by the network scan below and by the
   * settings screen's explicit "Connect" step, which must succeed before
   * an IP is saved as the active printer.
   */
  async testConnection(ip: string): Promise<{ ok: boolean; error?: string }> {
    if (!isNative()) return { ok: false, error: 'Native app required' };
    let clientId: number | null = null;
    try {
      const connectRes = await withTimeout(
        TcpSocket.connect({ ipAddress: ip, port: 9100 }),
        SCAN_TIMEOUT_MS
      );
      clientId = connectRes.client;

      // A successful TCP connect on port 9100 could in principle be any
      // listening device, not necessarily a printer -- send the harmless
      // ESC @ reset command as a lightweight real probe rather than just
      // trusting that the socket opened.
      const bytes = encodeESC(INIT);
      const base64 = btoa(String.fromCharCode(...bytes));
      await TcpSocket.send({ client: clientId, data: base64, encoding: DataEncoding.BASE64 });

      await TcpSocket.disconnect({ client: clientId });
      return { ok: true };
    } catch (err) {
      if (clientId !== null) {
        try { await TcpSocket.disconnect({ client: clientId }); } catch {}
      }
      return { ok: false, error: err instanceof Error ? err.message : 'Could not connect' };
    }
  }

  /**
   * Scans the common subnet prefixes above for anything listening on
   * port 9100 (the standard thermal-printer TCP port). Returns the list
   * of IPs that responded to a real connect attempt -- not a guess, an
   * actual verified reachability check for each one.
   */
  async scanForPrinters(onProgress?: (scanned: number, total: number) => void): Promise<string[]> {
    if (!isNative()) return [];

    const candidates: string[] = [];
    for (const prefix of COMMON_SUBNET_PREFIXES) {
      for (let i = 1; i <= 254; i++) candidates.push(`${prefix}${i}`);
    }

    const found: string[] = [];
    let scanned = 0;

    for (let i = 0; i < candidates.length; i += SCAN_BATCH_SIZE) {
      const batch = candidates.slice(i, i + SCAN_BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async ip => {
          const result = await this.testConnection(ip);
          return result.ok ? ip : null;
        })
      );
      found.push(...results.filter((ip): ip is string => ip !== null));
      scanned += batch.length;
      onProgress?.(scanned, candidates.length);
    }

    return found;
  }

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
