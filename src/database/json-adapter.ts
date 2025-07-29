// JSON Database Adapter for Family Ledger
// Provides SQLite-like interface using JSON storage
// This allows us to maintain the same API while using JSON storage compatible with Tauri v1

import { join, homeDir } from '@tauri-apps/api/path';
import { exists, createDir, writeTextFile, readTextFile } from '@tauri-apps/api/fs';
import { 
  DatabaseTransaction, 
  Transaction,
  DatabaseResult,
  Category
} from '../types';

// In-memory storage that mimics database behavior
let transactions: DatabaseTransaction[] = [];
let categories: Category[] = [];
let nextTransactionId = 1;
let nextCategoryId = 1;
let isInitialized = false;
let currentStoragePath: string | null = null;

/**
 * Get the database file paths based on storage configuration
 */
export async function getDatabasePath(storagePath?: string): Promise<string> {
  if (storagePath) {
    // Use provided storage path (local or Google Drive synced folder)
    return await join(storagePath, 'transactions.json');
  } else {
    // Default fallback path
    const home = await homeDir();
    const defaultPath = await join(home, '.familyledger');
    return await join(defaultPath, 'transactions.json');
  }
}

export async function getCategoriesPath(storagePath?: string): Promise<string> {
  if (storagePath) {
    // Use provided storage path (local or Google Drive synced folder)
    return await join(storagePath, 'categories.json');
  } else {
    // Default fallback path
    const home = await homeDir();
    const defaultPath = await join(home, '.familyledger');
    return await join(defaultPath, 'categories.json');
  }
}

/**
 * Initialize database (load from JSON file)
 */
