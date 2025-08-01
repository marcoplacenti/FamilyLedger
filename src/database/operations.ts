// Database operations for Family Ledger
// Handles all SQLite database interactions using Tauri v1 invoke API

import { invoke } from '@tauri-apps/api/tauri';
import { join, homeDir } from '@tauri-apps/api/path';
import { exists, createDir } from '@tauri-apps/api/fs';
import { 
  DatabaseTransaction, 
  Category, 
  Account, 
  QueryOptions, 
  DatabaseResult 
} from '../types';

// Database connection singleton
let db: Database | null = null;
let dbPath: string | null = null;

/**
 * Get the database file path based on storage configuration
 */
export async function getDatabasePath(storagePath?: string): Promise<string> {
  if (storagePath) {
    // Use provided storage path (local or Google Drive synced folder)
    return await join(storagePath, 'transactions.db');
  } else {
    // Default fallback path
    const home = await homeDir();
    const defaultPath = await join(home, '.familyledger');
    return await join(defaultPath, 'transactions.db');
  }
}

/**
 * Initialize database connection and create schema
 */
export async function initializeDatabase(storagePath?: string): Promise<Database> {
  try {
    const newDbPath = await getDatabasePath(storagePath);
    
    // If already connected to the same database, return existing connection
    if (db && dbPath === newDbPath) {
      return db;
    }
    
    // Close existing connection if switching databases
    if (db) {
      await db.close();
    }
    
    // Ensure directory exists
    const dbDir = newDbPath.replace(/[^/\\]*$/, '');
    if (!(await exists(dbDir))) {
      await createDir(dbDir, { recursive: true });
    }
    
    console.log('Connecting to database at:', newDbPath);
    
    // Connect to SQLite database
    db = await Database.load(`sqlite:${newDbPath}`);
    dbPath = newDbPath;
    
    console.log('Database connected successfully');
    
    // Create schema
    await createSchema();
    
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

/**
 * Create database schema from schema.sql file
 */
async function createSchema(): Promise<void> {
  if (!db) throw new Error('Database not initialized');
  
  try {
    console.log('Creating database schema...');
    
    // Create transactions table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          month TEXT NOT NULL,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          category TEXT NOT NULL,
          account TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)`);
    
    // Create categories table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          available_from TEXT,
          available_until TEXT,
          initial_budget REAL DEFAULT 0,
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create accounts table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          type TEXT DEFAULT 'checking' CHECK (type IN ('checking', 'savings', 'credit', 'investment')),
          status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create schema version table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert initial schema version
    await db.execute(`INSERT OR IGNORE INTO schema_version (version) VALUES (1)`);
    
    console.log('Database schema created successfully');
  } catch (error) {
    console.error('Failed to create database schema:', error);
    throw error;
  }
}

/**
 * Get database connection (must be initialized first)
 */
export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    dbPath = null;
    console.log('Database connection closed');
  }
}

/**
 * Get current database path
 */
export function getCurrentDatabasePath(): string | null {
  return dbPath;
}

// ============================================================================
// TRANSACTION CRUD OPERATIONS
// ============================================================================

/**
 * Insert a new transaction
 */
export async function insertTransaction(transaction: Omit<DatabaseTransaction, 'id' | 'created_at' | 'updated_at'>): Promise<DatabaseResult<number>> {
  try {
    const db = getDatabase();
    
    const result = await db.execute(
      `INSERT INTO transactions (month, description, amount, category, account, type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        transaction.month,
        transaction.description,
        transaction.amount,
        transaction.category,
        transaction.account,
        transaction.type
      ]
    );
    
    return {
      success: true,
      data: result.lastInsertId,
      rowsAffected: result.rowsAffected
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
export async function insertTransactionsBatch(transactions: Omit<DatabaseTransaction, 'id' | 'created_at' | 'updated_at'>[]): Promise<DatabaseResult<number[]>> {
  try {
    const db = getDatabase();
    
    await db.execute('BEGIN TRANSACTION');
    
    const insertedIds: number[] = [];
    
    try {
      for (const transaction of transactions) {
        const result = await db.execute(
          `INSERT INTO transactions (month, description, amount, category, account, type)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            transaction.month,
            transaction.description,
            transaction.amount,
            transaction.category,
            transaction.account,
            transaction.type
          ]
        );
        
        if (result.lastInsertId) {
          insertedIds.push(result.lastInsertId);
        }
      }
      
      await db.execute('COMMIT');
      
      return {
        success: true,
        data: insertedIds,
        rowsAffected: insertedIds.length
      };
    } catch (error) {
      await db.execute('ROLLBACK');
      throw error;
    }
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
    const db = getDatabase();
    const { limit = 20, offset = 0 } = options;
    
    const transactions = await db.select<DatabaseTransaction[]>(
      `SELECT id, month, description, amount, category, account, type, created_at, updated_at
       FROM transactions
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    return {
      success: true,
      data: transactions
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
    const db = getDatabase();
    
    const transactions = await db.select<DatabaseTransaction[]>(
      `SELECT id, month, description, amount, category, account, type, created_at, updated_at
       FROM transactions
       WHERE month = ?
       ORDER BY created_at DESC`,
      [month]
    );
    
    return {
      success: true,
      data: transactions
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
    const db = getDatabase();
    
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    
    // Build dynamic update query
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    });
    
    if (updateFields.length === 0) {
      return { success: true };
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(id);
    
    const result = await db.execute(
      `UPDATE transactions SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    return {
      success: true,
      rowsAffected: result.rowsAffected
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
    const db = getDatabase();
    
    const result = await db.execute(
      'DELETE FROM transactions WHERE id = ?',
      [id]
    );
    
    return {
      success: true,
      rowsAffected: result.rowsAffected
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
    const db = getDatabase();
    
    const result = await db.select<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM transactions'
    );
    
    return {
      success: true,
      data: result[0].count
    };
  } catch (error) {
    console.error('Failed to get transaction count:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
}