package com.farm.agent.repo

import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * Supabase helpers: sign-in, basic GET/POST, and a placeholder sync entrypoint.
 * Set `supabaseUrl` and `apiKey` when constructing.
 */
class SupabaseService(private val supabaseUrl: String, private val apiKey: String) {
    private val client = OkHttpClient()
    private val json = "application/json; charset=utf-8".toMediaType()
    var authToken: String? = null

    // Expose base URL for sync manager use
    val baseUrl: String get() = supabaseUrl

    suspend fun signIn(email: String, password: String): Boolean {
        val bodyJson = JSONObject()
            .put("email", email)
            .put("password", password)
            .toString()
        val reqBody = bodyJson.toRequestBody(json)
        val req = Request.Builder()
            .url(supabaseUrl.trimEnd('/') + "/auth/v1/token?grant_type=password")
            .addHeader("apikey", apiKey)
            .addHeader("Content-Type", "application/json")
            .post(reqBody)
            .build()

        client.newCall(req).execute().use { resp ->
            if (!resp.isSuccessful) return false
            val body = resp.body?.string() ?: return false
            val obj = JSONObject(body)
            val token = obj.optString("access_token", "")
            if (token.isNotEmpty()) {
                authToken = token
                return true
            }
            return false
        }
    }

    private fun defaultHeaders(): Headers {
        val builder = Headers.Builder()
        builder.add("apikey", apiKey)
        if (!authToken.isNullOrBlank()) {
            builder.add("Authorization", "Bearer $authToken")
        } else {
            builder.add("Authorization", "Bearer $apiKey")
        }
        return builder.build()
    }

    // Basic GET helper for Supabase REST endpoints
    fun get(path: String): String? {
        val req = Request.Builder()
            .url(supabaseUrl.trimEnd('/') + path)
            .headers(defaultHeaders())
            .get()
            .build()
        client.newCall(req).execute().use { resp ->
            return if (resp.isSuccessful) resp.body?.string() else null
        }
    }

    // Basic POST helper
    fun post(path: String, bodyJson: String): String? {
        val reqBody = bodyJson.toRequestBody(json)
        val req = Request.Builder().url(supabaseUrl.trimEnd('/') + path)
            .headers(defaultHeaders())
            .post(reqBody).build()
        client.newCall(req).execute().use { resp ->
            return if (resp.isSuccessful) resp.body?.string() else null
        }
    }

    // Entry point for higher-level sync. Implement delta logic in SyncManager.
    suspend fun syncAll() {
        // left intentionally blank; SyncManager will coordinate
    }
}
