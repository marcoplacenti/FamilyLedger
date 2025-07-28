// ============================================================================
// FAMILY LEDGER - PERSONAL FINANCE MANAGEMENT APPLICATION
// ============================================================================
// 
// A Tauri-based desktop application for managing personal finances with
// support for both local and Google Drive storage. Features include:
// - Transaction management (income, expenses, transfers)
// - Category-based budgeting system
// - Google Drive cloud sync with local caching
// - Monthly budget tracking and salary distribution
// - Responsive design for desktop and mobile
//
// Built with: TypeScript, Tauri, HTML/CSS, Google Drive API
// ============================================================================

// TAURI API IMPORTS
// These provide access to native desktop functionality through Tauri's secure API
import { invoke } from '@tauri-apps/api/tauri'              // For custom Rust commands (unused currently)
import { open } from '@tauri-apps/api/dialog'              // File/folder picker dialogs
import { homeDir, join } from '@tauri-apps/api/path'       // Cross-platform path operations
import { exists, createDir, writeTextFile, readTextFile } from '@tauri-apps/api/fs'  // File system operations

// STYLING
import './style.css'  // Main application styles

// ============================================================================
// DATA STRUCTURES & INTERFACES
// ============================================================================

/**
 * Core transaction data structure
 * Represents a single financial transaction with all necessary metadata
 */
interface Transaction {
  id: string                                          // Unique identifier (timestamp-based)
  description: string                                 // Human-readable description
  amount: number                                      // Transaction amount (always positive)
  transaction_type: 'income' | 'expense' | 'transfer' // Type determines how amount affects balance
  category: string                                    // Category for budgeting/reporting
  account: string                                     // Account name (e.g., "Checking", "Savings")
  month: string                                       // Format: "YYYY-MM" for easy grouping
  date: string                                        // Full ISO date string
}

// ============================================================================
// GLOBAL STATE VARIABLES
// ============================================================================

// Core application data
let transactions: Transaction[] = []                  // All transactions in memory

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generates a unique ID using timestamp and random number
 * Format: base36(timestamp) + base36(random) for URL-safe, sortable IDs
 * 
 * @returns {string} Unique identifier
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

/**
 * Formats numbers as USD currency
 * Uses browser's built-in Intl.NumberFormat for proper localization
 * 
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., "$1,234.56")
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)
}

// ============================================================================
// NAVIGATION & UI MANAGEMENT
// ============================================================================

/**
 * Shows a specific page and updates navigation state
 * Implements single-page application (SPA) navigation by toggling CSS classes
 * 
 * @param {string} pageId - The ID of the page to show (matches HTML element IDs)
 */
function showPage(pageId: string) {
  // Hide all pages by removing 'active' class
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active')
  })
  
  // Deactivate all navigation buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active')
  })
  
  // Show the requested page and activate corresponding nav button
  const page = document.getElementById(pageId)
  const navBtn = document.querySelector(`[data-page="${pageId}"]`)
  
  if (page) page.classList.add('active')
  if (navBtn) navBtn.classList.add('active')
}

// ============================================================================
// DASHBOARD CALCULATIONS & DISPLAY
// ============================================================================

/**
 * Calculates and updates dashboard summary cards
 * Processes all transactions to show:
 * - Total balance (income - expenses, excluding transfers)
 * - Total monthly income
 * - Total monthly expenses
 */
