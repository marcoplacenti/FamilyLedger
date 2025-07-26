import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export interface Account {
  id?: number;
  name: string;
  type: 'checking' | 'savings' | 'credit_card' | 'investment' | 'mortgage' | 'loan';
  institution?: string;
  account_number?: string;
  initial_balance: number;
  current_balance: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Category {
  id?: number;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  parent_id?: number;
  color: string;
  created_at?: string;
}

export interface Transaction {
  id?: number;
  account_id: number;
  category_id?: number;
  amount: number;
  description: string;
  transaction_date: string; // YYYY-MM-DD format
  type: 'income' | 'expense' | 'transfer';
  transfer_account_id?: number;
  notes?: string;
  is_reconciled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MonthlyBalance {
  id?: number;
  account_id: number;
  year: number;
  month: number;
  balance: number;
  created_at?: string;
}

class DatabaseService {
  private db: sqlite3.Database | null = null;
  private dbPath: string;

  constructor() {
    // Store database in user's home directory
    const userDataPath = process.env.APPDATA || 
      (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.local/share');
    const appDataPath = path.join(userDataPath, 'family-finance-tracker');
    
    if (!fs.existsSync(appDataPath)) {
      fs.mkdirSync(appDataPath, { recursive: true });
    }
    
    this.dbPath = path.join(appDataPath, 'finance.db');
  }

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Enable foreign keys
        this.db!.run('PRAGMA foreign_keys = ON');
        
        // Initialize schema if needed
        this.initializeSchema()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  private async initializeSchema(): Promise<void> {
    const schemaSQL = `
      -- Account types: checking, savings, credit_card, investment, mortgage, loan
      CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card', 'investment', 'mortgage', 'loan')),
          institution TEXT,
          account_number TEXT,
          initial_balance DECIMAL(12, 2) DEFAULT 0.00,
          current_balance DECIMAL(12, 2) DEFAULT 0.00,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
          parent_id INTEGER,
          color TEXT DEFAULT '#6B7280',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (parent_id) REFERENCES categories(id)
      );

      CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          category_id INTEGER,
          amount DECIMAL(12, 2) NOT NULL,
          description TEXT NOT NULL,
          transaction_date DATE NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
          transfer_account_id INTEGER,
          notes TEXT,
          is_reconciled BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (account_id) REFERENCES accounts(id),
          FOREIGN KEY (category_id) REFERENCES categories(id),
          FOREIGN KEY (transfer_account_id) REFERENCES accounts(id)
      );

      CREATE TABLE IF NOT EXISTS monthly_balances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          balance DECIMAL(12, 2) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (account_id) REFERENCES accounts(id),
          UNIQUE(account_id, year, month)
      );
    `;

    return new Promise((resolve, reject) => {
      this.db!.exec(schemaSQL, (err) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Insert default categories if they don't exist
        this.insertDefaultCategories()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  private async insertDefaultCategories(): Promise<void> {
    const defaultCategories = [
      { name: 'Salary', type: 'income' as const, color: '#10b981' },
      { name: 'Investment Income', type: 'income' as const, color: '#059669' },
      { name: 'Other Income', type: 'income' as const, color: '#34d399' },
      { name: 'Groceries', type: 'expense' as const, color: '#ef4444' },
      { name: 'Utilities', type: 'expense' as const, color: '#f97316' },
      { name: 'Transportation', type: 'expense' as const, color: '#eab308' },
      { name: 'Entertainment', type: 'expense' as const, color: '#a855f7' },
      { name: 'Healthcare', type: 'expense' as const, color: '#ec4899' },
      { name: 'Housing', type: 'expense' as const, color: '#8b5cf6' },
      { name: 'Insurance', type: 'expense' as const, color: '#06b6d4' },
      { name: 'Taxes', type: 'expense' as const, color: '#dc2626' },
      { name: 'Investment', type: 'expense' as const, color: '#16a34a' },
      { name: 'Transfer', type: 'transfer' as const, color: '#6b7280' }
    ];

    for (const category of defaultCategories) {
      await this.createCategory(category);
    }
  }

  // Account CRUD operations
  async createAccount(account: Omit<Account, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO accounts (name, type, institution, account_number, initial_balance, current_balance, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db!.run(sql, [
        account.name,
        account.type,
        account.institution,
        account.account_number,
        account.initial_balance,
        account.current_balance,
        account.is_active ? 1 : 0
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      });
    });
  }

  async getAccounts(): Promise<Account[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM accounts WHERE is_active = 1 ORDER BY name';
      
      this.db!.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map(row => ({
          ...row,
          is_active: row.is_active === 1
        })));
      });
    });
  }

  // Category CRUD operations  
  async createCategory(category: Omit<Category, 'id' | 'created_at'>): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR IGNORE INTO categories (name, type, parent_id, color)
        VALUES (?, ?, ?, ?)
      `;
      
      this.db!.run(sql, [
        category.name,
        category.type,
        category.parent_id,
        category.color
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      });
    });
  }

  async getCategories(): Promise<Category[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM categories ORDER BY type, name';
      
      this.db!.all(sql, [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows as Category[]);
      });
    });
  }

  // Transaction CRUD operations
  async createTransaction(transaction: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO transactions (account_id, category_id, amount, description, transaction_date, type, transfer_account_id, notes, is_reconciled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db!.run(sql, [
        transaction.account_id,
        transaction.category_id,
        transaction.amount,
        transaction.description,
        transaction.transaction_date,
        transaction.type,
        transaction.transfer_account_id,
        transaction.notes,
        transaction.is_reconciled ? 1 : 0
      ], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.lastID);
      });
    });
  }

  async getTransactions(limit: number = 100, offset: number = 0): Promise<Transaction[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT t.*
        FROM transactions t
        ORDER BY t.transaction_date DESC, t.created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      this.db!.all(sql, [limit, offset], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map((row: any) => ({
          ...row,
          is_reconciled: row.is_reconciled === 1
        })) as Transaction[]);
      });
    });
  }

  // Get transactions with account and category names for display
  async getTransactionsWithDetails(limit: number = 100, offset: number = 0): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT t.*, a.name as account_name, c.name as category_name
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        LEFT JOIN categories c ON t.category_id = c.id
        ORDER BY t.transaction_date DESC, t.created_at DESC
        LIMIT ? OFFSET ?
      `;
      
      this.db!.all(sql, [limit, offset], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map((row: any) => ({
          ...row,
          is_reconciled: row.is_reconciled === 1
        })));
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            reject(err);
            return;
          }
          this.db = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export const databaseService = new DatabaseService();