# Family Ledger

A simple desktop application for managing family finances, built with Tauri and TypeScript.

## Features

- **Dashboard**: View total balance, monthly income, and expenses at a glance
- **Transaction Management**: Add income and expense transactions
- **Data Persistence**: Transactions are automatically saved locally
- **Clean UI**: Modern, responsive interface with dark mode support

## Tech Stack

- **Frontend**: TypeScript, HTML, CSS, Vite
- **Backend**: Rust (Tauri)
- **Data Storage**: JSON file (local)

## Development

### Prerequisites

- Node.js (v16+)
- Rust (latest stable)
- Tauri CLI

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run tauri dev
   ```

3. Build for production:
   ```bash
   npm run tauri build
   ```

## Usage

1. **Dashboard**: Overview of your financial status
2. **Transactions**: Add new income or expense entries
3. **Categories**: (Coming soon) Organize transactions by category
4. **Reports**: (Coming soon) Generate financial reports

## Data Storage

Transactions are stored locally in a JSON file within your app's data directory. The location varies by operating system:

- **Windows**: `%APPDATA%\com.familyledger.app\transactions.json`
- **macOS**: `~/Library/Application Support/com.familyledger.app/transactions.json`
- **Linux**: `~/.local/share/com.familyledger.app/transactions.json`