function updateDashboard() {
  // Calculate total balance by processing all transactions
  // Transfers don't affect balance (they move money between accounts)
  const totalBalance = transactions.reduce((sum, t) => {
    if (t.transaction_type === 'transfer') return sum
    return sum + (t.transaction_type === 'income' ? t.amount : -t.amount)
  }, 0)
  
  // Calculate total income (all income transactions)
  const monthlyIncome = transactions
    .filter(t => t.transaction_type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
    
  // Calculate total expenses (all expense transactions)
  const monthlyExpenses = transactions
    .filter(t => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  // Find DOM elements for dashboard cards using CSS selectors
  const balanceEl = document.querySelector('.summary-cards .card:nth-child(1) .amount')
  const incomeEl = document.querySelector('.summary-cards .card:nth-child(2) .amount')
  const expensesEl = document.querySelector('.summary-cards .card:nth-child(3) .amount')

  // Update the display with formatted currency values
  if (balanceEl) balanceEl.textContent = formatCurrency(totalBalance)
  if (incomeEl) incomeEl.textContent = formatCurrency(monthlyIncome)
  if (expensesEl) expensesEl.textContent = formatCurrency(monthlyExpenses)
}

// ============================================================================
// TRANSACTION DISPLAY & RENDERING
// ============================================================================

/**
 * Renders the most recent transactions in the transactions table
 * Shows last 20 transactions in reverse chronological order (newest first)
 * Each row includes all transaction details plus an edit button
 */
function renderRecentTransactions() {
  const tableBodyEl = document.getElementById('transactions-table-body')
  if (!tableBodyEl) return

  // Get last 20 transactions and reverse to show newest first
  const recentTransactions = transactions.slice(-20).reverse()
  
  // Generate HTML for each transaction row
  // CSS classes for transaction_type enable different styling per type
  tableBodyEl.innerHTML = recentTransactions.map(t => `
    <div class="transaction-row ${t.transaction_type}" data-transaction-id="${t.id}">
      <div class="month">${t.month}</div>
      <div class="description">${t.description}</div>
      <div class="amount">${formatCurrency(t.amount)}</div>
      <div class="category">${t.category}</div>
      <div class="account">${t.account}</div>
      <div class="type">${t.transaction_type}</div>
      <div class="date">${new Date(t.date).toLocaleDateString()}</div>
      <div class="actions">
        <button class="edit-btn" onclick="editTransaction('${t.id}')">Edit</button>
      </div>
    </div>
  `).join('')
}

// ============================================================================
// TRANSACTION FORM MANAGEMENT
// ============================================================================

// Counter for generating unique form row IDs
let formRowCounter = 0

/**
 * Creates HTML for a new transaction form row
 * Generates a form row with all necessary input fields pre-populated with defaults
 * 
 * @returns {string} HTML string for a complete form row
 */
function createFormRow(): string {
  // Set default month to current month in YYYY-MM format
  const currentMonth = new Date()
  const monthValue = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`
  
  // Get only enabled categories for the dropdown
  // This ensures users can only select categories that are currently active
  const enabledCategories = categories.filter(cat => cat.enabled)
  const categoryOptions = enabledCategories.length > 0 
    ? enabledCategories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('')
    : '<option value="" disabled>No categories available - Please create categories first</option>'
  
  return `
    <div class="form-row" data-row="${formRowCounter++}">
      <input type="month" class="month-input" value="${monthValue}" />
      <input type="text" class="description-input" placeholder="Description" />
      <input type="text" class="amount-input" placeholder="Amount" inputmode="decimal" />
      <select class="category-input">
        <option value="">Select Category</option>
        ${categoryOptions}
      </select>
      <select class="account-input">
        <option value="">Select Account</option>
        <option value="Checking Account">Checking Account</option>
        <option value="Savings Account">Savings Account</option>
        <option value="Credit Card">Credit Card</option>
        <option value="Cash">Cash</option>
        <option value="Investment Account">Investment Account</option>
      </select>
      <select class="type-input">
        <option value="expense">Expense</option>
        <option value="income">Income</option>
        <option value="transfer">Transfer</option>
      </select>
    </div>
  `
}

function addFormRow() {
  const formRowsEl = document.getElementById('transaction-form-rows')
  if (formRowsEl) {
    formRowsEl.insertAdjacentHTML('beforeend', createFormRow())
  }
}

function removeFormRow() {
  const formRowsEl = document.getElementById('transaction-form-rows')
  if (formRowsEl && formRowsEl.children.length > 0) {
    formRowsEl.removeChild(formRowsEl.lastElementChild!)
  }
}

async function submitAllTransactions() {
  const formRowsEl = document.getElementById('transaction-form-rows')
  if (!formRowsEl) return

  const formRows = Array.from(formRowsEl.children) as HTMLElement[]
  const newTransactions: Transaction[] = []

  for (const row of formRows) {
    const monthEl = row.querySelector('.month-input') as HTMLInputElement
    const descriptionEl = row.querySelector('.description-input') as HTMLInputElement
    const amountEl = row.querySelector('.amount-input') as HTMLInputElement
    const categoryEl = row.querySelector('.category-input') as HTMLSelectElement
    const accountEl = row.querySelector('.account-input') as HTMLSelectElement
    const typeEl = row.querySelector('.type-input') as HTMLSelectElement

    if (!monthEl || !descriptionEl || !amountEl || !categoryEl || !accountEl || !typeEl) continue

    const month = monthEl.value.trim()
    const description = descriptionEl.value.trim()
    const amount = parseFloat(amountEl.value)
    const category = categoryEl.value
    const account = accountEl.value
    const transaction_type = typeEl.value as 'income' | 'expense' | 'transfer'

    // Skip empty rows
    if (!description && !amount && !category && !account) continue

    // Validate required fields
    if (!description || isNaN(amount) || amount <= 0 || !category || !account || !month) {
      alert('Please fill in all fields with valid values for all rows')
      return
    }

    const transaction: Transaction = {
      id: generateId(),
      description,
      amount,
      transaction_type,
      category,
      account,
      month,
      date: new Date().toISOString()
    }

    newTransactions.push(transaction)
  }

  if (newTransactions.length === 0) {
    alert('Please add at least one transaction')
    return
  }

  // Immediately add transactions to the array for visual feedback
  transactions.push(...newTransactions)
  
  // Update the UI immediately to show the new transactions
  updateDashboard()
  renderRecentTransactions()
  populateMonthSelector()
  
  // Clear and reset the form immediately for better UX
  formRowsEl.innerHTML = ''
  addFormRow() // Add one empty row
  
  // Add visual highlight effect to new transactions
  setTimeout(() => {
    highlightNewTransactions(newTransactions.length)
  }, 100)
  
  try {
    await saveTransactionsToFile()
    
    // Show success message
    showSuccessMessage(`Successfully added ${newTransactions.length} transaction(s)`)
  } catch (error) {
    console.error('Failed to save transactions:', error)
    alert('Failed to save transactions. Please try again.')
    
    // Remove the transactions we just added on error and refresh UI
    transactions.splice(-newTransactions.length)
    updateDashboard()
    renderRecentTransactions()
  }
}

function highlightNewTransactions(count: number) {
  const tableBodyEl = document.getElementById('transactions-table-body')
  if (!tableBodyEl) return
  
  // Highlight the first 'count' rows (newest transactions)
  const rows = Array.from(tableBodyEl.children) as HTMLElement[]
  for (let i = 0; i < Math.min(count, rows.length); i++) {
    const row = rows[i]
    row.style.background = 'rgba(16, 185, 129, 0.1)'
    row.style.transform = 'scale(1.02)'
    row.style.transition = 'all 0.3s ease'
    
    // Remove highlight after 2 seconds
    setTimeout(() => {
      row.style.background = ''
      row.style.transform = ''
    }, 2000)
  }
}

function showSuccessMessage(message: string) {
  // Create a temporary success notification
  const notification = document.createElement('div')
  notification.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    background: linear-gradient(135deg, var(--success-500), var(--success-600));
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.3);
    font-weight: 600;
    z-index: 10000;
    transform: translateX(400px);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  `
  notification.textContent = message
  
  document.body.appendChild(notification)
  
  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)'
  }, 100)
  
  // Animate out and remove
  setTimeout(() => {
    notification.style.transform = 'translateX(400px)'
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification)
      }
    }, 300)
  }, 3000)
}


async function saveTransactionsToFile() {
  const content = JSON.stringify(transactions, null, 2)
  
  if (storageType === 'googledrive') {
    // Save to Google Drive and local cache
    try {
      await saveToGoogleDrive('transactions.json', content)
      
      // Also save to local cache if we have a path
      if (dataStoragePath) {
        const cacheFile = await join(dataStoragePath, 'transactions.json')
        await writeTextFile(cacheFile, content)
      }
    } catch (error) {
      // If Google Drive fails, try to save locally if possible
      if (dataStoragePath && isOnline === false) {
        const cacheFile = await join(dataStoragePath, 'transactions.json')
        await writeTextFile(cacheFile, content)
        updateSyncStatus('error', 'Saved locally - sync pending')
      } else {
        throw error
      }
    }
  } else {
    // Local storage
    if (!dataStoragePath) {
      throw new Error('No data storage path set')
    }

    try {
      const transactionsFile = await join(dataStoragePath, 'transactions.json')
      await writeTextFile(transactionsFile, content)
    } catch (error) {
      console.error('Failed to save transactions to file:', error)
      throw error
    }
  }
}

async function loadTransactions() {
  try {
    let loadedTransactions: Transaction[] = []
    
    if (storageType === 'googledrive') {
      // Try to load from Google Drive first
      try {
        const driveContent = await loadFromGoogleDrive('transactions.json')
        if (driveContent) {
          loadedTransactions = JSON.parse(driveContent)
        }
      } catch (error) {
        console.error('Failed to load from Google Drive, trying local cache:', error)
        
        // Fall back to local cache
        if (dataStoragePath) {
          const cacheFile = await join(dataStoragePath, 'transactions.json')
          if (await exists(cacheFile)) {
            const fileContent = await readTextFile(cacheFile)
            loadedTransactions = JSON.parse(fileContent)
            updateSyncStatus('error', 'Loaded from cache - sync pending')
          }
        }
      }
    } else {
      // Local storage
      if (!dataStoragePath) {
        console.log('No data storage path set, skipping transaction load')
        return
      }

      const transactionsFile = await join(dataStoragePath, 'transactions.json')
      
      if (await exists(transactionsFile)) {
        const fileContent = await readTextFile(transactionsFile)
        loadedTransactions = JSON.parse(fileContent)
      }
    }
    
    transactions.splice(0, transactions.length, ...loadedTransactions)
    updateDashboard()
    renderRecentTransactions()
    populateMonthSelector()
  } catch (error) {
    console.error('Failed to load transactions:', error)
  }
}

