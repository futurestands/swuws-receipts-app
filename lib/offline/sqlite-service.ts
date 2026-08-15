import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Device } from '@capacitor/device';
import { isNative } from '../mobile-hardware';

const DB_NAME = 'swuws_offline_cache';

class SQLiteService {
  private sqlite: SQLiteConnection = new SQLiteConnection(CapacitorSQLite);
  private db: SQLiteDBConnection | null = null;

  async initialize(): Promise<void> {
    if (!isNative()) return;

    try {
      this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
      await this.db.open();

      // Define Schema (Phase 1 & 2)
      const schema = `
        CREATE TABLE IF NOT EXISTS local_customers (
          id TEXT PRIMARY KEY,
          customerAccount TEXT,
          name TEXT,
          phone TEXT,
          address TEXT,
          accountBalance TEXT,
          category TEXT,
          active INTEGER,
          updatedAt TEXT
        );

        CREATE TABLE IF NOT EXISTS local_billing_records (
          id TEXT PRIMARY KEY,
          customerId TEXT,
          totalDue TEXT,
          arrears TEXT,
          billAmount TEXT,
          status TEXT,
          billingPeriodId TEXT,
          FOREIGN KEY(customerId) REFERENCES local_customers(id)
        );

        CREATE TABLE IF NOT EXISTS sync_meta (
          deviceId TEXT PRIMARY KEY,
          lastSuccessfulPullAt TEXT,
          scopedAgentId TEXT
        );

        CREATE TABLE IF NOT EXISTS local_receipt_queue (
          id TEXT PRIMARY KEY,
          customerId TEXT,
          billingRecordId TEXT,
          amount REAL,
          paymentMethod TEXT,
          paymentReference TEXT,
          notes TEXT,
          paymentDate TEXT,
          status TEXT DEFAULT 'queued',
          serverReceiptId TEXT,
          error TEXT,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `;

      await this.db.execute(schema);
    } catch (err) {
      console.error('SQLite initialization failed', err);
    }
  }

  async pullSync(data: {
    customers: any[];
    billingRecords: any[];
    activePeriodId: string | null;
    timestamp: string;
    agentId: string;
  }): Promise<void> {
    if (!this.db) return;

    try {
      const deviceId = (await Device.getId()).identifier;

      await this.db.execute('BEGIN TRANSACTION;');

      // Clear existing cache (simple pull-sync for Phase 1)
      await this.db.execute('DELETE FROM local_billing_records;');
      await this.db.execute('DELETE FROM local_customers;');

      // Insert customers
      for (const c of data.customers) {
        await this.db.run(
          `INSERT INTO local_customers (id, customerAccount, name, phone, address, accountBalance, category, active, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.customerAccount, c.name, c.phone, c.address, String(c.accountBalance), c.category, c.active ? 1 : 0, c.updatedAt]
        );
      }

      // Insert billing records
      for (const br of data.billingRecords) {
        await this.db.run(
          `INSERT INTO local_billing_records (id, customerId, totalDue, arrears, billAmount, status, billingPeriodId)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [br.id, br.customerId, String(br.totalDue), String(br.arrears), String(br.billAmount), br.status, br.billingPeriodId]
        );
      }

      // Update sync meta
      await this.db.run(
        `INSERT OR REPLACE INTO sync_meta (deviceId, lastSuccessfulPullAt, scopedAgentId) VALUES (?, ?, ?)`,
        [deviceId, data.timestamp, data.agentId]
      );

      await this.db.execute('COMMIT;');
    } catch (err) {
      if (this.db) await this.db.execute('ROLLBACK;');
      console.error('SQLite pullSync failed', err);
      throw err;
    }
  }

  async getSyncMeta() {
    if (!this.db) return null;
    const res = await this.db.query('SELECT * FROM sync_meta LIMIT 1;');
    return res.values?.[0] || null;
  }

  async searchCustomers(query: string) {
    if (!this.db) return [];

    const sql = query.trim()
      ? `SELECT * FROM local_customers WHERE name LIKE ? OR customerAccount LIKE ? OR phone LIKE ? ORDER BY name LIMIT 50;`
      : `SELECT * FROM local_customers ORDER BY name LIMIT 50;`;

    const params = query.trim() ? [`%${query}%`, `%${query}%`, `%${query}%`] : [];
    const res = await this.db.query(sql, params);
    return res.values || [];
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
    if (!this.db) return;
    await this.db.run(
      `INSERT INTO local_receipt_queue (id, customerId, billingRecordId, amount, paymentMethod, paymentReference, notes, paymentDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.id, data.customerId, data.billingRecordId || null, data.amount, data.paymentMethod, data.paymentReference || null, data.notes || null, data.paymentDate]
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
}

export const sqliteService = new SQLiteService();
