// Database migration utilities for Family Ledger
// Handles data migration from JSON to SQLite and schema upgrades

import { getDatabase, initializeDatabase } from './operations';
import { DatabaseTransaction } from '../types';
import { Transaction } from '../types'; // Import existing Transaction type

/**
 * Migrate existing JSON transactions to SQLite database
 */
export async function migrateJsonToDatabase(
  jsonTransactions: Transaction[],
  storagePath?: string
): Promise<void> {
  try {
    console.log('Starting migration from JSON to SQLite...');
    console.log(`Migrating ${jsonTransactions.length} transactions`);
    
    // Initialize database
    await initializeDatabase(storagePath);
    const db = getDatabase();
    
    // Check if we already have data in the database
    const existingCount = await db.select<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM transactions'
    );
    
    if (existingCount[0].count > 0) {
      console.log(`Database already contains ${existingCount[0].count} transactions`);
      console.log('Skipping migration to avoid duplicates');
      return;
    }
    
    if (jsonTransactions.length === 0) {
      console.log('No JSON transactions to migrate');
      return;
    }
    
    // Start transaction for bulk insert
    await db.execute('BEGIN TRANSACTION');
    
    try {
      // Convert and insert each transaction
      for (const jsonTransaction of jsonTransactions) {
        const dbTransaction: DatabaseTransaction = {
          month: jsonTransaction.month,
          description: jsonTransaction.description,
          amount: jsonTransaction.amount,
          category: jsonTransaction.category,
          account: jsonTransaction.account,
          type: jsonTransaction.transaction_type === 'income' ? 'income' : 'expense'
        };
        
        await db.execute(
          `INSERT INTO transactions (month, description, amount, category, account, type)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            dbTransaction.month,
            dbTransaction.description,
            dbTransaction.amount,
            dbTransaction.category,
            dbTransaction.account,
            dbTransaction.type
          ]
        );
      }
      
      // Commit transaction
      await db.execute('COMMIT');
      
      console.log(`Successfully migrated ${jsonTransactions.length} transactions to database`);
    } catch (error) {
      // Rollback on error
      await db.execute('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Failed to migrate JSON transactions to database:', error);
    throw error;
  }
}

/**
 * Export database transactions back to JSON format
 * Useful for backup or compatibility with existing sync system
 */
export async function exportDatabaseToJson(): Promise<Transaction[]> {
  try {
    const db = getDatabase();
    
    const dbTransactions = await db.select<DatabaseTransaction[]>(
      `SELECT id, month, description, amount, category, account, type, created_at, updated_at
       FROM transactions
       ORDER BY created_at DESC`
    );
    
    // Convert database format back to JSON format
    const jsonTransactions: Transaction[] = dbTransactions.map((dbTx: any) => ({
      id: dbTx.id?.toString() || '',
      month: dbTx.month,
      description: dbTx.description,
      amount: dbTx.amount,
      category: dbTx.category,
      account: dbTx.account,
      transaction_type: dbTx.type,
      date: dbTx.created_at || new Date().toISOString()
    }));
    
    console.log(`Exported ${jsonTransactions.length} transactions from database`);
    return jsonTransactions;
  } catch (error) {
    console.error('Failed to export database to JSON:', error);
    throw error;
  }
}

/**
 * Check if migration is needed (database is empty but JSON file exists)
 */
export async function isMigrationNeeded(
  jsonTransactions: Transaction[],
  storagePath?: string
): Promise<boolean> {
  try {
    await initializeDatabase(storagePath);
    const db = getDatabase();
    
    const result = await db.select<{ count: number }[]>(
      'SELECT COUNT(*) as count FROM transactions'
    );
    
    const dbHasData = result[0].count > 0;
    const jsonHasData = jsonTransactions.length > 0;
    
    // Migration needed if JSON has data but database is empty
    return jsonHasData && !dbHasData;
  } catch (error) {
    console.error('Failed to check migration status:', error);
    return false;
  }
}

/**
 * Backup database to JSON before major operations
 */
export async function backupDatabaseToJson(): Promise<Transaction[]> {
  try {
    console.log('Creating database backup...');
    const backup = await exportDatabaseToJson();
    console.log(`Backup created with ${backup.length} transactions`);
    return backup;
  } catch (error) {
    console.error('Failed to create database backup:', error);
    throw error;
  }
}