function setupEventListeners() {
  console.log('Setting up all event listeners...')
  
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement
      const pageId = target.dataset.page
      if (pageId) showPage(pageId)
    })
  })

  // Transaction form
  const addRowBtn = document.getElementById('add-row')
  if (addRowBtn) {
    addRowBtn.addEventListener('click', addFormRow)
  }

  const removeRowBtn = document.getElementById('remove-row')
  if (removeRowBtn) {
    removeRowBtn.addEventListener('click', removeFormRow)
  }

  const submitBtn = document.getElementById('submit-transactions')
  if (submitBtn) {
    submitBtn.addEventListener('click', submitAllTransactions)
  }

  // Budget functionality
  const budgetMonthSelectEl = document.getElementById('budget-month-select')
  if (budgetMonthSelectEl) {
    budgetMonthSelectEl.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement
      const selectedMonth = target.value
      if (selectedMonth) {
        renderBudgetOverview(selectedMonth)
      } else {
        const budgetOverviewEl = document.getElementById('budget-overview')
        if (budgetOverviewEl) budgetOverviewEl.style.display = 'none'
      }
    })
  }

  // Category management
  const editCategoriesBtn = document.getElementById('edit-categories-btn')
  if (editCategoriesBtn) {
    editCategoriesBtn.addEventListener('click', enterEditMode)
  }

  const addCategoryBtn = document.getElementById('add-category-btn')
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener('click', addNewCategory)
  }

  const saveCategoriesBtn = document.getElementById('save-categories-btn')
  if (saveCategoriesBtn) {
    saveCategoriesBtn.addEventListener('click', saveCategories)
  }

  const cancelCategoriesBtn = document.getElementById('cancel-categories-btn')
  if (cancelCategoriesBtn) {
    cancelCategoriesBtn.addEventListener('click', cancelCategoryEditing)
  }

  // Data location modal
  const browseLocationBtn = document.getElementById('browse-location-btn')
  if (browseLocationBtn) {
    browseLocationBtn.addEventListener('click', browseForLocation)
  }

  const useDefaultBtn = document.getElementById('use-default-btn')
  if (useDefaultBtn) {
    useDefaultBtn.addEventListener('click', useDefaultLocation)
  }

  const confirmLocationBtn = document.getElementById('confirm-location-btn')
  if (confirmLocationBtn) {
    console.log('Attaching event listener to confirm location button')
    confirmLocationBtn.addEventListener('click', async (e) => {
      console.log('Confirm button clicked - event triggered')
      e.preventDefault()
      e.stopPropagation()
      await confirmLocation()
    })
  } else {
    console.error('Confirm location button not found!')
  }

  // Storage type selection
  document.querySelectorAll('.storage-option').forEach(option => {
    option.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement
      const type = target.getAttribute('data-type') as 'local' | 'googledrive'
      if (type) {
        switchStorageType(type)
      }
    })
  })

  // Google Drive
  const authGoogleDriveBtn = document.getElementById('auth-googledrive-btn')
  if (authGoogleDriveBtn) {
    authGoogleDriveBtn.addEventListener('click', handleGoogleDriveAuth)
  }

  const selectGDriveFolderBtn = document.getElementById('select-gdrive-folder-btn')
  if (selectGDriveFolderBtn) {
    selectGDriveFolderBtn.addEventListener('click', handleGoogleDriveFolderSelection)
  }

  // Manual sync button
  const manualSyncBtn = document.getElementById('manual-sync-btn')
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
      if (storageType === 'googledrive') {
        await saveTransactionsToFile()
      }
    })
  }
}

// ============================================================================
// APPLICATION INITIALIZATION & STARTUP
// ============================================================================

/**
 * Main application entry point - executes when DOM is fully loaded
 * Handles first-launch setup, configuration loading, and app initialization
 */
window.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM Content Loaded - setting up app...')
  
  // STEP 1: Setup all event listeners before any UI interactions
  // This ensures all buttons and inputs are functional immediately
  setupEventListeners()
  
  // STEP 2: Determine if this is the first time the app is being launched
  // First launch = no configuration file exists yet
  console.log('Checking if this is first launch...')
  const isFirstLaunch = await checkFirstLaunch()
  console.log('Is first launch result:', isFirstLaunch)
  
  if (isFirstLaunch) {
    // FIRST LAUNCH: Show data location selection modal
    // User must choose between local storage or Google Drive
    console.log('Showing data location modal...')
    await showDataLocationModal()
  } else {
    // SUBSEQUENT LAUNCHES: Load existing configuration and start app
    console.log('Loading existing configuration...')
    dataStoragePath = await loadStoragePath()  // Load saved storage path
    await initializeApp()                      // Load data and start app
  }

  // STEP 3: Initialize core app components
  // These run regardless of first launch or not
  addFormRow()              // Initialize with one empty form row for new transactions
  renderCategoriesTable()   // Initialize categories table display

  // Online/offline detection
  window.addEventListener('online', () => {
    isOnline = true
    if (storageType === 'googledrive') {
      updateSyncStatus('connected', 'Back online')
    }
  })

  window.addEventListener('offline', () => {
    isOnline = false
    if (storageType === 'googledrive') {
      updateSyncStatus('error', 'Offline - changes cached locally')
    }
  })

  // Add numeric validation to amount inputs
  document.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement
    if (target.classList.contains('amount-input') || target.classList.contains('edit-amount') || target.classList.contains('category-budget-input')) {
      // Allow only numbers, decimal point, and comma
      const value = target.value
      const validValue = value.replace(/[^0-9.,]/g, '')
      
      // Replace comma with dot for consistency
      const normalizedValue = validValue.replace(',', '.')
      
      // Ensure only one decimal point and limit to 2 decimal places
      const parts = normalizedValue.split('.')
      if (parts.length > 2) {
        target.value = parts[0] + '.' + parts.slice(1).join('')
      } else if (parts.length === 2 && parts[1].length > 2) {
        // Limit decimal places to 2
        target.value = parts[0] + '.' + parts[1].substring(0, 2)
      } else {
        target.value = normalizedValue
      }
    }
  })

  // Prevent non-numeric keypress on amount inputs
  document.addEventListener('keypress', (e) => {
    const target = e.target as HTMLInputElement
    if (target.classList.contains('amount-input') || target.classList.contains('edit-amount') || target.classList.contains('category-budget-input')) {
      const char = String.fromCharCode(e.which)
      const currentValue = target.value
      const cursorPosition = target.selectionStart || 0
      
      // Allow backspace, delete, tab, escape, enter
      if ([8, 9, 27, 13, 46].includes(e.which)) {
        return
      }
      
      // Allow numbers, but check decimal place limit
      if (/[0-9]/.test(char)) {
        const decimalIndex = currentValue.indexOf('.')
        if (decimalIndex !== -1 && cursorPosition > decimalIndex) {
          // Cursor is after decimal point
          const decimalPart = currentValue.substring(decimalIndex + 1)
          if (decimalPart.length >= 2) {
            // Already have 2 decimal places, prevent more
            e.preventDefault()
            return
          }
        }
        return
      }
      
      // Allow decimal point or comma, but only one
      if ((char === '.' || char === ',') && !currentValue.includes('.') && !currentValue.includes(',')) {
        return
      }
      
      // Prevent all other characters
      e.preventDefault()
    }
  })
})

// ============================================================================
// GLOBAL STATE MANAGEMENT
// ============================================================================

// Transaction editing state
let editingTransactionId: string | null = null    // ID of currently edited transaction (null = not editing)
let editingCategories = false                     // Flag for category edit mode

/**
 * Category data structure for budget management
 * Categories can be enabled/disabled and have budget information
 */
interface Category {
  id: string              // Unique identifier
  name: string            // Display name (e.g., "Groceries", "Utilities")
  enabled: boolean        // Whether category is available for new transactions
  availableFrom: string   // Date when category becomes available (YYYY-MM format)
  initialBudget: number   // Starting budget amount for the category
}

