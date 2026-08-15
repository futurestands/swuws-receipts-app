import { sqliteService } from './sqlite-service';
import { getAgentOfflineData } from '@/app/actions/offline-sync';
import { isNative } from '../mobile-hardware';

/**
 * WHATSAPP-STYLE BACKGROUND SYNC MANAGER
 */

class SyncManager {
  private isSyncing = false;
  private syncInterval: any = null;

  async initialize(agentId: string) {
    if (!isNative()) return;

    const { Network } = await import('@capacitor/network');

    // 1. Listen for network changes
    Network.addListener('networkStatusChange', async (status) => {
      console.log('Network status changed', status);
      if (status.connected) {
        await this.autoSync(agentId);
      }
      this.setupPeriodicSync(agentId);
    });

    // 2. Initial sync on open
    const status = await Network.getStatus();
    if (status.connected) {
      this.autoSync(agentId);
    }

    this.setupPeriodicSync(agentId);
  }

  private async setupPeriodicSync(agentId: string) {
    if (this.syncInterval) clearInterval(this.syncInterval);

    const { Network } = await import('@capacitor/network');
    const status = await Network.getStatus();
    if (!status.connected) return;

    // On WiFi: Sync every 30min. On Mobile Data: Sync every 4 hours
    const intervalMs = status.connectionType === 'wifi'
      ? 30 * 60 * 1000
      : 4 * 60 * 60 * 1000;

    this.syncInterval = setInterval(() => {
      this.autoSync(agentId);
    }, intervalMs);
  }

  async autoSync(agentId: string) {
    if (this.isSyncing) return;
    this.isSyncing = true;

    const { BackgroundTask } = await import('@capawesome/capacitor-background-task');

    // Use BackgroundTask to ensure it finishes even if app is minimized
    let taskId: string | null = null;
    if (isNative()) {
      taskId = await BackgroundTask.beforeExit(async () => {
        await this.performSync(agentId);
        if (taskId) BackgroundTask.finish({ taskId });
      });
    } else {
      await this.performSync(agentId);
    }

    this.isSyncing = false;
  }

  private async performSync(agentId: string) {
    const startTime = Date.now();
    let pushResults = { receipts: 0, readings: 0, failures: 0 };

    try {
      // 1. PUSH: Upload pending local items
      const pendingReceipts = await sqliteService.getQueuedReceipts();
      const pendingReadings = await sqliteService.getQueuedMeterReadings();

      const totalPending = pendingReceipts.length + pendingReadings.length;

      if (totalPending > 0) {
        // Sync Receipts via API Route
        if (pendingReceipts.length > 0) {
          const batch = pendingReceipts.map(r => ({
            tempId: r.id,
            data: {
              billingRecordId: r.billingRecordId || undefined,
              customerId: r.customerId,
              customerName: r.customerName,
              amount: r.amount,
              paymentMethod: r.paymentMethod,
              paymentReference: r.paymentReference || undefined,
              notes: r.notes || undefined,
              paymentDate: r.paymentDate || undefined,
              idempotencyKey: r.idempotencyKey
            }
          }));

          const response = await fetch('/api/sync/receipts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch })
          });

          if (!response.ok) throw new Error(`Receipt sync API error: ${response.statusText}`);
          const results = await response.json();

          for (const res of results) {
            await sqliteService.updateQueuedReceiptStatus(res.tempId, res.success ? 'synced' : 'failed', res.serverId, res.error);
            if (res.success) pushResults.receipts++;
            else pushResults.failures++;
          }
          await sqliteService.removeSyncedReceipts();
        }

        // Sync Readings via API Route
        if (pendingReadings.length > 0) {
          const batch = pendingReadings.map(r => ({
            tempId: r.id,
            data: {
              customerId: r.customerId,
              billingPeriodId: r.billingPeriodId,
              currentReading: r.currentReading,
              previousReading: r.previousReading,
              notes: r.notes || undefined,
              idempotencyKey: r.idempotencyKey
            }
          }));

          const response = await fetch('/api/sync/readings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ batch })
          });

          if (!response.ok) throw new Error(`Reading sync API error: ${response.statusText}`);
          const results = await response.json();

          for (const res of results) {
            await sqliteService.updateQueuedReadingStatus(res.tempId, res.success ? 'synced' : 'failed', res.error);
            if (res.success) pushResults.readings++;
            else pushResults.failures++;
          }
          await sqliteService.removeSyncedReadings();
        }

        await sqliteService.logSync({ action: 'push', status: pushResults.failures > 0 ? 'partial' : 'success', details: pushResults });

        // Notify if items were synced
        const syncedCount = pushResults.receipts + pushResults.readings;
        if (syncedCount > 0) {
          await this.notify(`Sync Complete`, `All ${syncedCount} items synced successfully.`);
        }
        if (pushResults.failures > 0) {
          await this.notify(`Sync Warning`, `${pushResults.failures} items failed to sync. Tap to check logs.`);
        }
      }

      // 2. PULL: Refresh local cache
      const data = await getAgentOfflineData();
      await sqliteService.pullSync({ ...data, agentId });
      await sqliteService.logSync({ action: 'pull', status: 'success', details: { customers: data.customers.length } });

    } catch (err: any) {
      console.error('Sync failed', err);
      await sqliteService.logSync({ action: 'pull', status: 'failed', error: err.message });

      // If we have pending items and it failed, notify
      const pendingTotal = (await sqliteService.getQueuedReceipts()).length + (await sqliteService.getQueuedMeterReadings()).length;
      if (pendingTotal > 0) {
         await this.notify(`Sync Failed`, `${pendingTotal} items pending. Connect to stable WiFi to retry.`);
      }
    }
  }

  private async notify(title: string, message: string) {
    // Add to local notification table for the bell dot
    await sqliteService.addNotification({ title, message });

    if (isNative()) {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({
        notifications: [{
          id: Math.floor(Math.random() * 10000),
          title,
          body: message,
          largeIcon: 'res://icon', // Matches mipmap
          smallIcon: 'res://icon',
          schedule: { at: new Date(Date.now() + 500) }
        }]
      });
    }
  }
}

export const syncManager = new SyncManager();
