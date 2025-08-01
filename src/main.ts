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

// GOOGLE API DECLARATIONS
// Declare Google API globals to avoid TypeScript errors
declare const gapi: any
declare const google: any


// TAURI API IMPORTS  
// These provide access to native desktop functionality through Tauri's secure API
import { open } from '@tauri-apps/api/dialog'              // File/folder picker dialogs
import { homeDir, join } from '@tauri-apps/api/path'       // Cross-platform path operations
import { exists, createDir, writeTextFile, readTextFile, removeFile } from '@tauri-apps/api/fs'  // File system operations

// STYLING
import './style.css'  // Main application styles

// DATABASE IMPORTS
import { 
  initializeDatabase,
  getAllCategories, 
  insertCategory, 
  updateCategory, 
  deleteCategory,
  getActiveCategories
} from './database/index';

// TYPE IMPORTS
import { Category, CategoryBalance, CategoryDistribution } from './types';

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
 * Formats numbers as Danish kroner currency
 * Uses browser's built-in Intl.NumberFormat for proper localization
 * 
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string (e.g., "1.234,56 kr.")
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('da-DK', {
    style: 'currency',
    currency: 'DKK'
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
  
  // Update category balances for each new transaction
  for (const transaction of newTransactions) {
    await updateCategoryBalanceForTransaction(
      transaction.category,
      transaction.month,
      transaction.amount,
      transaction.transaction_type
    )
  }
  
  // Update the UI immediately to show the new transactions
  updateDashboard()
  renderRecentTransactions()
  populateMonthSelector()
  await loadCategoriesIntoGlobal()
  
  // Clear and reset the form immediately for better UX
  formRowsEl.innerHTML = ''
  addFormRow() // Add one empty row
  
  // Add visual highlight effect to new transactions
  setTimeout(() => {
    highlightNewTransactions(newTransactions.length)
  }, 100)
  
  try {
    await saveAllDataToFile()
    
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
  try {
    console.log('=== SHOWING SUCCESS MESSAGE ===')
    console.log('Message:', message)
    
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
  
  console.log('✓ Success message created and animated')
  } catch (error) {
    console.error('Error showing success message:', error)
  }
}


async function saveCategoriesFile(): Promise<boolean> {
  try {
    console.log('=== SAVE CATEGORIES TO FILE START ===')
    console.log('Storage type:', storageType)
    
    // Get categories from database
    const categoriesResult = await getAllCategories()
    if (!categoriesResult.success) {
      console.error('Failed to get categories from database:', categoriesResult.error)
      return false
    }
    
    const categories = categoriesResult.data || []
    console.log('Category count:', categories.length)
    
    const content = JSON.stringify(categories, null, 2)
    console.log('Categories content length:', content.length)
    
    if (storageType === 'googledrive') {
      console.log('Saving categories to Google Drive...')
      try {
        const success = await saveToGoogleDrive('categories.json', content)
        console.log('Google Drive categories save result:', success)
        
        if (success) {
          // Also save to local cache if we have a path
          if (dataStoragePath) {
            console.log('Saving categories to local cache...')
            const cacheFile = await join(dataStoragePath, 'categories.json')
            await writeTextFile(cacheFile, content)
            console.log('Local categories cache saved successfully')
          }
          return true
        } else {
          console.error('Google Drive categories save failed')
          return false
        }
      } catch (error) {
        console.error('Google Drive categories save error:', error)
        return false
      }
    } else {
      // Local storage
      if (dataStoragePath) {
        const filePath = await join(dataStoragePath, 'categories.json')
        await writeTextFile(filePath, content)
        console.log('Categories saved to local file successfully')
        return true
      } else {
        console.error('No storage path available for categories')
        return false
      }
    }
  } catch (error) {
    console.error('Error in saveCategoriesFile:', error)
    return false
  }
}

async function saveTransactionsToFile(): Promise<boolean> {
  try {
    console.log('=== SAVE TRANSACTIONS TO FILE START ===')
    console.log('Storage type:', storageType)
    console.log('Transaction count:', transactions.length)
    
    // Check if there are any transactions to save
    if (transactions.length === 0) {
      console.log('No transactions to save, creating empty array file')
    }
    
    const content = JSON.stringify(transactions, null, 2)
    console.log('Content length:', content.length)
    console.log('Content preview:', content.substring(0, 200))
    
    if (storageType === 'googledrive') {
      console.log('Saving to Google Drive...')
      // Save to Google Drive and local cache
      try {
        const success = await saveToGoogleDrive('transactions.json', content)
        console.log('Google Drive save result:', success)
        
        if (success) {
          // Also save to local cache if we have a path
          if (dataStoragePath) {
            console.log('Saving to local cache...')
            const cacheFile = await join(dataStoragePath, 'transactions.json')
            await writeTextFile(cacheFile, content)
            console.log('Local cache saved successfully')
          }
          return true
        } else {
          console.error('Google Drive save failed')
          return false
        }
      } catch (error) {
        console.error('Google Drive save error:', error)
        // If Google Drive fails, try to save locally if possible
        if (dataStoragePath && isOnline === false) {
          console.log('Falling back to local save (offline)')
          const cacheFile = await join(dataStoragePath, 'transactions.json')
          await writeTextFile(cacheFile, content)
          updateSyncStatus('error', 'Saved locally - sync pending')
          return true // Local save succeeded
        } else {
          console.error('Unable to save to Google Drive or locally')
          return false
        }
      }
    } else {
      console.log('Saving to local storage...')
      // Local storage
      if (!dataStoragePath) {
        console.error('No data storage path set')
        throw new Error('No data storage path set')
      }

      try {
        const transactionsFile = await join(dataStoragePath, 'transactions.json')
        await writeTextFile(transactionsFile, content)
        console.log('Local save successful')
        return true
      } catch (error) {
        console.error('Failed to save transactions to local file:', error)
        return false
      }
    }
  } catch (error) {
    console.error('=== SAVE TRANSACTIONS ERROR ===')
    console.error('Error details:', error)
    return false
  }
}

async function saveAllDataToFile(): Promise<boolean> {
  try {
    console.log('=== SAVE ALL DATA TO FILE START ===')
    
    // Save both transactions and categories
    const transactionsSuccess = await saveTransactionsToFile()
    const categoriesSuccess = await saveCategoriesFile()
    
    if (transactionsSuccess && categoriesSuccess) {
      console.log('✓ All data saved successfully')
      return true
    } else {
      console.error('❌ Some data failed to save:', {
        transactions: transactionsSuccess,
        categories: categoriesSuccess
      })
      return false
    }
  } catch (error) {
    console.error('Error saving all data:', error)
    return false
  }
}

async function loadTransactions() {
  try {
    console.log('=== LOADING TRANSACTIONS ===')
    console.log('Storage type:', storageType)
    
    // Initialize database first
    console.log('Initializing database...')
    await initializeDatabase(dataStoragePath || undefined)
    console.log('Database initialized successfully')
    
    // Load categories, balances, and distributions into global variables
    await loadCategoriesIntoGlobal()
    await loadCategoryBalances()
    await loadCategoryDistributions()
    let loadedTransactions: Transaction[] = []
    
    if (storageType === 'googledrive') {
      console.log('Loading from Google Drive...')
      console.log('Google Drive folder ID:', googleDriveFolderId)
      console.log('Google Drive auth available:', !!googleDriveAuth)
      
      // Try to load from Google Drive first
      try {
        console.log('Calling loadFromGoogleDrive for transactions...')
        const driveContent = await loadFromGoogleDrive('transactions.json')
        console.log('loadFromGoogleDrive result:', driveContent ? 'content received' : 'no content')
        if (driveContent) {
          loadedTransactions = JSON.parse(driveContent)
          console.log('Parsed transactions from Google Drive:', loadedTransactions.length, 'items')
        }
        
        // Also try to load categories from Google Drive
        console.log('Calling loadFromGoogleDrive for categories...')
        const categoriesContent = await loadFromGoogleDrive('categories.json')
        console.log('Categories loadFromGoogleDrive result:', categoriesContent ? 'content received' : 'no content')
        if (categoriesContent) {
          try {
            const driveCategories = JSON.parse(categoriesContent)
            console.log('Parsed categories from Google Drive:', driveCategories.length, 'items')
            
            // Update local database with Google Drive categories
            for (const category of driveCategories) {
              try {
                if (category.id) {
                  // Try to update existing category first
                  const updateResult = await updateCategory(category.id, {
                    name: category.name,
                    available_from: category.available_from,
                    available_until: category.available_until,
                    initial_budget: category.initial_budget,
                    status: category.status
                  })
                  
                  if (!updateResult.success) {
                    // If update fails, try to insert as new
                    await insertCategory({
                      name: category.name,
                      available_from: category.available_from,
                      available_until: category.available_until,
                      initial_budget: category.initial_budget,
                      status: category.status
                    })
                  }
                } else {
                  // Insert new category
                  await insertCategory({
                    name: category.name,
                    available_from: category.available_from,
                    available_until: category.available_until,
                    initial_budget: category.initial_budget,
                    status: category.status
                  })
                }
              } catch (categoryError) {
                console.error('Error syncing category:', category.name, categoryError)
              }
            }
            console.log('Categories synced from Google Drive to local database')
          } catch (categoriesParseError) {
            console.error('Error parsing categories from Google Drive:', categoriesParseError)
          }
        }
      } catch (error) {
        console.error('=== GOOGLE DRIVE LOAD ERROR ===')
        console.error('Error details:', error)
        console.error('Error type:', typeof error)
        console.error('Error message:', (error as Error)?.message)
        
        // Fall back to local cache
        if (dataStoragePath) {
          console.log('Falling back to local cache...')
          const cacheFile = await join(dataStoragePath, 'transactions.json')
          if (await exists(cacheFile)) {
            const fileContent = await readTextFile(cacheFile)
            loadedTransactions = JSON.parse(fileContent)
            updateSyncStatus('error', 'Loaded from cache - sync pending')
            console.log('Loaded from local cache:', loadedTransactions.length, 'items')
          } else {
            console.log('No local cache file found')
          }
        } else {
          console.log('No data storage path available for cache')
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
    await loadCategoriesIntoGlobal()
    
    // Initialize distributions for existing months if distributions.json doesn't exist
    const distributionsPath = await getCategoryDistributionsPath()
    if (!(await exists(distributionsPath))) {
      console.log('Distributions file not found, initializing for existing months...')
      await initializeDistributionsForAllExistingMonths()
    }
  } catch (error) {
    console.error('Failed to load transactions:', error)
  }
}

function setupEventListeners() {
  console.log('Setting up all event listeners...')
  
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const target = e.target as HTMLButtonElement
      const pageId = target.dataset.page
      if (pageId) {
        showPage(pageId)
        // Load categories when navigating to budgets page
        if (pageId === 'budgets') {
          await loadCategoriesIntoGlobal()
        }
      }
    })
  })

  // Settings navigation
  const settingsBtn = document.getElementById('settings-btn')
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => showPage('settings'))
  } else {
    console.error('Settings button not found during event listener setup!')
  }

  const backFromSettingsBtn = document.getElementById('back-from-settings-btn')
  if (backFromSettingsBtn) {
    backFromSettingsBtn.addEventListener('click', () => showPage('dashboard'))
  } else {
    console.error('Back from settings button not found during event listener setup!')
  }

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

  // Edit distributions button
  const editDistributionsBtn = document.getElementById('edit-distributions-btn')
  if (editDistributionsBtn) {
    editDistributionsBtn.addEventListener('click', toggleDistributionEditing)
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
    console.log('=== ATTACHING EVENT LISTENER TO SELECT DRIVE FOLDER BUTTON ===')
    selectGDriveFolderBtn.addEventListener('click', async (e) => {
      console.log('=== SELECT DRIVE FOLDER BUTTON CLICKED ===')
      e.preventDefault()
      e.stopPropagation()
      try {
        await handleGoogleDriveFolderSelection()
      } catch (error) {
        console.error('Error in handleGoogleDriveFolderSelection:', error)
      }
    })
  } else {
    console.error('Select Google Drive folder button not found during event listener setup!')
  }

  // Manual sync button
  const manualSyncBtn = document.getElementById('manual-sync-btn')
  if (manualSyncBtn) {
    manualSyncBtn.addEventListener('click', async () => {
      if (storageType === 'googledrive') {
        console.log('=== MANUAL SYNC REQUESTED ===')
        
        // Prevent multiple concurrent syncs
        if ((manualSyncBtn as HTMLButtonElement).disabled) {
          console.log('Sync already in progress, ignoring request')
          return
        }
        
        // Disable button during sync
        (manualSyncBtn as HTMLButtonElement).disabled = true
        const originalText = manualSyncBtn.textContent
        manualSyncBtn.textContent = 'Syncing...'
        
        updateSyncStatus('syncing', 'Syncing...')
        
        try {
          console.log('=== MANUAL SYNC: Starting validation checks ===')
          
          // Check if we have the folder ID
          if (!googleDriveFolderId) {
            console.error('No Google Drive folder ID available')
            updateSyncStatus('error', 'Setup incomplete - please reconfigure')
            return
          }
          console.log('✓ Google Drive folder ID validated:', googleDriveFolderId)
          
          // Ensure we're authenticated before syncing
          if (!googleDriveAuth) {
            console.log('Not authenticated, authenticating first...')
            updateSyncStatus('connecting', 'Authenticating...')
            const authenticated = await authenticateGoogleDrive()
            if (!authenticated) {
              console.error('Authentication failed during manual sync')
              updateSyncStatus('error', 'Authentication failed')
              return
            }
            console.log('Authentication successful')
          }
          console.log('✓ Google Drive authentication validated')
          
          console.log('=== MANUAL SYNC: Starting transaction save ===')
          console.log('About to call saveAllDataToFile()...')
          
          // Add a small delay to ensure all async operations are settled
          await new Promise(resolve => setTimeout(resolve, 100))
          
          const success = await saveAllDataToFile()
          
          console.log('=== MANUAL SYNC: Transaction save completed ===')
          console.log('Save result:', success)
          
          // Add another small delay before UI updates
          await new Promise(resolve => setTimeout(resolve, 100))
          
          if (success) {
            console.log('✓ Manual sync completed successfully')
            updateSyncStatus('synced', 'Synced successfully')
            
            // Add delay before showing success message to prevent any timing issues
            setTimeout(() => {
              try {
                showSuccessMessage('Sync completed successfully!')
                console.log('✓ Success message displayed')
              } catch (msgError) {
                console.error('Error showing success message:', msgError)
              }
            }, 200)
          } else {
            console.error('✗ Manual sync failed - saveTransactionsToFile returned false')
            updateSyncStatus('error', 'Sync failed')
          }
          
          console.log('=== MANUAL SYNC: Process completed, should NOT restart ===')
        } catch (error) {
          console.error('=== MANUAL SYNC ERROR ===')
          console.error('Error details:', error)
          console.error('Error type:', typeof error)
          console.error('Error message:', (error as Error)?.message)
          console.error('Error stack:', (error as Error)?.stack)
          
          updateSyncStatus('error', 'Sync failed')
          
          // Show user-friendly error message
          const errorMessage = (error as Error)?.message || 'Unknown error occurred'
          alert(`Sync failed: ${errorMessage}\n\nPlease check your internet connection and try again.`)
        } finally {
          // Re-enable button
          console.log('=== MANUAL SYNC: Cleaning up ===')
          (manualSyncBtn as HTMLButtonElement).disabled = false
          manualSyncBtn.textContent = originalText
          console.log('✓ Button re-enabled and text restored')
          console.log('=== MANUAL SYNC: Process fully completed, app should remain open ===')
        }
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
// Add global error handlers to catch any unhandled errors that might cause app restarts
window.addEventListener('error', (event) => {
  console.error('=== GLOBAL ERROR CAUGHT ===')
  console.error('Error:', event.error)
  console.error('Message:', event.message)
  console.error('Filename:', event.filename)
  console.error('Line:', event.lineno)
  console.error('Column:', event.colno)
  // Prevent default behavior that might restart the app
  event.preventDefault()
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('=== UNHANDLED PROMISE REJECTION CAUGHT ===')
  console.error('Reason:', event.reason)
  console.error('Promise:', event.promise)
  // Prevent default behavior that might restart the app
  event.preventDefault()
})

// Monitor any navigation attempts that might cause restarts
window.addEventListener('beforeunload', (event) => {
  console.error('=== BEFOREUNLOAD EVENT TRIGGERED ===')
  console.error('The app is trying to unload/restart!')
  console.error('Stack trace:', new Error().stack)
  
  // For debugging - let's see what triggered this
  event.returnValue = 'Debug: App is trying to restart - check console'
})

window.addEventListener('DOMContentLoaded', async () => {
  try {
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
    await renderCategoriesTable()   // Initialize categories table display
    updateTransactionFormCategories() // Initialize transaction form categories

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
    
    console.log('DOM Content Loaded setup completed successfully')
  } catch (error) {
    console.error('=== DOM CONTENT LOADED ERROR ===')
    console.error('Error details:', error)
    console.error('Error message:', (error as Error)?.message)
    console.error('Error stack:', (error as Error)?.stack)
    
    // Show error to user but don't restart app
    alert(`Failed to initialize application: ${(error as Error)?.message || 'Unknown error'}\n\nSome features may not work correctly. Please restart the application.`)
  }

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
let categoryBalances: CategoryBalance[] = []       // All category balances per month
let categoryDistributions: CategoryDistribution[] = [] // All category distributions per month
let dataStoragePath: string | null = null         // Path where data files are stored
let storageType: 'local' | 'googledrive' = 'local' // Storage backend type

// Budget editing state
let isEditingDistributions = false                // Whether distributions are currently being edited
let currentEditingMonth: string | null = null     // The month currently being edited

/**
 * Load categories from database into global categories variable
 */
async function loadCategoriesIntoGlobal(): Promise<void> {
  try {
    const result = await getAllCategories()
    if (result.success) {
      categories = result.data || []
      console.log(`Loaded ${categories.length} categories into global variable`)
    } else {
      console.error('Failed to load categories into global variable:', result.error)
      categories = []
    }
  } catch (error) {
    console.error('Error loading categories into global variable:', error)
    categories = []
  }
}

// ============================================================================
// CATEGORY BALANCE MANAGEMENT
// ============================================================================

/**
 * Get the path for category balances JSON file
 */
async function getCategoryBalancesPath(): Promise<string> {
  if (dataStoragePath) {
    return await join(dataStoragePath, 'category_balance.json')
  } else {
    const home = await homeDir()
    const defaultPath = await join(home, '.familyledger')
    return await join(defaultPath, 'category_balance.json')
  }
}

/**
 * Load category balances from JSON file
 */
async function loadCategoryBalances(): Promise<void> {
  try {
    const balancesPath = await getCategoryBalancesPath()
    if (await exists(balancesPath)) {
      const content = await readTextFile(balancesPath)
      categoryBalances = JSON.parse(content || '[]')
      console.log(`Loaded ${categoryBalances.length} category balances`)
    } else {
      categoryBalances = []
      console.log('No category balances file found, starting fresh')
    }
  } catch (error) {
    console.error('Error loading category balances:', error)
    categoryBalances = []
  }
}

/**
 * Save category balances to JSON file
 */
async function saveCategoryBalances(): Promise<void> {
  try {
    const balancesPath = await getCategoryBalancesPath()
    const content = JSON.stringify(categoryBalances, null, 2)
    await writeTextFile(balancesPath, content)
    console.log(`Saved ${categoryBalances.length} category balances`)
  } catch (error) {
    console.error('Error saving category balances:', error)
    throw error
  }
}

/**
 * Get the file path for category distributions storage
 */
async function getCategoryDistributionsPath(): Promise<string> {
  if (dataStoragePath) {
    return await join(dataStoragePath, 'distributions.json')
  } else {
    return 'distributions.json'
  }
}

/**
 * Load category distributions from file
 */
async function loadCategoryDistributions(): Promise<void> {
  try {
    const distributionsPath = await getCategoryDistributionsPath()
    if (await exists(distributionsPath)) {
      const content = await readTextFile(distributionsPath)
      categoryDistributions = JSON.parse(content || '[]')
      console.log(`Loaded ${categoryDistributions.length} category distributions`)
    } else {
      categoryDistributions = []
      console.log('No distributions file found, starting with empty distributions')
    }
  } catch (error) {
    console.error('Error loading category distributions:', error)
    categoryDistributions = []
  }
}

/**
 * Save category distributions to file
 */
async function saveCategoryDistributions(): Promise<void> {
  try {
    const distributionsPath = await getCategoryDistributionsPath()
    const content = JSON.stringify(categoryDistributions, null, 2)
    await writeTextFile(distributionsPath, content)
    console.log(`Saved ${categoryDistributions.length} category distributions`)
  } catch (error) {
    console.error('Error saving category distributions:', error)
    throw error
  }
}

/**
 * Get category balance for a specific category and month
 */
function getCategoryBalance(categoryName: string, month: string): CategoryBalance | null {
  return categoryBalances.find(balance => 
    balance.category_name === categoryName && balance.month === month
  ) || null
}

/**
 * Set or update category balance for a specific category and month
 */
function setCategoryBalance(categoryName: string, month: string, balance: number): void {
  const existingBalance = getCategoryBalance(categoryName, month)
  const now = new Date().toISOString()
  
  if (existingBalance) {
    existingBalance.balance = balance
    existingBalance.updated_at = now
  } else {
    const newBalance: CategoryBalance = {
      id: categoryBalances.length + 1,
      category_name: categoryName,
      month: month,
      balance: balance,
      created_at: now,
      updated_at: now
    }
    categoryBalances.push(newBalance)
  }
}

/**
 * Initialize category balance when a new category is created
 * Sets the balance to the initial_budget for the category's available_from month
 */
async function initializeCategoryBalance(category: Category): Promise<void> {
  if (!category.available_from || category.initial_budget === undefined) {
    console.log(`Skipping balance initialization for category "${category.name}" - missing available_from or initial_budget`)
    return
  }
  
  const month = category.available_from
  const initialBalance = category.initial_budget
  
  console.log(`Initializing balance for category "${category.name}" in month ${month} with balance ${initialBalance}`)
  setCategoryBalance(category.name, month, initialBalance)
  await saveCategoryBalances()
}

/**
 * Initialize all active categories for a new month
 * This is called when the first transaction for a new month is recorded
 */
async function initializeAllCategoriesForMonth(newMonth: string): Promise<void> {
  console.log(`Initializing all active categories for new month: ${newMonth}`)
  
  // Get the previous month to carry forward balances
  const previousMonth = getPreviousMonth(newMonth)
  console.log(`Previous month: ${previousMonth}`)
  
  for (const category of categories) {
    // Check if category is active and should be available in this month
    if (category.status !== 'active') continue
    
    // Check if the category is available in this month
    if (category.available_from && newMonth < category.available_from) continue
    if (category.available_until && newMonth > category.available_until) continue
    
    // Check if we already have a balance for this category in this month
    const existingBalance = getCategoryBalance(category.name, newMonth)
    if (existingBalance) {
      console.log(`Category "${category.name}" already has balance for ${newMonth}: ${existingBalance.balance}`)
      continue
    }
    
    // Get the balance from the previous month, or use initial budget if no previous balance
    let balanceToCarryForward = category.initial_budget || 0
    
    if (previousMonth) {
      const previousBalance = getCategoryBalance(category.name, previousMonth)
      if (previousBalance) {
        balanceToCarryForward = previousBalance.balance
        console.log(`Carrying forward balance for "${category.name}" from ${previousMonth}: ${balanceToCarryForward}`)
      } else {
        console.log(`No previous balance found for "${category.name}", using initial budget: ${balanceToCarryForward}`)
      }
    }
    
    setCategoryBalance(category.name, newMonth, balanceToCarryForward)
  }
  
  await saveCategoryBalances()
  
  // Initialize distributions for all active categories (set to 0)
  await initializeDistributionsForMonth(newMonth)
  
  console.log(`Completed initialization for month ${newMonth}`)
}

/**
 * Get the previous month in YYYY-MM format
 */
function getPreviousMonth(month: string): string | null {
  try {
    const [year, monthNum] = month.split('-').map(Number)
    const date = new Date(year, monthNum - 1, 1) // monthNum - 1 because Date months are 0-indexed
    date.setMonth(date.getMonth() - 1) // Go back one month
    
    const prevYear = date.getFullYear()
    const prevMonth = (date.getMonth() + 1).toString().padStart(2, '0') // +1 because Date months are 0-indexed
    
    return `${prevYear}-${prevMonth}`
  } catch (error) {
    console.error('Error calculating previous month:', error)
    return null
  }
}

/**
 * Update category balance when a transaction is processed
 */
async function updateCategoryBalanceForTransaction(
  categoryName: string, 
  month: string, 
  amount: number, 
  transactionType: 'income' | 'expense'
): Promise<void> {
  console.log(`Updating balance for category "${categoryName}" in ${month}: ${transactionType} ${amount}`)
  
  // Ensure all categories are initialized for this month if this is the first transaction
  const monthHasBalances = categoryBalances.some(balance => balance.month === month)
  if (!monthHasBalances) {
    console.log(`First transaction for month ${month}, initializing all categories`)
    await initializeAllCategoriesForMonth(month)
  }
  
  // Get current balance
  let currentBalance = getCategoryBalance(categoryName, month)
  if (!currentBalance) {
    // This shouldn't happen if initializeAllCategoriesForMonth worked correctly
    console.warn(`No balance found for category "${categoryName}" in ${month}, creating with 0 balance`)
    const category = categories.find(cat => cat.name === categoryName)
    const initialBalance = category?.initial_budget || 0
    setCategoryBalance(categoryName, month, initialBalance)
    currentBalance = getCategoryBalance(categoryName, month)
  }
  
  if (currentBalance) {
    // Update balance: income increases balance, expenses decrease balance
    const balanceChange = transactionType === 'income' ? amount : -amount
    const newBalance = currentBalance.balance + balanceChange
    
    console.log(`Category "${categoryName}" balance change: ${currentBalance.balance} + ${balanceChange} = ${newBalance}`)
    setCategoryBalance(categoryName, month, newBalance)
    await saveCategoryBalances()
  }
}

/**
 * Get category distribution for a specific category and month
 */
function getCategoryDistribution(categoryName: string, month: string): CategoryDistribution | null {
  return categoryDistributions.find(distribution => 
    distribution.category_name === categoryName && distribution.month === month
  ) || null
}

/**
 * Set or update category distribution for a specific category and month
 */
function setCategoryDistribution(categoryName: string, month: string, allocation: number): void {
  const existingDistribution = getCategoryDistribution(categoryName, month)
  const now = new Date().toISOString()
  
  if (existingDistribution) {
    existingDistribution.allocation = allocation
    existingDistribution.updated_at = now
  } else {
    const newDistribution: CategoryDistribution = {
      id: categoryDistributions.length + 1,
      category_name: categoryName,
      month: month,
      allocation: allocation,
      created_at: now,
      updated_at: now
    }
    categoryDistributions.push(newDistribution)
  }
}

/**
 * Initialize distributions for all active categories in a new month (all set to 0)
 */
async function initializeDistributionsForMonth(month: string): Promise<void> {
  console.log(`Initializing distributions for month ${month}`)
  
  // Get all active categories
  const activeCategories = categories.filter(category => {
    // Check if category is active
    if (category.status !== 'active') return false
    
    // Category must be available (month >= available_from)
    if (category.available_from && month < category.available_from) return false
    
    // Category must not be expired (month <= available_until)
    if (category.available_until && month > category.available_until) return false
    
    return true
  })
  
  // Initialize distribution to 0 for each active category
  for (const category of activeCategories) {
    const existingDistribution = getCategoryDistribution(category.name, month)
    if (!existingDistribution) {
      console.log(`Initializing distribution for category "${category.name}" in month ${month} with allocation 0`)
      setCategoryDistribution(category.name, month, 0)
    }
  }
  
  await saveCategoryDistributions()
}

/**
 * Initialize distributions for all existing months (called on app startup)
 */
async function initializeDistributionsForAllExistingMonths(): Promise<void> {
  console.log('Initializing distributions for all existing months...')
  
  // Get all unique months from existing transactions
  const uniqueMonths = [...new Set(transactions.map(t => t.month))].sort()
  
  for (const month of uniqueMonths) {
    await initializeDistributionsForMonth(month)
  }
  
  console.log(`Initialized distributions for ${uniqueMonths.length} existing months`)
}

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
    console.log('=== LOADING CONFIG ===')
    console.log('Loading storage path from:', configPath)
    if (await exists(configPath)) {
      console.log('Config file exists, reading content...')
      const configContent = await readTextFile(configPath)
      console.log('Raw config content:', configContent)
      const config = JSON.parse(configContent)
      console.log('Parsed config object:', config)
      
      // Update global variables
      if (config.storageType) {
        storageType = config.storageType
        console.log('Storage type loaded:', storageType)
      } else {
        console.log('No storageType in config')
      }
      
      if (config.googleDriveFolderId) {
        googleDriveFolderId = config.googleDriveFolderId
        console.log('Google Drive folder ID loaded:', googleDriveFolderId)
      } else {
        console.log('No googleDriveFolderId in config')
        console.log('Config keys available:', Object.keys(config))
        
        // If we're using Google Drive but don't have a folder ID, we need to fix this
        if (storageType === 'googledrive') {
          console.log('Google Drive storage detected but no folder ID found - needs to be re-configured')
        }
      }
      
      // Load Google Drive auth if available
      if (config.googleDriveAuth) {
        const savedAuth = config.googleDriveAuth
        const tokenAge = Date.now() - (savedAuth.saved_at || 0)
        const tokenExpiry = (savedAuth.expires_in || 3600) * 1000 // Convert to milliseconds
        
        console.log('Found saved Google Drive auth')
        console.log('Token age (minutes):', Math.round(tokenAge / 60000))
        console.log('Token expiry (minutes):', Math.round(tokenExpiry / 60000))
        
        // Check if token is still valid (with some buffer time)
        if (tokenAge < (tokenExpiry - 300000)) { // 5 minute buffer
          googleDriveAuth = {
            access_token: savedAuth.access_token,
            expires_in: savedAuth.expires_in
          }
          console.log('Restored valid Google Drive auth from config')
          
          // Set the token in gapi client if it's already initialized
          if (typeof gapi !== 'undefined' && gapi.client) {
            gapi.client.setToken(savedAuth)
            console.log('Set token in GAPI client')
          }
        } else {
          console.log('Saved Google Drive auth token has expired, will need to re-authenticate')
        }
      } else {
        console.log('No saved Google Drive auth found')
      }
      
      const dataPath = config.dataStoragePath || null
      console.log('Data storage path loaded:', dataPath)
      return dataPath
    } else {
      console.log('Config file does not exist at path:', configPath)
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
    
    const config: any = { 
      dataStoragePath: path, 
      storageType 
    }
    
    // Save Google Drive folder ID if using Google Drive storage
    if (storageType === 'googledrive' && googleDriveFolderId) {
      config.googleDriveFolderId = googleDriveFolderId
      console.log('Saving Google Drive folder ID to config:', googleDriveFolderId)
    }
    
    // Save Google Drive auth token if available (for persistence)
    if (storageType === 'googledrive' && googleDriveAuth) {
      config.googleDriveAuth = {
        access_token: googleDriveAuth.access_token,
        expires_in: googleDriveAuth.expires_in,
        saved_at: Date.now() // Store when token was saved
      }
      console.log('Saving Google Drive auth to config')
    }
    
    console.log('Saving config:', config)
    await writeTextFile(configPath, JSON.stringify(config, null, 2))
    console.log('Config saved successfully')
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
  try {
    console.log('=== INITIALIZING APP ===')
    
    // If using Google Drive, authenticate first before loading data
    if (storageType === 'googledrive') {
      console.log('Google Drive storage detected, checking authentication...')
      showMainSyncStatus()
      
      // Check if we have a folder ID - if not, user needs to reconfigure
      if (!googleDriveFolderId) {
        console.log('No Google Drive folder ID found - configuration incomplete')
        updateSyncStatus('error', 'Setup incomplete - please reconfigure Google Drive')
        
        // Show a helpful message to the user with two options
        setTimeout(async () => {
          const choice = confirm('Your Google Drive setup is incomplete. Choose how to fix this:\n\nOK = Complete the setup (recommended)\nCancel = Reset everything and start over')
          
          if (choice) {
            // Option 1: Just complete the missing setup by selecting the Google Drive folder
            console.log('User chose to complete setup - selecting Google Drive folder...')
            updateSyncStatus('connecting', 'Completing Google Drive setup...')
            
            try {
              console.log('Starting Google Drive folder selection...')
              const folderId = await selectGoogleDriveFolder()
              console.log('Selected folder ID:', folderId)
              
              if (folderId) {
                // Create FamilyLedger subfolder
                const familyLedgerFolderId = await createGoogleDriveFolder(DATA_FOLDER_NAME, folderId)
                console.log('Created FamilyLedger folder ID:', familyLedgerFolderId)
                
                if (familyLedgerFolderId) {
                  googleDriveFolderId = familyLedgerFolderId
                  console.log('Google Drive folder ID set:', googleDriveFolderId)
                  
                  // Save the updated config
                  await saveStoragePath(dataStoragePath || '')
                  console.log('Configuration updated successfully')
                  
                  updateSyncStatus('connected', 'Google Drive setup completed')
                  
                  // Now load the data
                  await loadTransactions()
                  showSuccessMessage('Google Drive setup completed successfully!')
                } else {
                  throw new Error('Failed to create FamilyLedger folder')
                }
              } else {
                updateSyncStatus('error', 'Setup cancelled - folder not selected')
              }
            } catch (error) {
              console.error('Error completing Google Drive setup:', error)
              updateSyncStatus('error', 'Setup failed - please try again')
              alert('Failed to complete Google Drive setup. Please try again or restart the app.')
            }
          } else {
            // Option 2: Full reset (delete config file)
            try {
              console.log('User chose full reset - deleting config file...')
              const configPath = await getConfigPath()
              console.log('Config path:', configPath)
              
              if (await exists(configPath)) {
                await removeFile(configPath)
                console.log('Config file deleted successfully')
              }
              
              localStorage.clear()
              location.reload()
            } catch (error) {
              console.error('Error during reset:', error)
              const configPath = await getConfigPath().catch(() => 'unknown path')
              alert(`Failed to reset automatically.\n\nManual fix:\n1. Close the app\n2. Delete: ${configPath}\n3. Restart the app`)
            }
          }
        }, 1000)
        return
      }
      
      // If we already have auth, just check if it's still valid
      if (googleDriveAuth) {
        console.log('Using existing Google Drive authentication')
        updateSyncStatus('connected', 'Connected to Google Drive')
      } else {
        console.log('No valid authentication found, authenticating...')
        updateSyncStatus('connecting', 'Connecting to Google Drive...')
        
        try {
          const authenticated = await authenticateGoogleDrive()
          if (authenticated) {
            console.log('Google Drive authentication successful on startup')
            updateSyncStatus('connected', 'Connected to Google Drive')
          } else {
            console.log('Google Drive authentication failed on startup')
            updateSyncStatus('error', 'Authentication failed')
            alert('Failed to authenticate with Google Drive. Please try again.')
            return // Don't try to load data if auth failed
          }
        } catch (error) {
          console.error('Google Drive authentication error on startup:', error)
          updateSyncStatus('error', 'Connection failed')
          alert('Failed to connect to Google Drive. Please check your internet connection and try again.')
          return // Don't try to load data if auth failed
        }
      }
    }
    
    // Load existing data if available
    console.log('Loading transactions...')
    await loadTransactions()
    console.log('App initialization completed successfully')
  } catch (error) {
    console.error('=== APP INITIALIZATION ERROR ===')
    console.error('Error details:', error)
    console.error('Error message:', (error as Error)?.message)
    console.error('Error stack:', (error as Error)?.stack)
    
    // Don't restart the app, just show an error message
    alert(`Failed to initialize app: ${(error as Error)?.message || 'Unknown error'}\n\nPlease restart the application.`)
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
          console.log('=== OAUTH CALLBACK RECEIVED ===')
          console.log('Token response:', tokenResponse)
          console.log('Has access_token:', !!tokenResponse?.access_token)
          if (tokenResponse && tokenResponse.access_token) {
            googleDriveAuth = {
              access_token: tokenResponse.access_token,
              expires_in: tokenResponse.expires_in
            }
            console.log('Setting GAPI client token...')
            gapi.client.setToken(tokenResponse)
            console.log('GAPI client token set successfully')
            
            // Save the auth token to config for persistence
            console.log('Saving auth token to config for future use...')
            saveStoragePath(dataStoragePath || '').catch(error => {
              console.error('Failed to save auth token to config:', error)
            })
            
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

    // Ensure gapi is properly initialized before using picker
    await ensureGapiReady()

    return new Promise((resolve) => {
      // Temporarily hide the modal to avoid z-index conflicts
      const modal = document.getElementById('data-location-modal')
      const originalDisplay = modal?.style.display
      if (modal) {
        modal.style.display = 'none'
      }
      
      const picker = new google.picker.PickerBuilder()
        .addView(new google.picker.DocsView(google.picker.ViewId.FOLDERS)
          .setSelectFolderEnabled(true))
        .setOAuthToken(googleDriveAuth.access_token)
        .setDeveloperKey(GOOGLE_API_KEY)
        .setCallback((data: any) => {
          console.log('Picker callback - action:', data.action)
          
          // Restore modal visibility after picker closes
          if (modal && originalDisplay) {
            modal.style.display = originalDisplay
          }
          
          if (data.action === 'picked' || data.action === google.picker.Action.PICKED) {
            if (data.docs && data.docs.length > 0) {
              const folder = data.docs[0]
              console.log('Selected folder ID:', folder.id)
              console.log('=== ABOUT TO RESOLVE WITH FOLDER ID ===')
              resolve(folder.id)
              console.log('=== RESOLVE CALLED ===')
            } else {
              console.log('No docs in picker data')
              resolve(null)
            }
          } else if (data.action === 'cancel' || data.action === google.picker.Action.CANCEL) {
            console.log('User cancelled picker')
            resolve(null)
          } else if (data.action === 'loaded') {
            console.log('Picker loaded - ignoring this action')
            // Don't resolve here, wait for picked or cancel
          } else {
            console.log('Unknown picker action:', data.action)
            resolve(null)
          }
        })
        .build()
      
      // Add a small delay to ensure modal is hidden before showing picker
      setTimeout(() => {
        picker.setVisible(true)
      }, 100)
    })
  } catch (error) {
    console.error('Failed to select Google Drive folder:', error)
    return null
  }
}

async function createGoogleDriveFolder(name: string, parentId?: string): Promise<string | null> {
  try {
    // Ensure gapi is properly initialized before using it
    await ensureGapiReady()
    
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

// Helper function to ensure gapi is available and initialized
async function ensureGapiReady(): Promise<void> {
  console.log('Checking gapi availability...')
  
  if (typeof gapi === 'undefined' || !gapi.client) {
    console.log('gapi not available or client not initialized, initializing Google Drive...')
    await initializeGoogleDrive()
  }
  
  // Set the access token if we have one
  if (googleDriveAuth && googleDriveAuth.access_token) {
    console.log('Setting access token for API calls...')
    gapi.client.setToken({ access_token: googleDriveAuth.access_token })
  } else {
    console.log('No authentication available, authenticating...')
    const authenticated = await authenticateGoogleDrive()
    if (!authenticated) {
      throw new Error('Failed to authenticate with Google Drive')
    }
    // Set the token after authentication
    if (googleDriveAuth && googleDriveAuth.access_token) {
      gapi.client.setToken({ access_token: googleDriveAuth.access_token })
    }
  }
  
  console.log('gapi is ready for use')
}

async function saveToGoogleDrive(fileName: string, content: string): Promise<boolean> {
  try {
    console.log('=== SAVE TO GOOGLE DRIVE START ===')
    console.log('File name:', fileName)
    console.log('Google Drive folder ID:', googleDriveFolderId)
    console.log('Content length:', content.length)
    
    if (!googleDriveFolderId) {
      throw new Error('No Google Drive folder selected')
    }

    // Ensure gapi is properly initialized before using it
    await ensureGapiReady()

    updateSyncStatus('syncing', 'Saving to Google Drive...')

    // Check if file exists
    console.log('Checking if file exists...')
    const existingFile = await findGoogleDriveFile(fileName)
    console.log('Existing file:', existingFile ? `Found (ID: ${existingFile.id})` : 'Not found')

    let response
    if (existingFile) {
      // Update existing file using the correct multipart upload
      console.log('Updating existing file...')
      console.log('Making PATCH request to update existing file...')
      response = await gapi.client.request({
        path: `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}`,
        method: 'PATCH',
        params: { 
          uploadType: 'media'
        },
        headers: { 
          'Content-Type': 'application/json'
        },
        body: content
      })
      console.log('PATCH request completed successfully')
    } else {
      // Create new file using multipart upload
      console.log('Creating new file...')
      
      const boundary = '-------314159265358979323846'
      const delimiter = "\r\n--" + boundary + "\r\n"
      const close_delim = "\r\n--" + boundary + "--"

      const metadata = {
        name: fileName,
        parents: [googleDriveFolderId],
        mimeType: 'application/json'
      }

      const multipartRequestBody =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        content +
        close_delim

      console.log('Making POST request to create new file...')
      response = await gapi.client.request({
        path: 'https://www.googleapis.com/upload/drive/v3/files',
        method: 'POST',
        params: {
          uploadType: 'multipart'
        },
        headers: {
          'Content-Type': 'multipart/related; boundary="' + boundary + '"'
        },
        body: multipartRequestBody
      })
      console.log('POST request completed successfully')
    }

    console.log('Google Drive API response status:', response.status)
    console.log('Google Drive API response:', response.result)

    if (response.status === 200) {
      updateSyncStatus('synced', 'Synced with Google Drive')
      console.log('File saved successfully to Google Drive')
      return true
    } else {
      console.error('Unexpected response status:', response.status)
      updateSyncStatus('error', 'Sync failed')
      return false
    }
  } catch (error) {
    console.error('=== GOOGLE DRIVE SAVE ERROR ===')
    console.error('Error details:', error)
    console.error('Error message:', (error as any)?.result?.error?.message)
    updateSyncStatus('error', 'Sync failed')
    return false
  }
}

async function loadFromGoogleDrive(fileName: string): Promise<string | null> {
  try {
    console.log('=== LOAD FROM GOOGLE DRIVE START ===')
    console.log('File name:', fileName)
    console.log('Google Drive folder ID:', googleDriveFolderId)
    console.log('Google Drive auth available:', !!googleDriveAuth)
    
    if (!googleDriveFolderId) {
      console.error('No Google Drive folder ID available')
      throw new Error('No Google Drive folder selected')
    }

    // Ensure gapi is properly initialized before using it
    await ensureGapiReady()

    updateSyncStatus('syncing', 'Loading from Google Drive...')

    console.log('Searching for file in Google Drive...')
    const file = await findGoogleDriveFile(fileName)
    console.log('File search result:', file ? `Found file ID: ${file.id}` : 'No file found')
    if (!file) {
      console.log('No data file found in Google Drive')
      updateSyncStatus('synced', 'No data found')
      return null
    }

    console.log('Downloading file content...')
    const response = await gapi.client.drive.files.get({
      fileId: file.id,
      alt: 'media'
    })
    console.log('File download response status:', response.status)
    console.log('File content length:', response.body?.length || 'no body')

    updateSyncStatus('synced', 'Loaded from Google Drive')
    return response.body
  } catch (error) {
    console.error('=== GOOGLE DRIVE LOAD ERROR ===')
    console.error('Error details:', error)
    console.error('Error message:', (error as Error)?.message)
    console.error('Error stack:', (error as Error)?.stack)
    updateSyncStatus('error', 'Sync failed')
    return null
  }
}

async function findGoogleDriveFile(fileName: string): Promise<any> {
  try {
    // Ensure gapi is properly initialized before using it
    await ensureGapiReady()
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
function updateSyncStatus(status: 'syncing' | 'synced' | 'error' | 'connected' | 'connecting', message: string) {
  const syncIcon = document.querySelector('.sync-icon')
  const syncText = document.querySelector('.sync-text')
  const mainSyncIcon = document.querySelector('#main-sync-status .sync-icon')
  const mainSyncText = document.querySelector('#main-sync-status .sync-text')
  
  const icons = {
    syncing: '🔄',
    synced: '☁️',
    error: '❌',
    connected: '✅',
    connecting: '🔗'
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
  console.log('=== handleGoogleDriveFolderSelection CALLED ===')
  try {
    console.log('Starting Google Drive folder selection...')
    const folderId = await selectGoogleDriveFolder()
    console.log('=== RETURNED FROM selectGoogleDriveFolder ===')
    console.log('Selected folder ID:', folderId)
    console.log('Type of folderId:', typeof folderId)
    
    if (folderId) {
      console.log('Creating FamilyLedger subfolder...')
      // Create FamilyLedger subfolder
      const familyLedgerFolderId = await createGoogleDriveFolder(DATA_FOLDER_NAME, folderId)
      console.log('Created FamilyLedger folder ID:', familyLedgerFolderId)
      console.log('Type of familyLedgerFolderId:', typeof familyLedgerFolderId)
      
      if (familyLedgerFolderId) {
        googleDriveFolderId = familyLedgerFolderId
        console.log('Google Drive folder ID set:', googleDriveFolderId)
        
        const pathInput = document.getElementById('selected-path') as HTMLInputElement
        const confirmBtn = document.getElementById('confirm-location-btn') as HTMLButtonElement
        
        console.log('Path input element:', pathInput)
        console.log('Path input current value:', pathInput?.value)
        console.log('Confirm button element:', confirmBtn)
        console.log('Confirm button disabled state:', confirmBtn?.disabled)
        
        if (pathInput) {
          console.log('Setting path input value...')
          pathInput.value = `Google Drive/${DATA_FOLDER_NAME}`
          console.log('Updated path input value to:', pathInput.value)
          console.log('Path input value after update:', pathInput.value)
        } else {
          console.error('Path input element not found!')
        }
        
        if (confirmBtn) {
          console.log('Enabling confirm button...')
          confirmBtn.disabled = false
          console.log('Confirm button disabled state after update:', confirmBtn.disabled)
        } else {
          console.error('Confirm button element not found!')
        }
        
        updateSyncStatus('connected', 'Google Drive folder selected')
        console.log('Folder selection completed successfully')
      } else {
        console.error('Failed to create FamilyLedger folder - familyLedgerFolderId is:', familyLedgerFolderId)
        alert('Failed to create FamilyLedger folder in Google Drive.')
      }
    } else {
      console.log('No folder selected by user - folderId is:', folderId)
    }
  } catch (error) {
    console.error('Folder selection error:', error)
    console.error('Error details:', error)
    alert('Failed to select Google Drive folder. Please try again.')
  }
}

async function renderCategoriesTable() {
  const categoriesTableBodyEl = document.getElementById('categories-table-body')
  if (!categoriesTableBodyEl) return

  try {
    const result = await getAllCategories()
    if (!result.success) {
      console.error('Failed to load categories:', result.error)
      categoriesTableBodyEl.innerHTML = '<div class="empty-state">Failed to load categories.</div>'
      return
    }

    const categories = result.data || []

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
          <input type="month" class="category-available-from-input" value="${category.available_from || ''}" ${!editingCategories ? 'disabled' : ''} />
        </div>
        <div class="category-available-until">
          <input type="month" class="category-available-until-input" value="${category.available_until || ''}" ${!editingCategories ? 'disabled' : ''} />
        </div>
        <div class="category-initial-budget">
          <input type="text" class="category-budget-input" value="${category.initial_budget || 0}" placeholder="0.00" inputmode="decimal" ${!editingCategories ? 'disabled' : ''} />
        </div>
      </div>
    `).join('')
  } catch (error) {
    console.error('Error rendering categories table:', error)
    categoriesTableBodyEl.innerHTML = '<div class="empty-state">Error loading categories.</div>'
  }
}

async function enterEditMode() {
  editingCategories = true
  
  // Show/hide buttons
  document.getElementById('edit-categories-btn')!.style.display = 'none'
  document.getElementById('add-category-btn')!.style.display = 'inline-block'
  document.getElementById('save-categories-btn')!.style.display = 'inline-block'
  document.getElementById('cancel-categories-btn')!.style.display = 'inline-block'
  
  await renderCategoriesTable()
}

async function exitEditMode() {
  editingCategories = false
  
  // Show/hide buttons
  document.getElementById('edit-categories-btn')!.style.display = 'inline-block'
  document.getElementById('add-category-btn')!.style.display = 'none'
  document.getElementById('save-categories-btn')!.style.display = 'none'
  document.getElementById('cancel-categories-btn')!.style.display = 'none'
  
  await renderCategoriesTable()
}


async function deleteCategoryById(categoryId: number) {
  try {
    const result = await deleteCategory(categoryId)
    if (result.success) {
      console.log('Category deleted successfully')
      await renderCategoriesTable()
    } else {
      console.error('Failed to delete category:', result.error)
      alert('Failed to delete category: ' + result.error)
    }
  } catch (error) {
    console.error('Error deleting category:', error)
    alert('Error deleting category. Please try again.')
  }
}

async function saveCategories() {
  try {
    // Update categories from form inputs
    const categoryRows = document.querySelectorAll('.category-row')
    
    const updatePromises: Promise<any>[] = []
    const insertPromises: Promise<any>[] = []
    
    categoryRows.forEach(row => {
      const categoryId = row.getAttribute('data-category-id')
      const nameInput = row.querySelector('.category-name-input') as HTMLInputElement
      const availableFromInput = row.querySelector('.category-available-from-input') as HTMLInputElement
      const availableUntilInput = row.querySelector('.category-available-until-input') as HTMLInputElement
      const budgetInput = row.querySelector('.category-budget-input') as HTMLInputElement
      
      if (categoryId && nameInput && availableFromInput && availableUntilInput && budgetInput) {
        const name = nameInput.value.trim()
        if (name) {
          const categoryData = {
            name,
            available_from: availableFromInput.value || undefined,
            available_until: availableUntilInput.value || undefined,
            initial_budget: parseFloat(budgetInput.value) || 0,
            status: 'active' as const  // All categories are now active by default
          }
          
          if (categoryId.startsWith('temp-')) {
            // This is a new category, insert it
            insertPromises.push(insertCategory(categoryData))
          } else {
            // This is an existing category, update it
            updatePromises.push(updateCategory(parseInt(categoryId), categoryData))
          }
        }
      }
    })
    
    // Wait for all operations to complete
    const updateResults = await Promise.all(updatePromises)
    const insertResults = await Promise.all(insertPromises)
    const allResults = [...updateResults, ...insertResults]
    const failures = allResults.filter(result => !result.success)
    
    if (failures.length > 0) {
      console.error('Some category operations failed:', failures)
      alert('Some categories could not be saved. Please try again.')
      return
    }
    
    exitEditMode()
    
    // Load updated categories into global variable
    await loadCategoriesIntoGlobal()
    
    // Initialize balances for any new categories
    for (const category of categories) {
      if (category.available_from && category.initial_budget !== undefined) {
        const existingBalance = getCategoryBalance(category.name, category.available_from)
        if (!existingBalance) {
          await initializeCategoryBalance(category)
        }
      }
    }
    
    // Sync categories to Google Drive if using cloud storage
    if (storageType === 'googledrive') {
      console.log('Syncing categories to Google Drive...')
      const syncSuccess = await saveCategoriesFile()
      if (syncSuccess) {
        showSuccessMessage('Categories saved and synced successfully')
      } else {
        showSuccessMessage('Categories saved locally, but sync failed')
      }
    } else {
      showSuccessMessage('Categories saved successfully')
    }
    
    // Update transaction forms with new categories
    await updateTransactionFormCategories()
    await renderCategoriesTable()
  } catch (error) {
    console.error('Error saving categories:', error)
    alert('Error saving categories. Please try again.')
  }
}

async function cancelCategoryEditing() {
  // Reload categories to discard changes
  await exitEditMode()
}

async function updateTransactionFormCategories() {
  try {
    const result = await getActiveCategories()
    if (!result.success) {
      console.error('Failed to load active categories:', result.error)
      return
    }

    const enabledCategories = result.data || []
    
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
  } catch (error) {
    console.error('Error updating transaction form categories:', error)
  }
}

async function addNewCategory() {
  if (!editingCategories) return
  
  const currentMonth = new Date()
  const monthValue = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`
  
  // Create a temporary new category object
  const tempId = Date.now() // Use timestamp as temporary ID
  const newCategory = {
    id: tempId,
    name: 'New Category',
    available_from: monthValue,
    initial_budget: 0,
    status: 'active' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  
  // Add new row to the table directly
  const categoriesTableBodyEl = document.getElementById('categories-table-body')
  if (!categoriesTableBodyEl) return
  
  const newRowHtml = `
    <div class="category-row" data-category-id="temp-${tempId}">
      <div class="category-name">
        <input type="text" class="category-name-input" value="${newCategory.name}" />
      </div>
      <div class="category-available-from">
        <input type="month" class="category-available-from-input" value="${newCategory.available_from}" />
      </div>
      <div class="category-available-until">
        <input type="month" class="category-available-until-input" value="" />
      </div>
      <div class="category-initial-budget">
        <input type="text" class="category-budget-input" value="${newCategory.initial_budget}" placeholder="0.00" inputmode="decimal" />
      </div>
    </div>
  `
  
  categoriesTableBodyEl.insertAdjacentHTML('beforeend', newRowHtml)
  
  // Focus on the new category name input
  setTimeout(() => {
    const newRow = document.querySelector(`[data-category-id="temp-${tempId}"]`)
    const input = newRow?.querySelector('.category-name-input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  }, 100)
}

function removeNewCategoryRow(tempId: string) {
  const row = document.querySelector(`[data-category-id="${tempId}"]`)
  if (row) {
    row.remove()
  }
}

async function handleCategoryDelete(categoryId: string) {
  if (categoryId.startsWith('temp-')) {
    // This is a new category that hasn't been saved yet, just remove the row
    removeNewCategoryRow(categoryId)
  } else {
    // This is an existing category, delete from database
    try {
      const result = await deleteCategory(parseInt(categoryId))
      if (result.success) {
        console.log('Category deleted successfully')
        await renderCategoriesTable()
        await updateTransactionFormCategories() 
      } else {
        console.error('Failed to delete category:', result.error)
        alert('Failed to delete category: ' + result.error)
      }
    } catch (error) {
      console.error('Error deleting category:', error)
      alert('Error deleting category. Please try again.')
    }
  }
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
  
  // Clear existing options
  monthSelectEl.innerHTML = ''
  
  uniqueMonths.forEach(month => {
    const option = document.createElement('option')
    option.value = month
    option.textContent = new Date(month + '-01').toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    })
    monthSelectEl.appendChild(option)
  })
  
  // Auto-select the latest available month
  if (uniqueMonths.length > 0) {
    const latestMonth = uniqueMonths[uniqueMonths.length - 1] // Last item in sorted array is most recent
    monthSelectEl.value = latestMonth
    // Trigger the budget overview rendering for the selected month
    renderBudgetOverview(latestMonth)
  }
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

function generateRandomDistribution(totalAmount: number, validCategoryNames: string[]): { [key: string]: number } {
  const distributions: { [key: string]: number } = {}
  let remainingAmount = totalAmount
  
  if (validCategoryNames.length === 0) {
    return distributions
  }
  
  // Generate random weights for each category
  const weights = validCategoryNames.map(() => Math.random())
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  
  // Distribute the amount based on weights
  for (let i = 0; i < validCategoryNames.length; i++) {
    const categoryName = validCategoryNames[i]
    if (i === validCategoryNames.length - 1) {
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
  
  // Get valid categories for this month
  const validCategories = categories.filter(category => {
    // Check if category is active
    if (category.status !== 'active') return false
    
    // Category must be available (month >= available_from)
    if (category.available_from && month < category.available_from) return false
    
    // Category must not be expired (month <= available_until)
    if (category.available_until && month > category.available_until) return false
    
    // Month is between available_from and available_until (both inclusive)
    return true
  })
  
  const validCategoryNames = validCategories.map(cat => cat.name)
  
  if (monthlySalary === 0 || validCategoryNames.length === 0) {
    // No salary for this month or no valid categories, return empty distributions
    const defaultDistributions: { [key: string]: number } = {}
    validCategoryNames.forEach(name => {
      defaultDistributions[name] = 0
    })
    return defaultDistributions
  }
  
  // For now, generate a simple equal distribution among valid categories
  // This could be enhanced later with saved preferences or more sophisticated logic
  const distributionPerCategory = monthlySalary / validCategoryNames.length
  const distributions: { [key: string]: number } = {}
  
  validCategoryNames.forEach(name => {
    distributions[name] = Math.round(distributionPerCategory * 100) / 100
  })
  
  return distributions
}

function renderBudgetOverview(selectedMonth: string) {
  const budgetOverviewEl = document.getElementById('budget-overview')
  const budgetTableBodyEl = document.getElementById('budget-table-body')
  
  if (!budgetOverviewEl || !budgetTableBodyEl) return

  budgetOverviewEl.style.display = 'block'
  
  console.log(`=== BUDGET OVERVIEW DEBUG ===`)
  console.log(`Selected month: ${selectedMonth}`)
  console.log(`Total categories available: ${categories.length}`)
  console.log(`Categories:`, categories)
  
  // Clear any existing summary
  const existingSummary = budgetOverviewEl.querySelector('.budget-summary')
  if (existingSummary) {
    existingSummary.remove()
  }
  
  // Filter categories that are valid for the selected month
  const validCategories = categories.filter(category => {
    // Check if category is active
    if (category.status !== 'active') return false
    
    // Category must be available (selectedMonth >= available_from)
    if (category.available_from && selectedMonth < category.available_from) {
      return false
    }
    
    // Category must not be expired (selectedMonth <= available_until)
    if (category.available_until && selectedMonth > category.available_until) {
      return false
    }
    
    // If we get here, the category is valid for this month
    return true
  })
  
  console.log(`Budget Overview: Found ${validCategories.length} valid categories for ${selectedMonth}:`, validCategories.map(c => c.name))
  
  // Get dynamic distributions based on salary for this month
  const monthlyDistributions = getMonthlyDistributions(selectedMonth)
  
  budgetTableBodyEl.innerHTML = validCategories.map(category => {
    // Get the current balance for this month
    const categoryBalance = getCategoryBalance(category.name, selectedMonth)
    const currentBalance = categoryBalance ? categoryBalance.balance : 0
    
    // Get the initial budget (balance from previous month or category's initial_budget)
    const previousMonth = getPreviousMonth(selectedMonth)
    let initialBudget = category.initial_budget || 0
    
    if (previousMonth) {
      const previousBalance = getCategoryBalance(category.name, previousMonth)
      if (previousBalance) {
        initialBudget = previousBalance.balance
      }
    }
    
    // Calculate actual transactions for this month
    const transactionSaldo = calculateTransactionSaldo(category.name, selectedMonth)
    
    // Get actual distribution for this category in this month (default to 0)
    const categoryDistribution = getCategoryDistribution(category.name, selectedMonth)
    const distribution = categoryDistribution ? categoryDistribution.allocation : 0
    
    return `
      <div class="budget-row">
        <div class="category">${category.name}</div>
        <div class="initial-budget">${formatCurrency(initialBudget)}</div>
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

/**
 * Toggle distribution editing mode
 */
function toggleDistributionEditing() {
  const editBtn = document.getElementById('edit-distributions-btn') as HTMLButtonElement
  const monthSelectEl = document.getElementById('budget-month-select') as HTMLSelectElement
  
  if (!editBtn || !monthSelectEl) return
  
  const selectedMonth = monthSelectEl.value
  if (!selectedMonth) {
    alert('Please select a month first')
    return
  }
  
  if (isEditingDistributions) {
    // Finish editing - save changes and exit edit mode
    finishDistributionEditing(selectedMonth)
  } else {
    // Start editing mode
    startDistributionEditing(selectedMonth)
  }
}

/**
 * Start distribution editing mode
 */
function startDistributionEditing(month: string) {
  isEditingDistributions = true
  currentEditingMonth = month
  
  // Update button text
  const editBtn = document.getElementById('edit-distributions-btn') as HTMLButtonElement
  if (editBtn) {
    editBtn.textContent = 'Finish Editing'
    editBtn.classList.add('editing')
  }
  
  // Convert distribution displays to input fields
  const budgetRows = document.querySelectorAll('.budget-row')
  budgetRows.forEach((row, index) => {
    const distributionCell = row.querySelector('.distribution') as HTMLElement
    if (distributionCell) {
      // Parse Danish kroner format: remove "kr.", periods (thousands separator), and convert comma to dot for decimal
      const currentValue = distributionCell.textContent?.replace(/[kr.\s]/g, '').replace(/\./g, '').replace(/,/g, '.') || '0'
      distributionCell.innerHTML = `<input type="number" class="distribution-input" value="${currentValue}" step="0.01" placeholder="Enter amount..." title="Edit distribution amount" />`
    }
  })
  
  // Add visual editing indicator to the budget overview
  const budgetOverviewEl = document.getElementById('budget-overview')
  if (budgetOverviewEl) {
    budgetOverviewEl.classList.add('editing-mode')
  }
  
  // Add a temporary editing notice
  const budgetTableContainer = document.querySelector('.budget-table-container')
  if (budgetTableContainer) {
    const editingNotice = document.createElement('div')
    editingNotice.className = 'editing-notice'
    editingNotice.innerHTML = `
      <div class="editing-notice-content">
        <span class="editing-icon">✏️</span>
        <span>Edit the distribution amounts and click "Finish Editing" to save changes</span>
      </div>
    `
    budgetTableContainer.insertBefore(editingNotice, budgetTableContainer.firstChild)
  }
  
  console.log(`Started editing distributions for ${month}`)
}

/**
 * Finish distribution editing mode and save changes
 */
async function finishDistributionEditing(month: string) {
  const budgetRows = document.querySelectorAll('.budget-row')
  const distributionChanges: { [categoryName: string]: { oldValue: number, newValue: number } } = {}
  
  // Collect all distribution changes
  budgetRows.forEach((row) => {
    const categoryName = row.querySelector('.category')?.textContent || ''
    const distributionInput = row.querySelector('.distribution-input') as HTMLInputElement
    
    if (distributionInput && categoryName) {
      const newValue = parseFloat(distributionInput.value) || 0
      const oldDistribution = getCategoryDistribution(categoryName, month)
      const oldValue = oldDistribution ? oldDistribution.allocation : 0
      
      if (oldValue !== newValue) {
        distributionChanges[categoryName] = { oldValue, newValue }
      }
    }
  })
  
  // Update distributions and balances
  for (const [categoryName, change] of Object.entries(distributionChanges)) {
    // Update distribution
    setCategoryDistribution(categoryName, month, change.newValue)
    
    // Update balance (add the difference to current balance)
    const balanceChange = change.newValue - change.oldValue
    const currentBalance = getCategoryBalance(categoryName, month)
    if (currentBalance) {
      const newBalance = currentBalance.balance + balanceChange
      setCategoryBalance(categoryName, month, newBalance)
      console.log(`Updated ${categoryName}: distribution ${change.oldValue} → ${change.newValue}, balance changed by ${balanceChange}`)
    }
  }
  
  // Save to files
  if (Object.keys(distributionChanges).length > 0) {
    await saveCategoryDistributions()
    await saveCategoryBalances()
    console.log(`Saved ${Object.keys(distributionChanges).length} distribution changes`)
  }
  
  // Exit editing mode
  isEditingDistributions = false
  currentEditingMonth = null
  
  // Update button text
  const editBtn = document.getElementById('edit-distributions-btn') as HTMLButtonElement
  if (editBtn) {
    editBtn.textContent = 'Edit Distributions'
    editBtn.classList.remove('editing')
  }
  
  // Remove visual editing indicators
  const budgetOverviewEl = document.getElementById('budget-overview')
  if (budgetOverviewEl) {
    budgetOverviewEl.classList.remove('editing-mode')
  }
  
  // Remove editing notice
  const editingNotice = document.querySelector('.editing-notice')
  if (editingNotice) {
    editingNotice.remove()
  }
  
  // Re-render the budget overview to show updated values
  renderBudgetOverview(month)
  
  console.log(`Finished editing distributions for ${month}`)
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
    await saveAllDataToFile()
    editingTransactionId = null
    updateDashboard()
    renderRecentTransactions()
    showSuccessMessage('Transaction updated successfully')
  } catch (error) {
    console.error('Failed to save transaction:', error)
    alert('Failed to save transaction. Please try again.')
  }
}