// ============================================================================
// STORAGE & CONFIGURATION MANAGEMENT
// ============================================================================

// Core storage state variables
let categories: Category[] = []                    // All available categories
let dataStoragePath: string | null = null         // Path where data files are stored
let storageType: 'local' | 'googledrive' = 'local' // Storage backend type

// Google Drive integration state
let googleDriveAuth: any = null                    // OAuth token data for Google Drive API calls
let googleDriveFolderId: string | null = null     // ID of the Google Drive folder containing app data
let isOnline = navigator.onLine                    // Network connectivity status

// Application constants
const DATA_FOLDER_NAME = 'FamilyLedger'           // Name of folder created for app data
const CONFIG_FILE_NAME = 'config.json'            // Configuration file name

// Google API credentials (loaded from environment variables)
// These are set in the .env file and bundled at build time
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY       // Google Drive API key
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID   // OAuth 2.0 client ID

function generateCategoryId(): string {
  return 'cat_' + Date.now().toString(36) + Math.random().toString(36).substring(2)
}

// Data location management
async function checkFirstLaunch(): Promise<boolean> {
  try {
    const configPath = await getConfigPath()
    console.log('Checking config path:', configPath)
    const configExists = await exists(configPath)
    console.log('Config file exists:', configExists)
    const isFirstLaunch = !configExists
    console.log('Is first launch:', isFirstLaunch)
    return isFirstLaunch
  } catch (error) {
    console.error('Error checking first launch:', error)
    return true
  }
}

async function getConfigPath(): Promise<string> {
  const home = await homeDir()
  return await join(home, '.familyledger', CONFIG_FILE_NAME)
}

async function loadStoragePath(): Promise<string | null> {
  try {
    const configPath = await getConfigPath()
    console.log('Loading storage path from:', configPath)
    if (await exists(configPath)) {
      console.log('Config file exists, reading content...')
      const configContent = await readTextFile(configPath)
      console.log('Config content:', configContent)
      const config = JSON.parse(configContent)
      
      // Update global variables
      if (config.storageType) {
        storageType = config.storageType
        console.log('Storage type loaded:', storageType)
      }
      if (config.googleDriveFolderId) {
        googleDriveFolderId = config.googleDriveFolderId
        console.log('Google Drive folder ID loaded:', googleDriveFolderId)
      }
      
      const dataPath = config.dataStoragePath || null
      console.log('Data storage path loaded:', dataPath)
      return dataPath
    } else {
      console.log('Config file does not exist')
    }
  } catch (error) {
    console.error('Error loading storage path:', error)
  }
  return null
}

async function saveStoragePath(path: string): Promise<void> {
  try {
    const configPath = await getConfigPath()
    const configDir = await join(await homeDir(), '.familyledger')
    
    // Create config directory if it doesn't exist
    if (!(await exists(configDir))) {
      await createDir(configDir, { recursive: true })
    }
    
    const config = { dataStoragePath: path, storageType }
    await writeTextFile(configPath, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('Error saving storage path:', error)
    throw error
  }
}

async function showDataLocationModal(): Promise<void> {
  const modal = document.getElementById('data-location-modal')
  if (modal) {
    modal.style.display = 'flex'
  }
}

async function hideDataLocationModal(): Promise<void> {
  const modal = document.getElementById('data-location-modal')
  if (modal) {
    modal.style.display = 'none'
  }
}

async function browseForLocation(): Promise<void> {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select folder for Family Ledger data'
    }) as string | null

    if (selected) {
      const selectedPathInput = document.getElementById('selected-path') as HTMLInputElement
      const confirmBtn = document.getElementById('confirm-location-btn') as HTMLButtonElement
      
      if (selectedPathInput) {
        selectedPathInput.value = selected
      }
      if (confirmBtn) {
        confirmBtn.disabled = false
      }
    }
  } catch (error) {
    console.error('Error browsing for location:', error)
    alert('Failed to open folder browser. Please try again.')
  }
}

async function useDefaultLocation(): Promise<void> {
  try {
    const home = await homeDir()
    const defaultPath = await join(home, 'Documents')
    
    const selectedPathInput = document.getElementById('selected-path') as HTMLInputElement
    const confirmBtn = document.getElementById('confirm-location-btn') as HTMLButtonElement
    
    if (selectedPathInput) {
      selectedPathInput.value = defaultPath
    }
    if (confirmBtn) {
      confirmBtn.disabled = false
    }
  } catch (error) {
    console.error('Error setting default location:', error)
    alert('Failed to set default location. Please browse manually.')
  }
}

async function confirmLocation(): Promise<void> {
  console.log('Confirm location button clicked')
  
  const selectedPathInput = document.getElementById('selected-path') as HTMLInputElement
  console.log('Selected path input:', selectedPathInput?.value)
  
  if (!selectedPathInput || !selectedPathInput.value) {
    alert('Please select a location first.')
    return
  }

  const confirmBtn = document.getElementById('confirm-location-btn') as HTMLButtonElement
  const originalText = confirmBtn?.textContent || 'Continue'

  try {
    console.log('Starting location confirmation process...')
    
    // Update button state
    if (confirmBtn) {
      confirmBtn.textContent = 'Setting up...'
      confirmBtn.disabled = true
    }

    const selectedPath = selectedPathInput.value
    const fullDataPath = await join(selectedPath, DATA_FOLDER_NAME)
    console.log('Full data path:', fullDataPath)

    // Create the data folder if it doesn't exist
    if (!(await exists(fullDataPath))) {
      console.log('Creating data folder...')
      await createDir(fullDataPath, { recursive: true })
      console.log('Data folder created')
    } else {
      console.log('Data folder already exists')
    }

    // Save the storage path
    console.log('Saving storage path...')
    await saveStoragePath(fullDataPath)
    console.log('Storage path saved')
    
    dataStoragePath = fullDataPath

    // Hide modal and initialize app
    console.log('Hiding modal and initializing app...')
    await hideDataLocationModal()
    await initializeApp()
    
    showSuccessMessage('Data location set successfully!')
    console.log('Location confirmation completed successfully')
  } catch (error) {
    console.error('Error confirming location:', error)
    
    // Reset button
    if (confirmBtn) {
      confirmBtn.textContent = originalText
      confirmBtn.disabled = false
    }
    
    alert('Failed to create data folder. Please check permissions and try again.')
  }
}

async function initializeApp(): Promise<void> {
  // Load existing data if available
  await loadTransactions()
  
  // Show sync status if using Google Drive
  if (storageType === 'googledrive') {
    showMainSyncStatus()
  }
}

// ============================================================================
// GOOGLE DRIVE INTEGRATION
// ============================================================================
// 
// This section implements hybrid cloud storage using Google Drive API
// Architecture:
// - Local caching: All data is cached locally for fast access
// - Background sync: Changes are automatically synced to Google Drive
// - Offline support: App works offline, syncs when connection restored
// - OAuth 2.0: Uses modern Google Identity Services for authentication
//
// Key Features:
// - Automatic conflict resolution
// - Real-time sync status indicators
// - Manual sync triggering
// - Cross-device data sharing
// ============================================================================

