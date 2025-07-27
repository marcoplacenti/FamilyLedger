#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Transaction {
    id: String,
    description: String,
    amount: f64,
    transaction_type: String,
    category: String,
    account: String,
    month: String,
    date: String,
}

fn get_data_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let app_data_dir = app_handle.path_resolver()
        .app_data_dir()
        .ok_or("Failed to get app data directory")?;
    
    fs::create_dir_all(&app_data_dir)?;
    Ok(app_data_dir.join("transactions.json"))
}

#[tauri::command]
async fn save_transactions(
    app_handle: tauri::AppHandle,
    transactions: Vec<Transaction>
) -> Result<(), String> {
    let file_path = get_data_file_path(&app_handle)
        .map_err(|e| format!("Failed to get data file path: {}", e))?;
    
    let json_data = serde_json::to_string_pretty(&transactions)
        .map_err(|e| format!("Failed to serialize transactions: {}", e))?;
    
    fs::write(file_path, json_data)
        .map_err(|e| format!("Failed to write transactions file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
async fn load_transactions(app_handle: tauri::AppHandle) -> Result<Vec<Transaction>, String> {
    let file_path = get_data_file_path(&app_handle)
        .map_err(|e| format!("Failed to get data file path: {}", e))?;
    
    if !file_path.exists() {
        return Ok(Vec::new());
    }
    
    let json_data = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read transactions file: {}", e))?;
    
    let transactions: Vec<Transaction> = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to parse transactions: {}", e))?;
    
    Ok(transactions)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_transactions, load_transactions])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}