import { invoke } from '@tauri-apps/api/tauri'
import './style.css'

interface Transaction {
  id: string
  description: string
  amount: number
  transaction_type: 'income' | 'expense' | 'transfer'
  category: string
  account: string
  month: string
  date: string
}

let transactions: Transaction[] = []

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)
}

function showPage(pageId: string) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active')
  })
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active')
  })
  
  const page = document.getElementById(pageId)
  const navBtn = document.querySelector(`[data-page="${pageId}"]`)
  
  if (page) page.classList.add('active')
  if (navBtn) navBtn.classList.add('active')
}

function updateDashboard() {
  const totalBalance = transactions.reduce((sum, t) => {
    if (t.transaction_type === 'transfer') return sum
    return sum + (t.transaction_type === 'income' ? t.amount : -t.amount)
  }, 0)
  
  const monthlyIncome = transactions
    .filter(t => t.transaction_type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)
    
  const monthlyExpenses = transactions
    .filter(t => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  const balanceEl = document.querySelector('.summary-cards .card:nth-child(1) .amount')
  const incomeEl = document.querySelector('.summary-cards .card:nth-child(2) .amount')
  const expensesEl = document.querySelector('.summary-cards .card:nth-child(3) .amount')

  if (balanceEl) balanceEl.textContent = formatCurrency(totalBalance)
  if (incomeEl) incomeEl.textContent = formatCurrency(monthlyIncome)
  if (expensesEl) expensesEl.textContent = formatCurrency(monthlyExpenses)
}

function renderRecentTransactions() {
  const tableBodyEl = document.getElementById('transactions-table-body')
  if (!tableBodyEl) return

  // Show last 20 transactions
  const recentTransactions = transactions.slice(-20).reverse()
  
  tableBodyEl.innerHTML = recentTransactions.map(t => `
    <div class="transaction-row ${t.transaction_type}">
      <div class="month">${t.month}</div>
      <div class="description">${t.description}</div>
      <div class="amount">${formatCurrency(t.amount)}</div>
      <div class="category">${t.category}</div>
      <div class="account">${t.account}</div>
      <div class="type">${t.transaction_type}</div>
      <div class="date">${new Date(t.date).toLocaleDateString()}</div>
    </div>
  `).join('')
}

let formRowCounter = 0

function createFormRow(): string {
  const currentMonth = new Date()
  const monthValue = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`
  
  return `
    <div class="form-row" data-row="${formRowCounter++}">
      <input type="month" class="month-input" value="${monthValue}" />
      <input type="text" class="description-input" placeholder="Description" />
      <input type="number" class="amount-input" placeholder="Amount" step="0.01" />
      <select class="category-input">
        <option value="">Select Category</option>
        <option value="Food & Dining">Food & Dining</option>
        <option value="Transportation">Transportation</option>
        <option value="Utilities">Utilities</option>
        <option value="Entertainment">Entertainment</option>
        <option value="Healthcare">Healthcare</option>
        <option value="Salary">Salary</option>
        <option value="Freelance">Freelance</option>
        <option value="Investments">Investments</option>
        <option value="Other">Other</option>
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
  
  // Clear and reset the form immediately for better UX
  formRowsEl.innerHTML = ''
  addFormRow() // Add one empty row
  
  // Add visual highlight effect to new transactions
  setTimeout(() => {
    highlightNewTransactions(newTransactions.length)
  }, 100)
  
  try {
    await invoke('save_transactions', { transactions })
    
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


async function loadTransactions() {
  try {
    const loadedTransactions = await invoke('load_transactions') as Transaction[]
    transactions.splice(0, transactions.length, ...loadedTransactions)
    updateDashboard()
    renderRecentTransactions()
  } catch (error) {
    console.error('Failed to load transactions:', error)
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement
      const pageId = target.dataset.page
      if (pageId) showPage(pageId)
    })
  })

  // Add event listeners for new form functionality
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

  // Initialize with one empty form row
  addFormRow()

  await loadTransactions()
})