/**
 * Initializes Google Drive API client and authentication services
 * Uses modern Google Identity Services instead of deprecated gapi.auth2
 * 
 * Process:
 * 1. Load Google Identity Services script
 * 2. Load Google API client script  
 * 3. Initialize GAPI client with Drive API access
 * 
 * @returns {Promise<void>} Resolves when initialization is complete
 */
async function initializeGoogleDrive(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Loading Google Identity Services...')
    
    // Set a timeout to prevent hanging on network issues
    const timeout = setTimeout(() => {
      reject(new Error('Google API initialization timed out'))
    }, 10000) // 10 second timeout
    
    // STEP 1: Load Google Identity Services (modern OAuth implementation)
    const identityScript = document.createElement('script')
    identityScript.src = 'https://accounts.google.com/gsi/client'
    identityScript.onload = () => {
      console.log('Google Identity Services loaded')
      
      // STEP 2: Load Google API client (for Drive API calls)
      const apiScript = document.createElement('script')
      apiScript.src = 'https://apis.google.com/js/api.js'
      apiScript.onload = () => {
        console.log('Google API script loaded')
        initializeGapiClient(resolve, reject, timeout)
      }
      apiScript.onerror = (error) => {
        console.error('Error loading Google API script:', error)
        clearTimeout(timeout)
        reject(new Error('Failed to load Google API script'))
      }
      document.head.appendChild(apiScript)
    }
    identityScript.onerror = (error) => {
      console.error('Error loading Google Identity Services:', error)
      clearTimeout(timeout)
      reject(new Error('Failed to load Google Identity Services'))
    }
    document.head.appendChild(identityScript)
  })
}

function initializeGapiClient(resolve: () => void, reject: (error: Error) => void, timeout?: NodeJS.Timeout) {
  try {
    console.log('Loading gapi modules...')
    gapi.load('client:picker', {
      callback: async () => {
        try {
          console.log('GAPI modules loaded, initializing client...')
          await gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest']
          })
          
          console.log('Google Drive API client initialized')
          if (timeout) clearTimeout(timeout)
          resolve()
        } catch (error) {
          console.error('Error initializing Google Drive API client:', error)
          if (timeout) clearTimeout(timeout)
          reject(error as Error)
        }
      },
      onerror: (error: any) => {
        console.error('Error loading GAPI modules:', error)
        if (timeout) clearTimeout(timeout)
        reject(new Error('Failed to load GAPI modules'))
      },
      timeout: 5000, // 5 second timeout for gapi.load
      ontimeout: () => {
        console.error('GAPI modules loading timed out')
        if (timeout) clearTimeout(timeout)
        reject(new Error('GAPI modules loading timed out'))
      }
    })
  } catch (error) {
    console.error('Error in initializeGapiClient:', error)
    if (timeout) clearTimeout(timeout)
    reject(error as Error)
  }
}

async function authenticateGoogleDrive(): Promise<boolean> {
  try {
    console.log('Authenticating Google Drive...')
    
    if (!googleDriveAuth) {
      console.log('Initializing Google Drive API...')
      await initializeGoogleDrive()
      console.log('Google Drive API initialized')
    }
    
    console.log('Starting OAuth flow with Google Identity Services...')
    
    return new Promise((resolve) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (tokenResponse: any) => {
          console.log('OAuth token received:', tokenResponse)
          if (tokenResponse && tokenResponse.access_token) {
            googleDriveAuth = {
              access_token: tokenResponse.access_token,
              expires_in: tokenResponse.expires_in
            }
            gapi.client.setToken(tokenResponse)
            console.log('User signed in successfully')
            resolve(true)
          } else {
            console.log('User sign in failed - no token received')
            resolve(false)
          }
        },
        error_callback: (error: any) => {
          console.error('OAuth error:', error)
          resolve(false)
        }
      })
      
      console.log('Requesting access token...')
      client.requestAccessToken()
    })
  } catch (error) {
    console.error('Google Drive authentication failed:', error)
    return false
  }
}

async function selectGoogleDriveFolder(): Promise<string | null> {
  try {
    if (!googleDriveAuth) {
      const authenticated = await authenticateGoogleDrive()
      if (!authenticated) return null
    }

    return new Promise((resolve) => {
      const picker = new google.picker.PickerBuilder()
        .addView(new google.picker.DocsView(google.picker.ViewId.FOLDERS)
          .setSelectFolderEnabled(true))
        .setOAuthToken(googleDriveAuth.access_token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            const folder = data.docs[0]
            resolve(folder.id)
          } else {
            resolve(null)
          }
        })
        .build()
      
      picker.setVisible(true)
    })
  } catch (error) {
    console.error('Failed to select Google Drive folder:', error)
    return null
  }
}

async function createGoogleDriveFolder(name: string, parentId?: string): Promise<string | null> {
  try {
    const response = await gapi.client.drive.files.create({
      resource: {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : undefined
      }
    })
    
    return response.result.id
  } catch (error) {
    console.error('Failed to create Google Drive folder:', error)
    return null
  }
}

async function saveToGoogleDrive(fileName: string, content: string): Promise<boolean> {
  try {
    if (!googleDriveFolderId) {
      throw new Error('No Google Drive folder selected')
    }

    updateSyncStatus('syncing', 'Saving to Google Drive...')

    // Check if file exists
    const existingFile = await findGoogleDriveFile(fileName)
    
    const fileMetadata = {
      name: fileName,
      parents: [googleDriveFolderId]
    }

    const media = {
      mimeType: 'application/json',
      body: content
    }

    let response
    if (existingFile) {
      // Update existing file
      response = await gapi.client.request({
        path: `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}`,
        method: 'PATCH',
        params: { uploadType: 'media' },
        headers: { 'Content-Type': 'application/json' },
        body: content
      })
    } else {
      // Create new file
      response = await gapi.client.request({
        path: 'https://www.googleapis.com/upload/drive/v3/files',
        method: 'POST',
        params: { uploadType: 'media' },
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fileMetadata,
          content: btoa(content)
        })
      })
    }

    updateSyncStatus('synced', 'Synced with Google Drive')
    return response.status === 200
  } catch (error) {
    console.error('Failed to save to Google Drive:', error)
    updateSyncStatus('error', 'Sync failed')
    return false
  }
}

async function loadFromGoogleDrive(fileName: string): Promise<string | null> {
  try {
    if (!googleDriveFolderId) {
      throw new Error('No Google Drive folder selected')
    }

    updateSyncStatus('syncing', 'Loading from Google Drive...')

    const file = await findGoogleDriveFile(fileName)
    if (!file) {
      updateSyncStatus('synced', 'No data found')
      return null
    }

    const response = await gapi.client.drive.files.get({
      fileId: file.id,
      alt: 'media'
    })

    updateSyncStatus('synced', 'Loaded from Google Drive')
    return response.body
  } catch (error) {
    console.error('Failed to load from Google Drive:', error)
    updateSyncStatus('error', 'Sync failed')
    return null
  }
}

async function findGoogleDriveFile(fileName: string): Promise<any> {
  try {
    const response = await gapi.client.drive.files.list({
      q: `name='${fileName}' and parents in '${googleDriveFolderId}' and trashed=false`,
      spaces: 'drive'
    })

    return response.result.files && response.result.files.length > 0 
      ? response.result.files[0] 
      : null
  } catch (error) {
    console.error('Failed to find Google Drive file:', error)
    return null
  }
}

