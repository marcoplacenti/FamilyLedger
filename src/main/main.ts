import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { databaseService, Account, Transaction, Category } from './database';

let mainWindow: BrowserWindow;

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    height: 800,
    width: 1200,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the app - always try webpack dev server first in development
  const isDev = !app.isPackaged || process.env.NODE_ENV === 'development';
  
  if (isDev) {
    console.log('Loading from webpack dev server...');
    mainWindow.loadURL('http://localhost:3001').catch(() => {
      console.log('Webpack dev server not available, loading local file...');
      mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
    });
    mainWindow.webContents.openDevTools();
  } else {
    console.log('Loading from local file...');
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  }
};

// App event listeners
app.whenReady().then(async () => {
  // Initialize database
  try {
    await databaseService.initialize();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await databaseService.close();
});

// IPC handlers for database operations
ipcMain.handle('db:getAccounts', async (): Promise<Account[]> => {
  try {
    return await databaseService.getAccounts();
  } catch (error) {
    console.error('Error getting accounts:', error);
    throw error;
  }
});

ipcMain.handle('db:createAccount', async (_, account: Omit<Account, 'id' | 'created_at' | 'updated_at'>): Promise<number> => {
  try {
    return await databaseService.createAccount(account);
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
});

ipcMain.handle('db:getCategories', async (): Promise<Category[]> => {
  try {
    return await databaseService.getCategories();
  } catch (error) {
    console.error('Error getting categories:', error);
    throw error;
  }
});

ipcMain.handle('db:createCategory', async (_, category: Omit<Category, 'id' | 'created_at'>): Promise<number> => {
  try {
    return await databaseService.createCategory(category);
  } catch (error) {
    console.error('Error creating category:', error);
    throw error;
  }
});

ipcMain.handle('db:getTransactions', async (_, limit: number = 100, offset: number = 0): Promise<any[]> => {
  try {
    return await databaseService.getTransactionsWithDetails(limit, offset);
  } catch (error) {
    console.error('Error getting transactions:', error);
    throw error;
  }
});

ipcMain.handle('db:createTransaction', async (_, transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<number> => {
  try {
    return await databaseService.createTransaction(transaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
});