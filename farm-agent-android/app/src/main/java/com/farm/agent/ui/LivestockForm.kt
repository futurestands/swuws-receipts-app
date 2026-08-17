package com.farm.agent.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material.Button
import androidx.compose.material.OutlinedTextField
import androidx.compose.material.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.farm.agent.db.LivestockEntity
import com.farm.agent.repo.Repository

@Composable
fun LivestockForm(repo: Repository, onSaved: () -> Unit, onCancel: () -> Unit) {
    var tag by remember { mutableStateOf("") }
    var species by remember { mutableStateOf("") }
    var breed by remember { mutableStateOf("") }
    var dob by remember { mutableStateOf("") }
    var sex by remember { mutableStateOf("") }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        OutlinedTextField(value = tag, onValueChange = { tag = it }, label = { Text("Tag") })
        OutlinedTextField(value = species, onValueChange = { species = it }, label = { Text("Species") })
        OutlinedTextField(value = breed, onValueChange = { breed = it }, label = { Text("Breed") })
        OutlinedTextField(value = dob, onValueChange = { dob = it }, label = { Text("DOB (epoch ms)") })
        OutlinedTextField(value = sex, onValueChange = { sex = it }, label = { Text("Sex") })
        Spacer(modifier = Modifier.height(12.dp))
        Row {
            Button(onClick = {
                val dobLong = dob.toLongOrNull()
                val entity = LivestockEntity(tag = tag, species = species, breed = breed.ifEmpty { null }, dob = dobLong, sex = sex.ifEmpty { null })
                LaunchedEffect(Unit) {
                    repo.addLivestock(entity)
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