// UI Helper Functions
function updateSyncStatus(status: 'syncing' | 'synced' | 'error' | 'connected', message: string) {
  const syncIcon = document.querySelector('.sync-icon')
  const syncText = document.querySelector('.sync-text')
  const mainSyncIcon = document.querySelector('#main-sync-status .sync-icon')
  const mainSyncText = document.querySelector('#main-sync-status .sync-text')
  
  const icons = {
    syncing: '🔄',
    synced: '☁️',
    error: '❌',
    connected: '✅'
  }
  
  if (syncIcon) syncIcon.textContent = icons[status]
  if (syncText) syncText.textContent = message
  if (mainSyncIcon) mainSyncIcon.textContent = icons[status]
  if (mainSyncText) mainSyncText.textContent = message
}

function showMainSyncStatus() {
  const mainSyncStatus = document.getElementById('main-sync-status')
  if (mainSyncStatus) {
    mainSyncStatus.style.display = 'flex'
  }
}

function hideMainSyncStatus() {
  const mainSyncStatus = document.getElementById('main-sync-status')
  if (mainSyncStatus) {
    mainSyncStatus.style.display = 'none'
  }
}

function switchStorageType(type: 'local' | 'googledrive') {
  storageType = type
  
  // Update UI
  document.querySelectorAll('.storage-option').forEach(option => {
    option.classList.toggle('active', option.getAttribute('data-type') === type)
  })
  
  const localActions = document.getElementById('local-actions')
  const googleDriveActions = document.getElementById('googledrive-actions')
  const pathLabel = document.getElementById('selected-path-label')
  const pathInput = document.getElementById('selected-path') as HTMLInputElement
  const infoText = document.getElementById('location-info-text')
  const syncStatus = document.getElementById('sync-status')
  
  if (type === 'local') {
    if (localActions) localActions.style.display = 'flex'
    if (googleDriveActions) googleDriveActions.style.display = 'none'
    if (pathLabel) pathLabel.textContent = 'Selected Location:'
    if (pathInput) {
      pathInput.placeholder = 'No location selected...'
      pathInput.value = ''
    }
    if (infoText) {
      infoText.innerHTML = '<strong>Note:</strong> This will create a folder called "FamilyLedger" in your selected location to store your data files.'
    }
    if (syncStatus) syncStatus.style.display = 'none'
  } else {
    if (localActions) localActions.style.display = 'none'
    if (googleDriveActions) googleDriveActions.style.display = 'flex'
    if (pathLabel) pathLabel.textContent = 'Selected Folder:'
    if (pathInput) {
      pathInput.placeholder = 'No Google Drive folder selected...'
      pathInput.value = ''
    }
    if (infoText) {
      infoText.innerHTML = '<strong>Note:</strong> Data will be stored in Google Drive and can be shared with others. A "FamilyLedger" folder will be created in your selected location.'
    }
    if (syncStatus) syncStatus.style.display = 'block'
  }
  
  // Reset continue button
  const confirmBtn = document.getElementById('confirm-location-btn') as HTMLButtonElement
  if (confirmBtn) {
    confirmBtn.disabled = true
  }
}

async function handleGoogleDriveAuth() {
  console.log('Google Drive auth button clicked')
  console.log('API Key:', GOOGLE_API_KEY ? 'Present' : 'Missing')
  console.log('Client ID:', GOOGLE_CLIENT_ID ? 'Present' : 'Missing')
  
  const authBtn = document.getElementById('auth-googledrive-btn') as HTMLButtonElement
  const originalText = authBtn?.textContent || 'Connect to Google Drive'
  
  try {
    // Check if API keys are configured
    if (!GOOGLE_API_KEY || !GOOGLE_CLIENT_ID || GOOGLE_API_KEY === 'YOUR_GOOGLE_API_KEY') {
      console.error('API keys not configured:', { GOOGLE_API_KEY, GOOGLE_CLIENT_ID })
      alert('Google Drive API credentials are not configured. Please set up your environment variables in .env file.')
      console.error('Google Drive API credentials not configured. Please check your .env file for VITE_GOOGLE_API_KEY and VITE_GOOGLE_CLIENT_ID')
      return
    }

    console.log('Starting Google Drive authentication...')
    
    // Update button to show progress
    if (authBtn) {
      authBtn.textContent = 'Connecting...'
      authBtn.disabled = true
    }
    
    updateSyncStatus('connecting', 'Connecting to Google Drive...')
    
    const authenticated = await authenticateGoogleDrive()
    console.log('Authentication result:', authenticated)
    
    if (authenticated) {
      const selectBtn = document.getElementById('select-gdrive-folder-btn')
      
      if (authBtn) authBtn.style.display = 'none'
      if (selectBtn) selectBtn.style.display = 'inline-block'
      
      updateSyncStatus('connected', 'Connected to Google Drive')
      console.log('Google Drive authentication successful')
    } else {
      updateSyncStatus('error', 'Authentication failed')
      console.log('Google Drive authentication failed')
      
      // Reset button
      if (authBtn) {
        authBtn.textContent = originalText
        authBtn.disabled = false
      }
    }
  } catch (error) {
    console.error('Authentication error:', error)
    updateSyncStatus('error', 'Connection failed')
    
    // Reset button
    if (authBtn) {
      authBtn.textContent = originalText
      authBtn.disabled = false
    }
    
    alert('Failed to connect to Google Drive. Error: ' + (error as Error).message)
  }
}

async function handleGoogleDriveFolderSelection() {
  try {
    const folderId = await selectGoogleDriveFolder()
    if (folderId) {
      // Create FamilyLedger subfolder
      const familyLedgerFolderId = await createGoogleDriveFolder(DATA_FOLDER_NAME, folderId)
      
      if (familyLedgerFolderId) {
        googleDriveFolderId = familyLedgerFolderId
        
        const pathInput = document.getElementById('selected-path') as HTMLInputElement
        const confirmBtn = document.getElementById('confirm-location-btn') as HTMLButtonElement
        
        if (pathInput) {
          pathInput.value = `Google Drive/${DATA_FOLDER_NAME}`
        }
        if (confirmBtn) {
          confirmBtn.disabled = false
        }
        
        updateSyncStatus('connected', 'Google Drive folder selected')
      } else {
        alert('Failed to create FamilyLedger folder in Google Drive.')
      }
    }
  } catch (error) {
    console.error('Folder selection error:', error)
    alert('Failed to select Google Drive folder. Please try again.')
  }
}

function renderCategoriesTable() {
  const categoriesTableBodyEl = document.getElementById('categories-table-body')
  if (!categoriesTableBodyEl) return

  if (categories.length === 0) {
    categoriesTableBodyEl.innerHTML = '<div class="empty-state">No categories created yet. Click "Edit Categories" to get started.</div>'
    return
  }

  categoriesTableBodyEl.innerHTML = categories.map(category => `
    <div class="category-row" data-category-id="${category.id}">
      <div class="category-name">
        <input type="text" class="category-name-input" value="${category.name}" ${!editingCategories ? 'disabled' : ''} />
      </div>
      <div class="category-available-from">
        <input type="month" class="category-available-from-input" value="${category.availableFrom}" ${!editingCategories ? 'disabled' : ''} />
      </div>
      <div class="category-initial-budget">
        <input type="text" class="category-budget-input" value="${category.initialBudget}" placeholder="0.00" inputmode="decimal" ${!editingCategories ? 'disabled' : ''} />
      </div>
      <div class="category-status">
        <label class="toggle-switch">
          <input type="checkbox" class="category-toggle" ${category.enabled ? 'checked' : ''} ${!editingCategories ? 'disabled' : ''} />
          <span class="toggle-slider"></span>
        </label>
        <span class="status-text">${category.enabled ? 'Enabled' : 'Disabled'}</span>
      </div>
      <div class="category-actions">
        ${editingCategories ? `<button class="delete-category-btn" onclick="deleteCategory('${category.id}')">Delete</button>` : ''}
      </div>
    </div>
  `).join('')
}

