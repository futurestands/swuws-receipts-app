import { TcpSocket, DataEncoding } from 'capacitor-tcp-socket';
import { isNative } from '../mobile-hardware';
import { generateReceiptCommands, encodeESC, ReceiptData, INIT } from './esc-pos-helper';

/**
 * WiFi / LAN thermal printers (JetDirect TCP 9100).
 *
 * Discovery used to open 32 sockets at once across four /24s with a 350ms
 * cutoff. That knocked weak Android WiFi down before a printer could answer,
 * which looked like "it drops without connecting." Connect and print now use
 * a long timeout; scan is sequential, small-batch, and TCP-only.
 */

const SCAN_PREFIXES = [
  '192.168.1.',
  '192.168.0.',
  '192.168.8.',
  '192.168.43.',
  '192.168.137.',
  '10.0.0.',
];
const SCAN_TIMEOUT_MS = 700;
const CONNECT_TIMEOUT_MS = 8_000;
const SCAN_BATCH_SIZE = 4;

type TcpConnectOpts = Parameters<typeof TcpSocket.connect>[0] & { timeout: number };

function tcpConnect(ip: string, timeoutMs: number) {
  return TcpSocket.connect({
    ipAddress: ip.trim(),
    port: 9100,
    timeout: timeoutMs,
  } as TcpConnectOpts);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

class NetworkPrinterService {
  private busy = false;

  private async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new Error('Printer is already busy. Wait a moment and try again.');
    }
    this.busy = true;
    try {
      return await fn();
    } finally {
      this.busy = false;
    }
  }

  private async close(clientId: number | null) {
    if (clientId === null) return;
    try {
      await TcpSocket.disconnect({ client: clientId });
    } catch {
      /* already closed */
    }
  }

  /**
   * Probe one IP. Scan uses a short TCP-only check. Connect uses a longer
   * timeout and sends ESC @ so we know port 9100 is actually a printer.
   */
  async testConnection(
    ip: string,
    opts: { timeoutMs?: number; sendReset?: boolean } = {},
  ): Promise<{ ok: boolean; error?: string }> {
    if (!isNative()) return { ok: false, error: 'Open this screen in the Android app' };
    const timeoutMs = opts.timeoutMs ?? CONNECT_TIMEOUT_MS;
    const sendReset = opts.sendReset ?? true;
    let clientId: number | null = null;
    try {
      const connectRes = await withTimeout(
        tcpConnect(ip, timeoutMs),
        timeoutMs + 500,
        `No answer from ${ip} on port 9100`,
      );
      clientId = connectRes.client;
      if (sendReset) {
        const bytes = encodeESC(INIT);
        const base64 = btoa(String.fromCharCode(...bytes));
        await withTimeout(
          TcpSocket.send({ client: clientId, data: base64, encoding: DataEncoding.BASE64 }),
          3_000,
          'Printer accepted the socket but did not take data',
        );
      }
      await this.close(clientId);
      return { ok: true };
    } catch (err) {
      await this.close(clientId);
      return { ok: false, error: err instanceof Error ? err.message : 'Could not connect' };
    }
  }

  async scanForPrinters(onProgress?: (scanned: number, total: number) => void): Promise<string[]> {
    if (!isNative()) return [];

    return this.runExclusive(async () => {
      const prefixes = SCAN_PREFIXES;
      const perPrefix = 254;
      const total = prefixes.length * perPrefix;
      const found: string[] = [];
      let scanned = 0;

      for (const prefix of prefixes) {
        for (let start = 1; start <= 254; start += SCAN_BATCH_SIZE) {
          const batch: string[] = [];
          for (let i = start; i < start + SCAN_BATCH_SIZE && i <= 254; i++) {
            batch.push(`${prefix}${i}`);
          }
          const results = await Promise.all(
            batch.map(async (ip) => {
              const result = await this.testConnection(ip, { timeoutMs: SCAN_TIMEOUT_MS, sendReset: false });
              return result.ok ? ip : null;
            }),
          );
          found.push(...results.filter((ip): ip is string => ip !== null));
          scanned += batch.length;
          onProgress?.(scanned, total);
        }
        if (found.length > 0) break;
      }

      return found;
    });
  }

  async printReceipt(data: ReceiptData, ip: string, paperWidth: '58mm' | '80mm' = '58mm') {
    if (!isNative()) return false;
    if (!ip) throw new Error('No printer IP saved. Open Printer Settings, enter the IP, tap Connect.');

    return this.runExclusive(async () => {
      let clientId: number | null = null;
      try {
        const connectRes = await withTimeout(
          tcpConnect(ip, CONNECT_TIMEOUT_MS),
          CONNECT_TIMEOUT_MS + 500,
          `Could not reach printer at ${ip}:9100`,
        );
        clientId = connectRes.client;

        const commands = generateReceiptCommands(data, paperWidth);
        const bytes = encodeESC(commands);
        const base64 = btoa(String.fromCharCode(...bytes));

        await withTimeout(
          TcpSocket.send({
            client: clientId,
            data: base64,
            encoding: DataEncoding.BASE64,
          }),
          CONNECT_TIMEOUT_MS,
          'Connected, but the printer did not accept the receipt',
        );

        await this.close(clientId);
        return true;
      } catch (err) {
        await this.close(clientId);
        throw new Error(err instanceof Error ? err.message : `Could not print to ${ip}:9100`);
      }
    });
  }
}

export const networkPrinter = new NetworkPrinterService();
