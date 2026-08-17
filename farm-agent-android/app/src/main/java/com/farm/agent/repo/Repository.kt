package com.farm.agent.repo

import com.farm.agent.db.*
import com.farm.agent.sync.SyncManager

class Repository(private val db: AppDatabase, private val supabase: SupabaseService) {

    val stockDao = db.stockInputDao()
    val expenseDao = db.expenseDao()
    val livestockDao = db.livestockDao()
    val vacDao = db.vaccinationDao()
    val notifDao = db.notificationDao()

    // Local operations
    suspend fun addStock(item: StockInputEntity) = stockDao.insert(item)
    suspend fun listStocks() = stockDao.all()
    suspend fun listExpenses() = expenseDao.all()
    suspend fun addExpense(item: ExpenseEntity) = expenseDao.insert(item)
    suspend fun addLivestock(item: LivestockEntity) = livestockDao.insert(item)
    suspend fun addVaccination(item: VaccinationEntity) = vacDao.insert(item)

    // Sync: delegate to SyncManager which coordinates pull/merge logic
    suspend fun syncWithCloud() {
        val manager = SyncManager(db, supabase)
        manager.syncAll()
    }
}