function enterEditMode() {
  editingCategories = true
  
  // Show/hide buttons
  document.getElementById('edit-categories-btn')!.style.display = 'none'
  document.getElementById('add-category-btn')!.style.display = 'inline-block'
  document.getElementById('save-categories-btn')!.style.display = 'inline-block'
  document.getElementById('cancel-categories-btn')!.style.display = 'inline-block'
  
  renderCategoriesTable()
}

function exitEditMode() {
  editingCategories = false
  
  // Show/hide buttons
  document.getElementById('edit-categories-btn')!.style.display = 'inline-block'
  document.getElementById('add-category-btn')!.style.display = 'none'
  document.getElementById('save-categories-btn')!.style.display = 'none'
  document.getElementById('cancel-categories-btn')!.style.display = 'none'
  
  renderCategoriesTable()
}

function addNewCategory() {
  const currentMonth = new Date()
  const monthValue = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`
  
  const newCategory: Category = {
    id: generateCategoryId(),
    name: 'New Category',
    enabled: true,
    availableFrom: monthValue,
    initialBudget: 0
  }
  
  categories.push(newCategory)
  renderCategoriesTable()
  
  // Focus on the new category name input
  setTimeout(() => {
    const newRow = document.querySelector(`[data-category-id="${newCategory.id}"]`)
    const input = newRow?.querySelector('.category-name-input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  }, 100)
}

function deleteCategory(categoryId: string) {
  categories = categories.filter(cat => cat.id !== categoryId)
  renderCategoriesTable()
}

function saveCategories() {
  // Update categories from form inputs
  const categoryRows = document.querySelectorAll('.category-row')
  
  categoryRows.forEach(row => {
    const categoryId = row.getAttribute('data-category-id')
    const nameInput = row.querySelector('.category-name-input') as HTMLInputElement
    const availableFromInput = row.querySelector('.category-available-from-input') as HTMLInputElement
    const budgetInput = row.querySelector('.category-budget-input') as HTMLInputElement
    const toggleInput = row.querySelector('.category-toggle') as HTMLInputElement
    
    if (categoryId && nameInput && availableFromInput && budgetInput && toggleInput) {
      const category = categories.find(cat => cat.id === categoryId)
      if (category) {
        category.name = nameInput.value.trim()
        category.availableFrom = availableFromInput.value
        category.initialBudget = parseFloat(budgetInput.value) || 0
        category.enabled = toggleInput.checked
      }
    }
  })
  
  // Remove categories with empty names
  categories = categories.filter(cat => cat.name.trim() !== '')
  
  exitEditMode()
  showSuccessMessage('Categories saved successfully')
  
  // Update transaction forms with new categories
  updateTransactionFormCategories()
}

function cancelCategoryEditing() {
  // Reload categories to discard changes (for now, just exit edit mode)
  exitEditMode()
}

function updateTransactionFormCategories() {
  const enabledCategories = categories.filter(cat => cat.enabled)
  
  // Update new transaction form
  const categorySelects = document.querySelectorAll('.category-input')
  categorySelects.forEach(select => {
    const selectEl = select as HTMLSelectElement
    const currentValue = selectEl.value
    
    const categoryOptions = enabledCategories.length > 0 
      ? enabledCategories.map(cat => 
          `<option value="${cat.name}" ${cat.name === currentValue ? 'selected' : ''}>${cat.name}</option>`
        ).join('')
      : '<option value="" disabled>No categories available - Please create categories first</option>'
    
    selectEl.innerHTML = '<option value="">Select Category</option>' + categoryOptions
  })
  
  // Update edit transaction category selects
  const editCategorySelects = document.querySelectorAll('.edit-category')
  editCategorySelects.forEach(select => {
    const selectEl = select as HTMLSelectElement
    const currentValue = selectEl.value
    
    if (enabledCategories.length > 0) {
      selectEl.innerHTML = enabledCategories.map(cat => 
        `<option value="${cat.name}" ${cat.name === currentValue ? 'selected' : ''}>${cat.name}</option>`
      ).join('')
    } else {
      selectEl.innerHTML = `<option value="${currentValue}" selected>${currentValue} (Category disabled)</option>`
    }
  })
}

// Budget data structure
interface BudgetCategory {
  name: string
  initialBudget: number
  distribution: number
}

const budgetCategories: BudgetCategory[] = [
  { name: 'Food & Dining', initialBudget: 800, distribution: 50 },
  { name: 'Transportation', initialBudget: 400, distribution: 25 },
  { name: 'Utilities', initialBudget: 300, distribution: 20 },
  { name: 'Entertainment', initialBudget: 200, distribution: 15 },
  { name: 'Healthcare', initialBudget: 250, distribution: 10 },
  { name: 'Other', initialBudget: 150, distribution: 30 }
]

function populateMonthSelector() {
  const monthSelectEl = document.getElementById('budget-month-select') as HTMLSelectElement
  if (!monthSelectEl) return

  // Get unique months from transactions
  const uniqueMonths = [...new Set(transactions.map(t => t.month))].sort()
  
  // Clear existing options except the first one
  monthSelectEl.innerHTML = '<option value="">Select a month...</option>'
  
  uniqueMonths.forEach(month => {
    const option = document.createElement('option')
    option.value = month
    option.textContent = new Date(month + '-01').toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    })
    monthSelectEl.appendChild(option)
  })
}

function calculateTransactionSaldo(category: string, month: string): number {
  return transactions
    .filter(t => t.category === category && t.month === month && t.transaction_type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
}

function calculateMonthlySalary(month: string): number {
  return transactions
    .filter(t => t.month === month && t.transaction_type === 'income' && t.category === 'Salary')
    .reduce((sum, t) => sum + t.amount, 0)
}

function generateRandomDistribution(totalAmount: number): { [key: string]: number } {
  const distributions: { [key: string]: number } = {}
  let remainingAmount = totalAmount
  const categoryNames = budgetCategories.map(cat => cat.name)
  
  // Generate random weights for each category
  const weights = categoryNames.map(() => Math.random())
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  
  // Distribute the amount based on weights
  for (let i = 0; i < categoryNames.length; i++) {
    const categoryName = categoryNames[i]
    if (i === categoryNames.length - 1) {
      // Last category gets the remaining amount to ensure exact total
      distributions[categoryName] = Math.round(remainingAmount * 100) / 100
    } else {
      const amount = Math.round((totalAmount * weights[i] / totalWeight) * 100) / 100
      distributions[categoryName] = amount
      remainingAmount -= amount
    }
  }
  
  return distributions
}

function getMonthlyDistributions(month: string): { [key: string]: number } {
  const monthlySalary = calculateMonthlySalary(month)
  
  if (monthlySalary === 0) {
    // No salary for this month, use default distributions
    const defaultDistributions: { [key: string]: number } = {}
    budgetCategories.forEach(cat => {
      defaultDistributions[cat.name] = cat.distribution
    })
    return defaultDistributions
  }
  
  // Check if current total distribution matches salary
  const currentTotal = budgetCategories.reduce((sum, cat) => sum + cat.distribution, 0)
  
  if (Math.abs(currentTotal - monthlySalary) < 0.01) {
    // Totals match (within rounding tolerance), use existing distributions
    const existingDistributions: { [key: string]: number } = {}
    budgetCategories.forEach(cat => {
      existingDistributions[cat.name] = cat.distribution
    })
    return existingDistributions
  }
  
  // Totals don't match, generate new random distribution
  return generateRandomDistribution(monthlySalary)
}

function renderBudgetOverview(selectedMonth: string) {
  const budgetOverviewEl = document.getElementById('budget-overview')
  const budgetTableBodyEl = document.getElementById('budget-table-body')
  
  if (!budgetOverviewEl || !budgetTableBodyEl) return

  budgetOverviewEl.style.display = 'block'
  
  // Clear any existing summary
  const existingSummary = budgetOverviewEl.querySelector('.budget-summary')
  if (existingSummary) {
    existingSummary.remove()
  }
  
  // Get dynamic distributions based on salary for this month
  const monthlyDistributions = getMonthlyDistributions(selectedMonth)
  
  budgetTableBodyEl.innerHTML = budgetCategories.map(category => {
    const transactionSaldo = calculateTransactionSaldo(category.name, selectedMonth)
    const distribution = monthlyDistributions[category.name] || 0
    const currentBalance = category.initialBudget + distribution - transactionSaldo
    
    return `
      <div class="budget-row">
        <div class="category">${category.name}</div>
        <div class="initial-budget">${formatCurrency(category.initialBudget)}</div>
        <div class="distribution">${formatCurrency(distribution)}</div>
        <div class="transactions">${formatCurrency(transactionSaldo)}</div>
        <div class="current-balance ${currentBalance < 0 ? 'negative' : 'positive'}">${formatCurrency(currentBalance)}</div>
      </div>
    `
  }).join('')
  
  // Add summary information showing salary vs distribution total
  const monthlySalary = calculateMonthlySalary(selectedMonth)
  const totalDistribution = Object.values(monthlyDistributions).reduce((sum, amount) => sum + amount, 0)
  
  if (monthlySalary > 0) {
    const summaryEl = document.createElement('div')
    summaryEl.className = 'budget-summary'
    summaryEl.innerHTML = `
      <div class="summary-info">
        <strong>Monthly Salary:</strong> ${formatCurrency(monthlySalary)} | 
        <strong>Total Distribution:</strong> ${formatCurrency(totalDistribution)}
        ${Math.abs(monthlySalary - totalDistribution) < 0.01 ? ' ✓' : ' (Auto-adjusted)'}
      </div>
    `
    budgetOverviewEl.appendChild(summaryEl)
  }
}

function editTransaction(transactionId: string) {
  // If already editing a transaction, cancel that edit first
  if (editingTransactionId) {
    cancelEdit()
  }
  
  editingTransactionId = transactionId
  const transaction = transactions.find(t => t.id === transactionId)
  if (!transaction) return
  
  const row = document.querySelector(`[data-transaction-id="${transactionId}"]`) as HTMLElement
  if (!row) return
  
  // Convert row to edit mode
  const enabledCategories = categories.filter(cat => cat.enabled)
  const editCategoryOptions = enabledCategories.length > 0 
    ? enabledCategories.map(cat => 
        `<option value="${cat.name}" ${transaction.category === cat.name ? 'selected' : ''}>${cat.name}</option>`
      ).join('')
    : `<option value="${transaction.category}" selected>${transaction.category} (Category disabled)</option>`
  
  row.innerHTML = `
    <input type="month" class="edit-month" value="${transaction.month}" />
    <input type="text" class="edit-description" value="${transaction.description}" />
    <input type="text" class="edit-amount" value="${transaction.amount}" inputmode="decimal" />
    <select class="edit-category">
      ${editCategoryOptions}
    </select>
    <select class="edit-account">
      <option value="Checking Account" ${transaction.account === 'Checking Account' ? 'selected' : ''}>Checking Account</option>
      <option value="Savings Account" ${transaction.account === 'Savings Account' ? 'selected' : ''}>Savings Account</option>
      <option value="Credit Card" ${transaction.account === 'Credit Card' ? 'selected' : ''}>Credit Card</option>
      <option value="Cash" ${transaction.account === 'Cash' ? 'selected' : ''}>Cash</option>
      <option value="Investment Account" ${transaction.account === 'Investment Account' ? 'selected' : ''}>Investment Account</option>
    </select>
    <select class="edit-type">
      <option value="expense" ${transaction.transaction_type === 'expense' ? 'selected' : ''}>Expense</option>
      <option value="income" ${transaction.transaction_type === 'income' ? 'selected' : ''}>Income</option>
      <option value="transfer" ${transaction.transaction_type === 'transfer' ? 'selected' : ''}>Transfer</option>
    </select>
    <div class="edit-date">${new Date(transaction.date).toLocaleDateString()}</div>
    <div class="edit-actions">
      <button class="save-btn" onclick="saveTransaction('${transactionId}')">Save</button>
      <button class="cancel-btn" onclick="cancelEdit()">Cancel</button>
    </div>
  `
  
  row.classList.add('editing')
}

function cancelEdit() {
  if (!editingTransactionId) return
  
  editingTransactionId = null
  renderRecentTransactions()
}

async function saveTransaction(transactionId: string) {
  const row = document.querySelector(`[data-transaction-id="${transactionId}"]`) as HTMLElement
  if (!row) return
  
  const monthEl = row.querySelector('.edit-month') as HTMLInputElement
  const descriptionEl = row.querySelector('.edit-description') as HTMLInputElement
  const amountEl = row.querySelector('.edit-amount') as HTMLInputElement
  const categoryEl = row.querySelector('.edit-category') as HTMLSelectElement
  const accountEl = row.querySelector('.edit-account') as HTMLSelectElement
  const typeEl = row.querySelector('.edit-type') as HTMLSelectElement
  
  if (!monthEl || !descriptionEl || !amountEl || !categoryEl || !accountEl || !typeEl) return
  
  const month = monthEl.value.trim()
  const description = descriptionEl.value.trim()
  const amount = parseFloat(amountEl.value)
  const category = categoryEl.value
  const account = accountEl.value
  const transaction_type = typeEl.value as 'income' | 'expense' | 'transfer'
  
  // Validate required fields
  if (!description || isNaN(amount) || amount <= 0 || !category || !account || !month) {
    alert('Please fill in all fields with valid values')
    return
  }
  
  // Find and update the transaction
  const transactionIndex = transactions.findIndex(t => t.id === transactionId)
  if (transactionIndex === -1) return
  
  transactions[transactionIndex] = {
    ...transactions[transactionIndex],
    month,
    description,
    amount,
    category,
    account,
    transaction_type
  }
  
  try {
    await saveTransactionsToFile()
    editingTransactionId = null
    updateDashboard()
    renderRecentTransactions()
    showSuccessMessage('Transaction updated successfully')
  } catch (error) {
    console.error('Failed to save transaction:', error)
    alert('Failed to save transaction. Please try again.')
  }
}