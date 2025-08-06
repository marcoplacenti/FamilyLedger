// Type definitions for Family Ledger application
// Centralizes all interfaces and types used throughout the app

// ============================================================================
// TRANSACTION TYPES
// ============================================================================

/**
 * Legacy Transaction interface (used by JSON storage and existing code)
 * Maintains compatibility with current implementation
 */
export interface Transaction {
  id: string;                                          // Unique identifier (timestamp-based)
  description: string;                                 // Human-readable description
  amount: number;                                      // Transaction amount (always positive)
  transaction_type: 'income' | 'expense' | 'transfer'; // Type determines how amount affects balance
  category: string;                                    // Category for budgeting/reporting
  account: string;                                     // Account name (e.g., "Checking", "Savings")
  month: string;                                       // Format: "YYYY-MM" for easy grouping
  date: string;                                        // Full ISO date string
}

/**
 * Database Transaction interface (used by SQLite operations)
 * Optimized for database storage with proper types
 */
export interface DatabaseTransaction {
  id?: number;                                        // Auto-incremented primary key
  month: string;                                      // Format: "YYYY-MM"
  description: string;                                // Human-readable description
  amount: number;                                     // Transaction amount (always positive)
  category: string;                                   // Category for budgeting/reporting
  account: string;                                    // Account name
  type: 'income' | 'expense';                        // Simplified type (no transfer for now)
  created_at?: string;                               // ISO timestamp when created
  updated_at?: string;                               // ISO timestamp when last updated
}

// ============================================================================
// CATEGORY TYPES
// ============================================================================

/**
 * Category interface for budgeting and organization
 */
export interface Category {
  id?: number;
  name: string;
  group?: 'Housing' | 'Recreational' | 'Utilities' | 'Health' | 'Savings';
  available_from?: string;                            // Format: "YYYY-MM"
  available_until?: string;                           // Format: "YYYY-MM"
  initial_budget?: number;
  status?: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

/**
 * Legacy category interface (used by existing code)
 */
export interface LegacyCategory {
  name: string;
  availableFrom: string;
  initialBudget: number;
  status: 'active' | 'inactive';
}

// ============================================================================
// ACCOUNT TYPES
// ============================================================================

/**
 * Account interface for financial accounts
 */
export interface Account {
  id?: number;
  name: string;
  type?: 'checking' | 'savings' | 'credit' | 'investment';
  initial_balance?: number;
  color?: string;
  status?: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// BUDGET TYPES
// ============================================================================

/**
 * Budget interface for monthly budget tracking
 */
export interface Budget {
  id?: number;
  month: string;                                      // Format: "YYYY-MM"
  category: string;
  initial_amount: number;
  current_amount: number;
  transactions_total: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Category Balance interface for tracking category balances per month
 * New model: tracks both initial balance (start of month) and current balance (end of month)
 */
export interface CategoryBalance {
  id?: number;
  category_name: string;                              // Name of the category
  month: string;                                      // Format: "YYYY-MM"
  initial_balance: number;                            // Balance at start of month (from previous month's current_balance or category's initialBudget)
  current_balance: number;                            // Balance at end of month (initial_balance + distribution + transactions)
  created_at?: string;
  updated_at?: string;
}

/**
 * Category Distribution interface for tracking distribution allocations per month
 */
export interface CategoryDistribution {
  id?: number;
  category_name: string;                              // Name of the category
  month: string;                                      // Format: "YYYY-MM"
  allocation: number;                                 // Distribution allocation for this category in this month
  created_at?: string;
  updated_at?: string;
}

/**
 * Account Balance interface for tracking account balances per month
 */
export interface AccountBalance {
  id?: number;
  account_name: string;                               // Name of the account
  month: string;                                      // Format: "YYYY-MM"
  initial_balance: number;                            // Balance at start of month
  current_balance: number;                            // Balance at end of month (initial_balance + transactions)
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// UI/FORM TYPES
// ============================================================================

/**
 * Form data for new transaction entry
 */
export interface TransactionFormData {
  month: string;
  description: string;
  amount: string;                                     // String for form input handling
  category: string;
  account: string;
  type: 'income' | 'expense';
}

/**
 * Validation result for form data
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// ============================================================================
// STORAGE TYPES
// ============================================================================

/**
 * Storage configuration
 */
export type StorageType = 'local' | 'googledrive';

/**
 * Application configuration
 */
export interface AppConfig {
  dataStoragePath: string;
  storageType: StorageType;
  googleDriveFolderId?: string;
}

/**
 * Sync status for cloud storage
 */
export type SyncStatus = 'syncing' | 'synced' | 'error' | 'connected' | 'connecting';

// ============================================================================
// DATABASE OPERATION TYPES
// ============================================================================

/**
 * Database query options
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  where?: Record<string, any>;
}

/**
 * Database operation result
 */
export interface DatabaseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  rowsAffected?: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Partial update type for entities
 */
export type PartialUpdate<T> = Partial<Omit<T, 'id' | 'created_at'>> & { updated_at?: string };

/**
 * API response wrapper
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}