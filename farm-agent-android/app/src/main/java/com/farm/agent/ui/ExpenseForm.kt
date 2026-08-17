package com.farm.agent.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.Button
import androidx.compose.material.OutlinedTextField
import androidx.compose.material.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.farm.agent.db.ExpenseEntity
import com.farm.agent.repo.Repository

@Composable
fun ExpenseForm(repo: Repository, onSaved: () -> Unit, onCancel: () -> Unit) {
    var type by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(value = type, onValueChange = { type = it }, label = { Text("Type") })
        OutlinedTextField(value = amount, onValueChange = { amount = it }, label = { Text("Amount") })
        OutlinedTextField(value = notes, onValueChange = { notes = it }, label = { Text("Notes") })
        Spacer(modifier = Modifier.height(12.dp))
        Row {
            Button(onClick = {
                val a = amount.toDoubleOrNull() ?: 0.0
                val entity = ExpenseEntity(type = type, amount = a, notes = notes)
                LaunchedEffect(Unit) {
                    repo.addExpense(entity)
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
