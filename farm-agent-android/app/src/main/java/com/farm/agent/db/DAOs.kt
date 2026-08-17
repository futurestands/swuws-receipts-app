package com.farm.agent.db

import androidx.room.*

@Dao
interface StockInputDao {
    @Query("SELECT * FROM stock_inputs ORDER BY name")
    suspend fun all(): List<StockInputEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: StockInputEntity): Long

    @Update
    suspend fun update(item: StockInputEntity)

    @Delete
    suspend fun delete(item: StockInputEntity)
}

@Dao
interface ExpenseDao {
    @Query("SELECT * FROM expenses ORDER BY date DESC")
    suspend fun all(): List<ExpenseEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: ExpenseEntity): Long
}

@Dao
interface LivestockDao {
    @Query("SELECT * FROM livestock ORDER BY tag")
    suspend fun all(): List<LivestockEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: LivestockEntity): Long
}

@Dao
interface VaccinationDao {
    @Query("SELECT * FROM vaccinations WHERE completed = 0 ORDER BY dueDate ASC")
    suspend fun pending(): List<VaccinationEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: VaccinationEntity): Long

    @Update
    suspend fun update(item: VaccinationEntity)
}

@Dao
interface NotificationDao {
    @Query("SELECT * FROM notifications ORDER BY dueDate ASC")
    suspend fun all(): List<NotificationEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(item: NotificationEntity): Long

    @Update
    suspend fun update(item: NotificationEntity)
}
