package com.farm.agent.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.Button
import androidx.compose.material.OutlinedTextField
import androidx.compose.material.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.farm.agent.db.VaccinationEntity
import com.farm.agent.repo.Repository

@Composable
fun VaccinationForm(repo: Repository, onSaved: () -> Unit, onCancel: () -> Unit) {
    var animalId by remember { mutableStateOf("") }
    var vaccineName by remember { mutableStateOf("") }
    var dueDate by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(value = animalId, onValueChange = { animalId = it }, label = { Text("Animal ID") })
        OutlinedTextField(value = vaccineName, onValueChange = { vaccineName = it }, label = { Text("Vaccine") })
        OutlinedTextField(value = dueDate, onValueChange = { dueDate = it }, label = { Text("Due date (epoch ms)") })
        Spacer(modifier = Modifier.height(12.dp))
        Row {
            Button(onClick = {
                val aid = animalId.toLongOrNull() ?: 0L
                val dd = dueDate.toLongOrNull() ?: System.currentTimeMillis()
                val entity = VaccinationEntity(animalId = aid, vaccineName = vaccineName, dueDate = dd)
                LaunchedEffect(Unit) {
                    repo.addVaccination(entity)
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
