package com.farm.agent.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.Button
import androidx.compose.material.OutlinedTextField
import androidx.compose.material.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.farm.agent.db.StockInputEntity
import com.farm.agent.repo.Repository

@Composable
fun StockForm(repo: Repository, onSaved: () -> Unit, onCancel: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("0") }
    var unit by remember { mutableStateOf("") }
    var threshold by remember { mutableStateOf("0") }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Name") })
        OutlinedTextField(value = category, onValueChange = { category = it }, label = { Text("Category") })
        OutlinedTextField(value = quantity, onValueChange = { quantity = it }, label = { Text("Quantity") })
        OutlinedTextField(value = unit, onValueChange = { unit = it }, label = { Text("Unit") })
        OutlinedTextField(value = threshold, onValueChange = { threshold = it }, label = { Text("Threshold") })
        Spacer(modifier = Modifier.height(12.dp))
        Row {
            Button(onClick = {
                val q = quantity.toDoubleOrNull() ?: 0.0
                val t = threshold.toDoubleOrNull() ?: 0.0
                val entity = StockInputEntity(name = name, category = category, quantity = q, unit = unit, threshold = t)
                // Launch coroutine in Compose scope
                LaunchedEffect(Unit) {
                    repo.addStock(entity)
                    onSaved()
                }
            }) {
                Text("Save")
            }
            Spacer(modifier = Modifier.width(8.dp))
            Button(onClick = onCancel) { Text("Cancel") }
        }
    }
}
