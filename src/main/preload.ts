import { contextBridge, ipcRenderer } from 'electron';
import { Account, Transaction, Category } from './database';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Account operations
  getAccounts: (): Promise<Account[]> => ipcRenderer.invoke('db:getAccounts'),
  createAccount: (account: Omit<Account, 'id' | 'created_at' | 'updated_at'>): Promise<number> => 
    ipcRenderer.invoke('db:createAccount', account),

  // Category operations
  getCategories: (): Promise<Category[]> => ipcRenderer.invoke('db:getCategories'),
  createCategory: (category: Omit<Category, 'id' | 'created_at'>): Promise<number> => 
    ipcRenderer.invoke('db:createCategory', category),

  // Transaction operations
  getTransactions: (limit?: number, offset?: number): Promise<Transaction[]> => 
    ipcRenderer.invoke('db:getTransactions', limit, offset),
  createTransaction: (transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<number> => 
    ipcRenderer.invoke('db:createTransaction', transaction),
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getAccounts: () => Promise<Account[]>;
      createAccount: (account: Omit<Account, 'id' | 'created_at' | 'updated_at'>) => Promise<number>;
      getCategories: () => Promise<Category[]>;
      createCategory: (category: Omit<Category, 'id' | 'created_at'>) => Promise<number>;
      getTransactions: (limit?: number, offset?: number) => Promise<Transaction[]>;
      createTransaction: (transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) => Promise<number>;
    };
  }
}