export async function initializeDatabase(storagePath?: string): Promise<void> {
  try {
    const filePath = await getDatabasePath(storagePath);
    currentStoragePath = filePath;
    
    // Ensure directory exists
    const dbDir = filePath.replace(/[^/\\]*$/, '');
    if (!(await exists(dbDir))) {
      await createDir(dbDir, { recursive: true });
    }
    
    console.log('Loading transactions from:', filePath);
    
    // Load existing data if file exists
    if (await exists(filePath)) {
      const fileContent = await readTextFile(filePath);
      const jsonTransactions: Transaction[] = JSON.parse(fileContent || '[]');
      
      // Convert legacy format to database format and assign IDs
      transactions = jsonTransactions.map((tx, index) => ({
        id: index + 1,
        month: tx.month,
        description: tx.description,
        amount: tx.amount,
        category: tx.category,
        account: tx.account,
        type: tx.transaction_type === 'income' ? 'income' : 'expense',
        created_at: tx.date || new Date().toISOString(),
        updated_at: tx.date || new Date().toISOString()
      }));
      
      nextTransactionId = transactions.length + 1;
      console.log(`Loaded ${transactions.length} transactions from JSON file`);
    } else {
      transactions = [];
      nextTransactionId = 1;
      console.log('No existing transactions file found, starting fresh');
    }
    
    // Load categories
    const categoriesFilePath = await getCategoriesPath(storagePath);
    if (await exists(categoriesFilePath)) {
      const categoriesContent = await readTextFile(categoriesFilePath);
      categories = JSON.parse(categoriesContent || '[]');
      nextCategoryId = categories.length + 1;
      console.log(`Loaded ${categories.length} categories from JSON file`);
    } else {
      categories = getDefaultCategories();
      nextCategoryId = categories.length + 1;
      console.log('No existing categories file found, using defaults');
    }
    
    isInitialized = true;
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Get default categories (empty - users create their own)
 */
function getDefaultCategories(): Category[] {
  return [];
}

/**
 * Save categories to JSON file
 */
async function saveCategoriesToFile(): Promise<void> {
  if (!currentStoragePath) {
    throw new Error('Database not initialized');
  }
  
  try {
    const categoriesFilePath = await getCategoriesPath(currentStoragePath.replace('transactions.json', ''));
    const jsonContent = JSON.stringify(categories, null, 2);
    await writeTextFile(categoriesFilePath, jsonContent);
    console.log(`Saved ${categories.length} categories to JSON file`);
  } catch (error) {
    console.error('Failed to save categories to file:', error);
    throw error;
  }
}

/**
 * Save transactions to JSON file
 */
async function saveToFile(): Promise<void> {
  if (!currentStoragePath) {
    throw new Error('Database not initialized');
  }
  
  try {
    // Convert back to legacy format for compatibility
    const legacyTransactions: Transaction[] = transactions.map(tx => ({
      id: tx.id?.toString() || '',
      description: tx.description,
      amount: tx.amount,
      transaction_type: tx.type,
      category: tx.category,
      account: tx.account,
      month: tx.month,
      date: tx.created_at || new Date().toISOString()
    }));
    
    const jsonContent = JSON.stringify(legacyTransactions, null, 2);
    await writeTextFile(currentStoragePath, jsonContent);
    console.log(`Saved ${transactions.length} transactions to JSON file`);
  } catch (error) {
    console.error('Failed to save to file:', error);
    throw error;
  }
}

/**
 * Insert a new transaction
 */
export async function insertTransaction(transaction: Omit<DatabaseTransaction, 'id' | 'created_at' | 'updated_at'>): Promise<DatabaseResult<number>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const now = new Date().toISOString();
    const newTransaction: DatabaseTransaction = {
      id: nextTransactionId++,
      ...transaction,
      created_at: now,
      updated_at: now
    };
    
    transactions.push(newTransaction);
    await saveToFile();
    
    return {
      success: true,
      data: newTransaction.id!,
      rowsAffected: 1
    };
  } catch (error) {
    console.error('Failed to insert transaction:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Insert multiple transactions in a batch
 */
export async function insertTransactionsBatch(txs: Omit<DatabaseTransaction, 'id' | 'created_at' | 'updated_at'>[]): Promise<DatabaseResult<number[]>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const now = new Date().toISOString();
    const insertedIds: number[] = [];
    
    for (const tx of txs) {
      const newTransaction: DatabaseTransaction = {
        id: nextTransactionId++,
        ...tx,
        created_at: now,
        updated_at: now
      };
      
      transactions.push(newTransaction);
      insertedIds.push(newTransaction.id!);
    }
    
    await saveToFile();
    
    return {
      success: true,
      data: insertedIds,
      rowsAffected: insertedIds.length
    };
  } catch (error) {
    console.error('Failed to insert transactions batch:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Get recent transactions with optional pagination
 */
export async function getRecentTransactions(options: { limit?: number; offset?: number } = {}): Promise<DatabaseResult<DatabaseTransaction[]>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const { limit = 20, offset = 0 } = options;
    
    // Sort by created_at descending and apply pagination
    const sorted = [...transactions].sort((a, b) => 
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
    
    const paginated = sorted.slice(offset, offset + limit);
    
    return {
      success: true,
      data: paginated
    };
  } catch (error) {
    console.error('Failed to get recent transactions:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Get transactions by month
 */
export async function getTransactionsByMonth(month: string): Promise<DatabaseResult<DatabaseTransaction[]>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const filtered = transactions
      .filter(tx => tx.month === month)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    
    return {
      success: true,
      data: filtered
    };
  } catch (error) {
    console.error('Failed to get transactions by month:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Update a transaction
 */
export async function updateTransaction(id: number, updates: Partial<Omit<DatabaseTransaction, 'id' | 'created_at'>>): Promise<DatabaseResult<void>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const index = transactions.findIndex(tx => tx.id === id);
    if (index === -1) {
      return {
        success: false,
        error: 'Transaction not found'
      };
    }
    
    transactions[index] = {
      ...transactions[index],
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    await saveToFile();
    
    return {
      success: true,
      rowsAffected: 1
    };
  } catch (error) {
    console.error('Failed to update transaction:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Delete a transaction
 */
export async function deleteTransaction(id: number): Promise<DatabaseResult<void>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const index = transactions.findIndex(tx => tx.id === id);
    if (index === -1) {
      return {
        success: false,
        error: 'Transaction not found'
      };
    }
    
    transactions.splice(index, 1);
    await saveToFile();
    
    return {
      success: true,
      rowsAffected: 1
    };
  } catch (error) {
    console.error('Failed to delete transaction:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Get transaction count
 */
export async function getTransactionCount(): Promise<DatabaseResult<number>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    return {
      success: true,
      data: transactions.length
    };
  } catch (error) {
    console.error('Failed to get transaction count:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Close database connection (cleanup)
 */
export async function closeDatabase(): Promise<void> {
  transactions = [];
  categories = [];
  nextTransactionId = 1;
  nextCategoryId = 1;
  isInitialized = false;
  currentStoragePath = null;
  console.log('Database connection closed');
}

/**
 * Get current database path
 */
export function getCurrentDatabasePath(): string | null {
  return currentStoragePath;
}

// ============================================================================
// CATEGORY OPERATIONS
// ============================================================================

/**
 * Get all categories
 */
export async function getAllCategories(): Promise<DatabaseResult<Category[]>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    return {
      success: true,
      data: [...categories]
    };
  } catch (error) {
    console.error('Failed to get categories:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Insert a new category
 */
export async function insertCategory(category: Omit<Category, 'id' | 'created_at' | 'updated_at'>): Promise<DatabaseResult<number>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const now = new Date().toISOString();
    const newCategory: Category = {
      id: nextCategoryId++,
      ...category,
      status: category.status || 'active',
      created_at: now,
      updated_at: now
    };
    
    categories.push(newCategory);
    await saveCategoriesToFile();
    
    return {
      success: true,
      data: newCategory.id!,
      rowsAffected: 1
    };
  } catch (error) {
    console.error('Failed to insert category:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Update a category
 */
export async function updateCategory(id: number, updates: Partial<Omit<Category, 'id' | 'created_at'>>): Promise<DatabaseResult<void>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const index = categories.findIndex(cat => cat.id === id);
    if (index === -1) {
      return {
        success: false,
        error: 'Category not found'
      };
    }
    
    categories[index] = {
      ...categories[index],
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    await saveCategoriesToFile();
    
    return {
      success: true,
      rowsAffected: 1
    };
  } catch (error) {
    console.error('Failed to update category:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Delete a category
 */
export async function deleteCategory(id: number): Promise<DatabaseResult<void>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const index = categories.findIndex(cat => cat.id === id);
    if (index === -1) {
      return {
        success: false,
        error: 'Category not found'
      };
    }
    
    categories.splice(index, 1);
    await saveCategoriesToFile();
    
    return {
      success: true,
      rowsAffected: 1
    };
  } catch (error) {
    console.error('Failed to delete category:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}

/**
 * Get active categories for dropdown/selection
 */
export async function getActiveCategories(): Promise<DatabaseResult<Category[]>> {
  try {
    if (!isInitialized) {
      throw new Error('Database not initialized');
    }
    
    const activeCategories = categories.filter(cat => cat.status === 'active');
    
    return {
      success: true,
      data: activeCategories
    };
  } catch (error) {
    console.error('Failed to get active categories:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}