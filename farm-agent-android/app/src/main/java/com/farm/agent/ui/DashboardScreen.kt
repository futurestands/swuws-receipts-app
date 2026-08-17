package com.farm.agent.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.Button
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.farm.agent.repo.Repository

@Composable
fun DashboardScreen(onNavigate: (String) -> Unit, repo: Repository) {
    Column(modifier = Modifier.fillMaxSize().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text("Farm Dashboard", modifier = Modifier.padding(8.dp))
        Spacer(modifier = Modifier.height(12.dp))
        Button(onClick = { onNavigate("stocks") }, modifier = Modifier.fillMaxWidth().padding(8.dp)) {
            Text("View Stocks")
        }
        Button(onClick = { onNavigate("expenses") }, modifier = Modifier.fillMaxWidth().padding(8.dp)) {
            Text("View Expenses")
        }
        Button(onClick = { onNavigate("sync") }, modifier = Modifier.fillMaxWidth().padding(8.dp)) {
            Text("Sync Now")
        }
        Spacer(modifier = Modifier.height(8.dp))
        Button(onClick = { onNavigate("add_stock") }, modifier = Modifier.fillMaxWidth().padding(8.dp)) { Text("Add Stock") }
        Button(onClick = { onNavigate("add_expense") }, modifier = Modifier.fillMaxWidth().padding(8.dp)) { Text("Add Expense") }
        Button(onClick = { onNavigate("add_livestock") }, modifier = Modifier.fillMaxWidth().padding(8.dp)) { Text("Add Livestock") }
        Button(onClick = { onNavigate("add_vaccination") }, modifier = Modifier.fillMaxWidth().padding(8.dp)) { Text("Add Vaccination") }
    }
}
