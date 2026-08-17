package com.farm.agent.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.*

@Entity(tableName = "stock_inputs")
data class StockInputEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val category: String,
    val quantity: Double,
    val unit: String,
    val threshold: Double = 0.0,
    val lastUpdated: Long = System.currentTimeMillis()
)

@Entity(tableName = "expenses")
data class ExpenseEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: String,
    val amount: Double,
    val date: Long = System.currentTimeMillis(),
    val notes: String? = null
)

@Entity(tableName = "livestock")
data class LivestockEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val tag: String,
    val species: String,
    val breed: String? = null,
    val dob: Long? = null,
    val sex: String? = null,
    val notes: String? = null
)

@Entity(tableName = "vaccinations")
data class VaccinationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val animalId: Long,
    val vaccineName: String,
    val dueDate: Long,
    val completed: Boolean = false,
    val completedDate: Long? = null
)

@Entity(tableName = "notifications")
data class NotificationEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val title: String,
    val message: String,
    val dueDate: Long,
    val seen: Boolean = false,
    val recurringRule: String? = null
)
