const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const DatabaseManager = require('./database')

let dbManager = new DatabaseManager()

async function createWindow () {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })

  // Initialize database BEFORE loading the HTML file
  try {
    await dbManager.connect()
    console.log('Database connected and initialized successfully')
    mainWindow.loadFile('index.html')
  } catch (err) {
    console.error('Database connection failed:', err)
    // Still load the window but show error
    mainWindow.loadFile('index.html')
  }
}

// IPC handlers for database operations
ipcMain.handle('add-transaction', async (event, transaction) => {
  try {
    return await dbManager.addTransaction(transaction)
  } catch (error) {
    throw error
  }
})

ipcMain.handle('get-transactions', async (event, limit) => {
  try {
    return await dbManager.getTransactions(limit)
  } catch (error) {
    throw error
  }
})

ipcMain.handle('get-categories', async () => {
  try {
    return await dbManager.getCategories()
  } catch (error) {
    throw error
  }
})

ipcMain.handle('get-accounts', async () => {
  try {
    return await dbManager.getAccounts()
  } catch (error) {
    throw error
  }
})

ipcMain.handle('delete-transaction', async (event, id) => {
  try {
    return await dbManager.deleteTransaction(id)
  } catch (error) {
    throw error
  }
})

ipcMain.handle('choose-database-path', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'DuckDB Files', extensions: ['duckdb', 'db'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    
    if (!result.canceled && result.filePaths.length > 0) {
      dbManager.setDatabasePath(result.filePaths[0])
      await dbManager.connect()
      return result.filePaths[0]
    }
    return null
  } catch (error) {
    throw error
  }
})

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  dbManager.close()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})