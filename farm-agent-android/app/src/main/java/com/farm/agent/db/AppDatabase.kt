package com.farm.agent.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [
        StockInputEntity::class,
        ExpenseEntity::class,
        LivestockEntity::class,
        VaccinationEntity::class,
        NotificationEntity::class
    ],
    version = 1,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun stockInputDao(): StockInputDao
    abstract fun expenseDao(): ExpenseDao
    abstract fun livestockDao(): LivestockDao
    abstract fun vaccinationDao(): VaccinationDao
    abstract fun notificationDao(): NotificationDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "farm_agent_db"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
