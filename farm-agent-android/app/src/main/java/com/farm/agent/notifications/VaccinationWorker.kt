package com.farm.agent.notifications

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.farm.agent.db.AppDatabase

/**
 * Periodic worker to check upcoming vaccinations and schedule notifications.
 */
class VaccinationWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        try {
            val db = AppDatabase.getInstance(applicationContext)
            val pending = db.vaccinationDao().pending()
            val now = System.currentTimeMillis()
            for (v in pending) {
                // If due within 24 hours, emit a notification
                if (v.dueDate - now <= 24 * 60 * 60 * 1000L) {
                    NotificationHelper.createChannel(applicationContext)
                    val notif = NotificationHelper.build(applicationContext, "Vaccination due", "${v.vaccineName} for animal ${v.animalId} is due")
                    val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                    nm.notify((v.id % 10000).toInt(), notif.build())
                }
            }
            return Result.success()
        } catch (e: Exception) {
            return Result.retry()
        }
    }
}
