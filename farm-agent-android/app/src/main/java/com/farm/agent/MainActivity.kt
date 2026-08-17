package com.farm.agent

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material.Text
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.ExistingPeriodicWorkPolicy
import java.util.concurrent.TimeUnit
import com.farm.agent.notifications.VaccinationWorker
import com.farm.agent.repo.SupabaseService
import com.farm.agent.db.AppDatabase
import com.farm.agent.ui.LoginScreen
import com.farm.agent.repo.Repository
import com.farm.agent.ui.DashboardScreen
import com.farm.agent.ui.StocksScreen
import com.farm.agent.ui.ExpensesScreen
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Schedule periodic vaccination check (once per day)
        val workRequest = PeriodicWorkRequestBuilder<VaccinationWorker>(1, TimeUnit.DAYS).build()
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("vaccination_check", ExistingPeriodicWorkPolicy.REPLACE, workRequest)

        setContent {
            // Simple in-memory services for demo; replace with DI in production
            val db = AppDatabase.getInstance(applicationContext)
            val sb = SupabaseService("https://your-project.supabase.co", "PUBLIC_ANON_KEY")
            val repo = Repository(db, sb)

            AppRoot(repo = repo, supabase = sb)
        }
    }
}

@Composable
fun AppRoot() {
    MaterialTheme {
        Surface {
            Text("Farm Management Agent — Scaffold")
        }
    }
}

@Composable
@Composable
fun AppRoot(repo: Repository, supabase: SupabaseService) {
    var signedIn by remember { mutableStateOf(false) }
    var screen by remember { mutableStateOf("dashboard") }
    val scope = rememberCoroutineScope()

    if (!signedIn) {
        LoginScreen(onSignIn = { email, pwd -> supabase.signIn(email, pwd) }, onSignedIn = { signedIn = true })
        } else {
        when (screen) {
            "dashboard" -> DashboardScreen(onNavigate = { dest ->
                when (dest) {
                    "stocks" -> screen = "stocks"
                    "expenses" -> screen = "expenses"
                    "sync" -> scope.launch { repo.syncWithCloud() }
                    "add_stock" -> screen = "add_stock"
                    "add_expense" -> screen = "add_expense"
                    "add_livestock" -> screen = "add_livestock"
                    "add_vaccination" -> screen = "add_vaccination"
                }
            }, repo = repo)
            "stocks" -> StocksScreen(repo = repo, onBack = { screen = "dashboard" })
            "expenses" -> ExpensesScreen(repo = repo, onBack = { screen = "dashboard" })
            "add_stock" -> StockForm(repo = repo, onSaved = { screen = "dashboard" }, onCancel = { screen = "dashboard" })
            "add_expense" -> ExpenseForm(repo = repo, onSaved = { screen = "dashboard" }, onCancel = { screen = "dashboard" })
            "add_livestock" -> LivestockForm(repo = repo, onSaved = { screen = "dashboard" }, onCancel = { screen = "dashboard" })
            "add_vaccination" -> VaccinationForm(repo = repo, onSaved = { screen = "dashboard" }, onCancel = { screen = "dashboard" })
        }
    }
}
