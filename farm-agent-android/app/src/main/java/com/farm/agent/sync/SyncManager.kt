package com.farm.agent.sync

import com.farm.agent.db.AppDatabase
import com.farm.agent.db.StockInputEntity
import com.farm.agent.repo.SupabaseService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/**
 * Simple SyncManager that pulls `stock_inputs` from Supabase and merges into local Room DB.
 * This is a minimal, pull-first implementation to get started.
 */
class SyncManager(private val db: AppDatabase, private val supabase: SupabaseService) {

    suspend fun syncAll() = withContext(Dispatchers.IO) {
        try {
            val path = "/rest/v1/stock_inputs?select=*"
            val resp = supabase.get(path) ?: return@withContext
            val arr = JSONArray(resp)
            val dao = db.stockInputDao()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val name = obj.optString("name", "")
                if (name.isBlank()) continue
                val category = obj.optString("category", "")
                val quantity = obj.optDouble("quantity", 0.0)
                val unit = obj.optString("unit", "")
                val threshold = obj.optDouble("threshold", 0.0)
                val lastUpdated = obj.optLong("lastUpdated", System.currentTimeMillis())

                val entity = StockInputEntity(
                    id = obj.optLong("id", 0),
                    name = name,
                    category = category,
                    quantity = quantity,
                    unit = unit,
                    threshold = threshold,
                    lastUpdated = lastUpdated
                )

                // Upsert locally (Room REPLACE will replace by id)
                dao.insert(entity)
            }
        } catch (e: Exception) {
            // Log or surface error; keep sync resilient
        }
    }
}
