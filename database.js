const duckdb = require('duckdb');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.connection = null;
        this.dbPath = this.getDefaultDbPath();
    }

    getDefaultDbPath() {
        // Default to user's home directory for easy sharing
        const os = require('os');
        const homeDir = os.homedir();
        
        // Check for common cloud storage folders
        const cloudPaths = [
            path.join(homeDir, 'Dropbox', 'FamilyLedger'),
            path.join(homeDir, 'Google Drive', 'FamilyLedger'),
            path.join(homeDir, 'OneDrive', 'FamilyLedger'),
            path.join(homeDir, 'Documents', 'FamilyLedger')
        ];

        for (const cloudPath of cloudPaths) {
            if (fs.existsSync(path.dirname(cloudPath))) {
                if (!fs.existsSync(cloudPath)) {
                    fs.mkdirSync(cloudPath, { recursive: true });
                }
                return path.join(cloudPath, 'family_ledger.duckdb');
            }
        }

        // Fallback to current directory
        return path.join(__dirname, 'family_ledger.duckdb');
    }

    setDatabasePath(newPath) {
        this.dbPath = newPath;
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    connect() {
        return new Promise((resolve, reject) => {
            console.log('Connecting to database at:', this.dbPath);
            this.db = new duckdb.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Failed to create database:', err);
                    reject(err);
                } else {
                    console.log('Database created/opened successfully');
                    this.connection = this.db.connect();
                    console.log('Database connection established');
                    this.initializeTables().then(() => {
                        console.log('Tables initialized successfully');
                        resolve();
                    }).catch((err) => {
                        console.error('Failed to initialize tables:', err);
                        reject(err);
                    });
                }
            });
        });
    }

    initializeTables() {
        return new Promise((resolve, reject) => {
            const createTransactionsTable = `
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY,
                    date DATE NOT NULL,
                    description VARCHAR NOT NULL,
                    category VARCHAR NOT NULL,
                    amount DECIMAL(10,2) NOT NULL,
                    type VARCHAR NOT NULL CHECK(type IN ('income', 'expense')),
                    account VARCHAR NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;

            const createAccountsTable = `
                CREATE TABLE IF NOT EXISTS accounts (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR NOT NULL UNIQUE,
                    type VARCHAR NOT NULL,
                    balance DECIMAL(10,2) DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `;

            const createCategoriesTable = `
                CREATE TABLE IF NOT EXISTS categories (
                    id INTEGER PRIMARY KEY,
                    name VARCHAR NOT NULL UNIQUE,
                    type VARCHAR NOT NULL CHECK(type IN ('income', 'expense')),
                    color VARCHAR DEFAULT '#3498db'
                )
            `;

            // Create tables sequentially
            console.log('Creating transactions table...');
            this.connection.run(createTransactionsTable, (err) => {
                if (err) {
                    console.error('Failed to create transactions table:', err);
                    return reject(err);
                }
                console.log('Transactions table created successfully');
                
                console.log('Creating accounts table...');
                this.connection.run(createAccountsTable, (err) => {
                    if (err) {
                        console.error('Failed to create accounts table:', err);
                        return reject(err);
                    }
                    console.log('Accounts table created successfully');
                    
                    console.log('Creating categories table...');
                    this.connection.run(createCategoriesTable, (err) => {
                        if (err) {
                            console.error('Failed to create categories table:', err);
                            return reject(err);
                        }
                        console.log('Categories table created successfully');
                        
                        // Insert default data
                        console.log('Inserting default data...');
                        this.insertDefaultCategories()
                            .then(() => this.insertDefaultAccounts())
                            .then(() => {
                                console.log('Default data inserted successfully');
                                resolve();
                            })
                            .catch(reject);
                    });
                });
            });
        });
    }

    insertDefaultCategories() {
        return new Promise((resolve, reject) => {
            const defaultCategories = [
                { name: 'Food & Dining', type: 'expense', color: '#e74c3c' },
                { name: 'Transportation', type: 'expense', color: '#f39c12' },
                { name: 'Shopping', type: 'expense', color: '#9b59b6' },
                { name: 'Entertainment', type: 'expense', color: '#e67e22' },
                { name: 'Bills & Utilities', type: 'expense', color: '#34495e' },
                { name: 'Healthcare', type: 'expense', color: '#1abc9c' },
                { name: 'Salary', type: 'income', color: '#27ae60' },
                { name: 'Freelance', type: 'income', color: '#2ecc71' },
                { name: 'Investments', type: 'income', color: '#16a085' },
                { name: 'Other Income', type: 'income', color: '#27ae60' }
            ];

            let completed = 0;
            const total = defaultCategories.length;

            if (total === 0) {
                resolve();
                return;
            }

            defaultCategories.forEach(cat => {
                this.connection.run(
                    'INSERT OR IGNORE INTO categories (name, type, color) VALUES (?, ?, ?)',
                    [cat.name, cat.type, cat.color],
                    (err) => {
                        if (err && !err.message.includes('UNIQUE constraint')) {
                            reject(err);
                            return;
                        }
                        completed++;
                        if (completed === total) {
                            resolve();
                        }
                    }
                );
            });
        });
    }

    insertDefaultAccounts() {
        return new Promise((resolve, reject) => {
            const defaultAccounts = [
                { name: 'Checking Account', type: 'checking' },
                { name: 'Savings Account', type: 'savings' },
                { name: 'Credit Card', type: 'credit' }
            ];

            let completed = 0;
            const total = defaultAccounts.length;

            if (total === 0) {
                resolve();
                return;
            }

            defaultAccounts.forEach(acc => {
                this.connection.run(
                    'INSERT OR IGNORE INTO accounts (name, type) VALUES (?, ?)',
                    [acc.name, acc.type],
                    (err) => {
                        if (err && !err.message.includes('UNIQUE constraint')) {
                            reject(err);
                            return;
                        }
                        completed++;
                        if (completed === total) {
                            resolve();
                        }
                    }
                );
            });
        });
    }

    // Transaction methods
    addTransaction(transaction) {
        return new Promise((resolve, reject) => {
            // First get the next ID
            this.connection.all('SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM transactions', (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                const nextId = rows[0].next_id;
                
                this.connection.run(`
                    INSERT INTO transactions (id, date, description, category, amount, type, account)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    nextId,
                    transaction.date,
                    transaction.description,
                    transaction.category,
                    transaction.amount,
                    transaction.type,
                    transaction.account
                ], (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ id: nextId, ...transaction });
                    }
                });
            });
        });
    }

    getTransactions(limit = 100) {
        return new Promise((resolve, reject) => {
            this.connection.all(`
                SELECT t.*, c.color as category_color 
                FROM transactions t 
                LEFT JOIN categories c ON t.category = c.name 
                ORDER BY t.date DESC, t.created_at DESC 
                LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    getCategories() {
        return new Promise((resolve, reject) => {
            this.connection.all('SELECT * FROM categories ORDER BY type, name', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    getAccounts() {
        return new Promise((resolve, reject) => {
            this.connection.all('SELECT * FROM accounts ORDER BY name', (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    deleteTransaction(id) {
        return new Promise((resolve, reject) => {
            this.connection.run('DELETE FROM transactions WHERE id = ?', [id], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }

    close() {
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

module.exports = DatabaseManager;