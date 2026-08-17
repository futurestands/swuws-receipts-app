package com.farm.agent.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.Icon
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.farm.agent.repo.Repository

@Composable
fun ExpensesScreen(repo: Repository, onBack: () -> Unit) {
    var itemsList by remember { mutableStateOf(listOf<com.farm.agent.db.ExpenseEntity>()) }

    LaunchedEffect(Unit) {
        itemsList = repo.listExpenses()
    }

    Column(modifier = Modifier.fillMaxSize().padding(8.dp)) {
        Icon(imageVector = Icons.Default.ArrowBack, contentDescription = "Back", modifier = Modifier.clickable { onBack() })
        Text("Expenses", style = MaterialTheme.typography.h6)
        LazyColumn {
            items(itemsList) { e ->
                Text("${e.type}: ${e.amount} — ${e.notes ?: ""}", modifier = Modifier.padding(8.dp))
            }
        }
    }
}
