import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Device } from '@capacitor/device';
import { isNative } from '../mobile-hardware';

const DB_NAME = 'swuws_offline_cache';

export function safeId() {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

class SQLiteService {
  private sqlite: SQLiteConnection = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;

  async initialize(): Promise<void> {
    if (!isNative()) return;

    try {
      // Robust connection management
      const checkResult = await this.sqlite.isConnection(DB_NAME, false);
      if (checkResult.result) {
        this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
      } else {
        this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
      }

      if (!this.db) throw new Error("Could not establish SQLite connection");
      await this.db.open();

      // Ensure all tables exist individually for driver stability
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS local_customers (
          id TEXT PRIMARY KEY,
          customerAccount TEXT,
          name TEXT,
          phone TEXT,
          address TEXT,
          accountBalance TEXT,
          category TEXT,
          active INTEGER,
          updatedAt TEXT,
          lastReading INTEGER DEFAULT 0
        );`);

      // Existing installs created this table without lastReading.
      try {
        await this.db.execute(`ALTER TABLE local_customers ADD COLUMN lastReading INTEGER DEFAULT 0;`);
      } catch {
        /* column already present */
      }

      await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_local_customers_account ON local_customers(customerAccount);`);
      await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_local_customers_name ON local_customers(name);`);
      await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_local_customers_phone ON local_customers(phone);`);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS local_billing_records (
          id TEXT PRIMARY KEY,
          customerId TEXT,
          totalDue TEXT,
          arrears TEXT,
          billAmount TEXT,
          status TEXT,
          billingPeriodId TEXT,
          FOREIGN KEY(customerId) REFERENCES local_customers(id)
        );`);

      await this.db.execute(`CREATE INDEX IF NOT EXISTS idx_local_billing_customer ON local_billing_records(customerId);`);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS sync_meta (
          deviceId TEXT PRIMARY KEY,
          lastSuccessfulPullAt TEXT,
          scopedAgentId TEXT,
          activePeriodId TEXT,
          customerCount INTEGER
        );`);

      try {
        await this.db.execute(`ALTER TABLE sync_meta ADD COLUMN customerCount INTEGER;`);
      } catch {
        /* column already present */
      }

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS local_receipt_queue (
          id TEXT PRIMARY KEY,
          customerId TEXT,
          billingRecordId TEXT,
          amount REAL,
          paymentMethod TEXT,
          paymentReference TEXT,
          notes TEXT,
          paymentDate TEXT,
          idempotencyKey TEXT,
          status TEXT DEFAULT 'queued',
          serverReceiptId TEXT,
          error TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );`);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS local_meter_readings (
          id TEXT PRIMARY KEY,
          customerId TEXT,
          billingPeriodId TEXT,
          previousReading INTEGER,
          currentReading INTEGER,
          notes TEXT,
          idempotencyKey TEXT,
          status TEXT DEFAULT 'queued',
          error TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );`);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS printer_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          type TEXT DEFAULT 'auto',
          deviceId TEXT,
          deviceName TEXT,
          paperWidth TEXT DEFAULT '58mm',
          networkIp TEXT
        );`);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS local_print_logs (
          id TEXT PRIMARY KEY,
          receiptId TEXT,
          printerType TEXT,
          status TEXT, -- 'success', 'failed'
          error TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );`);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS local_sync_logs (
          id TEXT PRIMARY KEY,
          action TEXT, -- 'pull', 'push'
          status TEXT, -- 'success', 'failed', 'partial'
          details TEXT, -- JSON string
          error TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );`);

      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS local_notifications (
          id TEXT PRIMARY KEY,
          title TEXT,
          message TEXT,
          read INTEGER DEFAULT 0,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );`);
    } catch (err) {
      console.error('SQLite initialization failed', err);
    }
  }

  async beginFullPull(): Promise<void> {
    if (!this.db) return;
    // Receipt / reading queues are kept. Only the searchable cache is replaced.
    await this.db.execute(`DELETE FROM local_billing_records;`);
    await this.db.execute(`DELETE FROM local_customers;`);
  }

  async insertPullPage(customers: any[], billingRecords: any[]): Promise<void> {
    if (!this.db) return;

    const set: any[] = [];
    for (const c of customers) {
      set.push({
        statement: `INSERT INTO local_customers (id, customerAccount, name, phone, address, accountBalance, category, active, updatedAt, lastReading)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values: [
          c.id,
          c.customerAccount,
          c.name,
          c.phone,
          c.address,
          String(c.accountBalance ?? 0),
          c.category,
          c.active ? 1 : 0,
          c.updatedAt,
          Number(c.lastReading ?? 0),
        ],
      });
    }

    for (const br of billingRecords) {
      set.push({
        statement: `INSERT INTO local_billing_records (id, customerId, totalDue, arrears, billAmount, status, billingPeriodId)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
        values: [br.id, br.customerId, String(br.totalDue ?? 0), String(br.arrears ?? 0), String(br.billAmount ?? 0), br.status, br.billingPeriodId],
      });
    }

    // Binder-safe chunks. Never build a 100k-statement array in one go —
    // callers must page before they reach this method.
    const CHUNK_SIZE = 200;
    for (let i = 0; i < set.length; i += CHUNK_SIZE) {
      await this.db.executeSet(set.slice(i, i + CHUNK_SIZE));
    }
  }

  async finishFullPull(data: {
    timestamp: string;
    agentId: string;
    activePeriodId: string | null;
    customerCount: number;
  }): Promise<void> {
    if (!this.db) return;
    const deviceId = (await Device.getId()).identifier;
    await this.db.run(
      `INSERT OR REPLACE INTO sync_meta (deviceId, lastSuccessfulPullAt, scopedAgentId, activePeriodId, customerCount) VALUES (?, ?, ?, ?, ?)`,
      [deviceId, data.timestamp, data.agentId, data.activePeriodId, data.customerCount]
    );
  }

  async pullSync(data: {
    customers: any[];
    billingRecords: any[];
    activePeriodId: string | null;
    timestamp: string;
    agentId: string;
  }): Promise<void> {
    try {
      await this.beginFullPull();
      await this.insertPullPage(data.customers, data.billingRecords);
      await this.finishFullPull({
        timestamp: data.timestamp,
        agentId: data.agentId,
        activePeriodId: data.activePeriodId,
        customerCount: data.customers.length,
      });
    } catch (err) {
      console.error('SQLite pullSync failed', err);
      throw err;
    }
  }

  async getSyncMeta() {
    if (!this.db) return null;
    const res = await this.db.query('SELECT * FROM sync_meta LIMIT 1;');
    return res.values?.[0] || null;
  }

  async searchCustomers(query: string, page = 1, pageSize = 50) {
    const empty = { customers: [] as any[], total: 0, page: 1, pageSize, totalPages: 1 }
    if (!this.db) return empty

    const safePageSize = Math.min(100, Math.max(1, pageSize))
    const safePage = Math.max(1, page)
    const trimmed = query.trim()
    const where = trimmed
      ? `WHERE name LIKE ? OR customerAccount LIKE ? OR phone LIKE ?`
      : ""
    const likeParams = trimmed ? [`%${trimmed}%`, `%${trimmed}%`, `%${trimmed}%`] : []

    const countRes = await this.db.query(
      `SELECT COUNT(*) AS total FROM local_customers ${where};`,
      likeParams,
    )
    const countRow = countRes.values?.[0]
    const total = Number(
      countRow?.total ??
      (Array.isArray(countRow) ? countRow[0] : Object.values(countRow || {})[0]) ??
      0,
    )
    const totalPages = Math.max(1, Math.ceil(total / safePageSize))
    const pageClamped = Math.min(safePage, totalPages)
    const offsetClamped = (pageClamped - 1) * safePageSize

    const res = await this.db.query(
      `SELECT * FROM local_customers ${where} ORDER BY name LIMIT ${safePageSize} OFFSET ${offsetClamped};`,
      likeParams,
    )

    return {
      customers: res.values || [],
      total,
      page: pageClamped,
      pageSize: safePageSize,
      totalPages,
    }
  }

  async filterCachedIds(ids: string[]) {
    const found = new Set<string>()
    if (!this.db || ids.length === 0) return found
    const CHUNK = 200
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK)
      const placeholders = chunk.map(() => "?").join(",")
      const res = await this.db.query(
        `SELECT id FROM local_customers WHERE id IN (${placeholders});`,
        chunk,
      )
      for (const row of res.values || []) {
        const id = Array.isArray(row) ? row[0] : row.id
        if (id) found.add(String(id))
      }
    }
    return found
  }

  async getCustomerWithBill(customerId: string) {
    if (!this.db) return null;

    const custRes = await this.db.query('SELECT * FROM local_customers WHERE id = ?;', [customerId]);
    const cust = custRes.values?.[0];
    if (!cust) return null;

    const billRes = await this.db.query('SELECT * FROM local_billing_records WHERE customerId = ? LIMIT 1;', [customerId]);
    const bill = billRes.values?.[0];

    return { customer: cust, bill };
  }

  async enqueueReceipt(data: {
    id: string;
    customerId: string;
    billingRecordId?: string;
    amount: number;
    paymentMethod: string;
    paymentReference?: string;
    notes?: string;
    paymentDate: string;
  }): Promise<void> {
    if (!this.db) throw new Error("Local database is not open. Open Offline Mode and sync the cache first.");
    const idempotencyKey = safeId();
    await this.db.run(
      `INSERT INTO local_receipt_queue (id, customerId, billingRecordId, amount, paymentMethod, paymentReference, notes, paymentDate, idempotencyKey)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.customerId, data.billingRecordId || null, data.amount, data.paymentMethod, data.paymentReference || null, data.notes || null, data.paymentDate, idempotencyKey]
    );
  }

  async getQueuedReceipts() {
    if (!this.db) return [];
    // Join with customer name for display
    const res = await this.db.query(`
      SELECT q.*, c.name as customerName, c.customerAccount
      FROM local_receipt_queue q
      LEFT JOIN local_customers c ON q.customerId = c.id
      WHERE q.status != 'synced'
      ORDER BY q.createdAt ASC;
    `);
    return res.values || [];
  }

  async updateQueuedReceiptStatus(id: string, status: 'queued' | 'syncing' | 'synced' | 'failed', serverReceiptId?: string, error?: string): Promise<void> {
    if (!this.db) return;
    await this.db.run(
      `UPDATE local_receipt_queue SET status = ?, serverReceiptId = ?, error = ? WHERE id = ?`,
      [status, serverReceiptId || null, error || null, id]
    );
  }

  async removeSyncedReceipts(): Promise<void> {
    if (!this.db) return;
    await this.db.execute(`DELETE FROM local_receipt_queue WHERE status = 'synced'`);
  }

  async enqueueMeterReading(data: {
    id: string;
    customerId: string;
    billingPeriodId: string;
    previousReading: number;
    currentReading: number;
    notes?: string;
  }): Promise<void> {
    if (!this.db) throw new Error("Local database is not open. Open Offline Mode and sync the cache first.");
    const idempotencyKey = safeId();
    await this.db.run(
      `INSERT INTO local_meter_readings (id, customerId, billingPeriodId, previousReading, currentReading, notes, idempotencyKey)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.customerId, data.billingPeriodId, data.previousReading, data.currentReading, data.notes || null, idempotencyKey]
    );
  }

  async getQueuedMeterReadings() {
    if (!this.db) return [];
    const res = await this.db.query(`
      SELECT q.*, c.name as customerName, c.customerAccount
      FROM local_meter_readings q
      LEFT JOIN local_customers c ON q.customerId = c.id
      WHERE q.status != 'synced'
      ORDER BY q.createdAt ASC;
    `);
    return res.values || [];
  }

  async updateQueuedReadingStatus(id: string, status: 'queued' | 'syncing' | 'synced' | 'failed', error?: string): Promise<void> {
    if (!this.db) return;
    await this.db.run(
      `UPDATE local_meter_readings SET status = ?, error = ? WHERE id = ?`,
      [status, error || null, id]
    );
  }

  async removeSyncedReadings(): Promise<void> {
    if (!this.db) return;
    await this.db.execute(`DELETE FROM local_meter_readings WHERE status = 'synced'`);
  }

  async getPrinterSettings() {
    if (!this.db) return null;
    const res = await this.db.query('SELECT * FROM printer_settings WHERE id = 1;');
    return res.values?.[0] || { type: 'auto', paperWidth: '58mm' };
  }

  async updatePrinterSettings(settings: { type: string, deviceId?: string | null, deviceName?: string | null, paperWidth?: string, networkIp?: string | null }) {
    if (!this.db) return;
    await this.db.run(
      `INSERT OR REPLACE INTO printer_settings (id, type, deviceId, deviceName, paperWidth, networkIp) VALUES (1, ?, ?, ?, ?, ?)`,
      [settings.type, settings.deviceId || null, settings.deviceName || null, settings.paperWidth || '58mm', settings.networkIp || null]
    );
  }

  async logPrint(data: { receiptId: string, printerType: string, status: 'success' | 'failed', error?: string }) {
    if (!this.db) return;
    const id = safeId();
    await this.db.run(
      `INSERT INTO local_print_logs (id, receiptId, printerType, status, error) VALUES (?, ?, ?, ?, ?)`,
      [id, data.receiptId, data.printerType, data.status, data.error || null]
    );
  }

  async getPrintLogs() {
    if (!this.db) return [];
    const res = await this.db.query('SELECT * FROM local_print_logs ORDER BY createdAt DESC LIMIT 100;');
    return res.values || [];
  }

  async logSync(data: { action: 'pull' | 'push', status: 'success' | 'failed' | 'partial', details?: any, error?: string }) {
    if (!this.db) return;
    const id = safeId();
    await this.db.run(
      `INSERT INTO local_sync_logs (id, action, status, details, error) VALUES (?, ?, ?, ?, ?)`,
      [id, data.action, data.status, data.details ? JSON.stringify(data.details) : null, data.error || null]
    );
  }

  async getSyncLogs() {
    if (!this.db) return [];
    const res = await this.db.query('SELECT * FROM local_sync_logs ORDER BY createdAt DESC LIMIT 50;');
    return res.values || [];
  }

  async addNotification(data: { title: string, message: string }) {
    if (!this.db) return;
    const id = safeId();
    await this.db.run(
      `INSERT INTO local_notifications (id, title, message) VALUES (?, ?, ?)`,
      [id, data.title, data.message]
    );
  }

  async getNotifications() {
    if (!this.db) return [];
    const res = await this.db.query('SELECT * FROM local_notifications ORDER BY createdAt DESC LIMIT 50;');
    return res.values || [];
  }

  async markNotificationRead(id: string) {
    if (!this.db) return;
    await this.db.run(`UPDATE local_notifications SET read = 1 WHERE id = ?`, [id]);
  }

  async getUnreadNotificationCount() {
    if (!this.db) return 0;
    const res = await this.db.query('SELECT count(*) as count FROM local_notifications WHERE read = 0;');
    return res.values?.[0]?.count || 0;
  }
}

export const sqliteService = new SQLiteService();
