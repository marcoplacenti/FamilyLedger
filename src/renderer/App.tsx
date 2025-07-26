import React, { useState, useEffect } from 'react';
import './App.css';

// Type definitions (matching database types)
interface Account {
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

interface Category {
  id?: number;
  name: string;
  type: 'income' | 'expense' | 'transfer';
  parent_id?: number;
  color: string;
  created_at?: string;
}

interface Transaction {
  id?: number;
  account_id: number;
  category_id?: number;
  amount: number;
  description: string;
  transaction_date: string;
  type: 'income' | 'expense' | 'transfer';
  transfer_account_id?: number;
  notes?: string;
  is_reconciled: boolean;
  created_at?: string;
  updated_at?: string;
}

// Account form component
const AccountForm: React.FC<{ onAccountCreated: () => void }> = ({ onAccountCreated }) => {
  const [formData, setFormData] = useState({
    name: '',
    type: 'checking' as Account['type'],
    institution: '',
    account_number: '',
    initial_balance: 0,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await window.electronAPI.createAccount({
        ...formData,
        current_balance: formData.initial_balance,
        is_active: true,
      });
      
      setFormData({
        name: '',
        type: 'checking',
        institution: '',
        account_number: '',
        initial_balance: 0,
      });
      
      onAccountCreated();
    } catch (error) {
      console.error('Error creating account:', error);
      alert('Error creating account');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="form-container">
      <h3>Add New Account</h3>
      <div className="form-group">
        <label>Account Name:</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>
      
      <div className="form-group">
        <label>Account Type:</label>
        <select
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value as Account['type'] })}
        >
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
          <option value="credit_card">Credit Card</option>
          <option value="investment">Investment</option>
          <option value="mortgage">Mortgage</option>
          <option value="loan">Loan</option>
        </select>
      </div>
      
      <div className="form-group">
        <label>Institution:</label>
        <input
          type="text"
          value={formData.institution}
          onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
        />
      </div>
      
      <div className="form-group">
        <label>Account Number:</label>
        <input
          type="text"
          value={formData.account_number}
          onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
        />
      </div>
      
      <div className="form-group">
        <label>Initial Balance:</label>
        <input
          type="number"
          step="0.01"
          value={formData.initial_balance}
          onChange={(e) => setFormData({ ...formData, initial_balance: parseFloat(e.target.value) || 0 })}
        />
      </div>
      
      <button type="submit">Add Account</button>
    </form>
  );
};

// Transaction form component
const TransactionForm: React.FC<{ 
  accounts: Account[], 
  categories: Category[], 
  onTransactionCreated: () => void 
}> = ({ accounts, categories, onTransactionCreated }) => {
  const [formData, setFormData] = useState({
    account_id: 0,
    category_id: 0,
    amount: 0,
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
    type: 'expense' as Transaction['type'],
    transfer_account_id: 0,
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await window.electronAPI.createTransaction({
        ...formData,
        category_id: formData.category_id || undefined,
        transfer_account_id: formData.type === 'transfer' ? formData.transfer_account_id : undefined,
        is_reconciled: false,
      });
      
      setFormData({
        account_id: 0,
        category_id: 0,
        amount: 0,
        description: '',
        transaction_date: new Date().toISOString().split('T')[0],
        type: 'expense',
        transfer_account_id: 0,
        notes: '',
      });
      
      onTransactionCreated();
    } catch (error) {
      console.error('Error creating transaction:', error);
      alert('Error creating transaction');
    }
  };

  const filteredCategories = categories.filter(cat => cat.type === formData.type);

  return (
    <form onSubmit={handleSubmit} className="form-container">
      <h3>Add New Transaction</h3>
      
      <div className="form-group">
        <label>Account:</label>
        <select
          value={formData.account_id}
          onChange={(e) => setFormData({ ...formData, account_id: parseInt(e.target.value) })}
          required
        >
          <option value={0}>Select Account</option>
          {accounts.map(account => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.type})
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Type:</label>
        <select
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value as Transaction['type'], category_id: 0 })}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="transfer">Transfer</option>
        </select>
      </div>

      <div className="form-group">
        <label>Category:</label>
        <select
          value={formData.category_id}
          onChange={(e) => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
        >
          <option value={0}>Select Category</option>
          {filteredCategories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      {formData.type === 'transfer' && (
        <div className="form-group">
          <label>Transfer To:</label>
          <select
            value={formData.transfer_account_id}
            onChange={(e) => setFormData({ ...formData, transfer_account_id: parseInt(e.target.value) })}
            required
          >
            <option value={0}>Select Account</option>
            {accounts.filter(acc => acc.id !== formData.account_id).map(account => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.type})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-group">
        <label>Amount:</label>
        <input
          type="number"
          step="0.01"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
          required
        />
      </div>

      <div className="form-group">
        <label>Description:</label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          required
        />
      </div>

      <div className="form-group">
        <label>Date:</label>
        <input
          type="date"
          value={formData.transaction_date}
          onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
          required
        />
      </div>

      <div className="form-group">
        <label>Notes:</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>

      <button type="submit">Add Transaction</button>
    </form>
  );
};

// Main App component
const App: React.FC = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'accounts' | 'transactions' | 'add-account' | 'add-transaction'>('accounts');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [accountsData, categoriesData, transactionsData] = await Promise.all([
        window.electronAPI.getAccounts(),
        window.electronAPI.getCategories(),
        window.electronAPI.getTransactions(50, 0)
      ]);
      
      setAccounts(accountsData);
      setCategories(categoriesData);
      setTransactions(transactionsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Family Finance Tracker</h1>
        <nav className="nav-tabs">
          <button 
            className={activeTab === 'accounts' ? 'active' : ''}
            onClick={() => setActiveTab('accounts')}
          >
            Accounts
          </button>
          <button 
            className={activeTab === 'transactions' ? 'active' : ''}
            onClick={() => setActiveTab('transactions')}
          >
            Transactions
          </button>
          <button 
            className={activeTab === 'add-account' ? 'active' : ''}
            onClick={() => setActiveTab('add-account')}
          >
            Add Account
          </button>
          <button 
            className={activeTab === 'add-transaction' ? 'active' : ''}
            onClick={() => setActiveTab('add-transaction')}
          >
            Add Transaction
          </button>
        </nav>
      </header>

      <main className="main-content">
        {activeTab === 'accounts' && (
          <div className="accounts-view">
            <h2>Your Accounts</h2>
            <div className="accounts-grid">
              {accounts.map(account => (
                <div key={account.id} className="account-card">
                  <h3>{account.name}</h3>
                  <p className="account-type">{account.type.replace('_', ' ').toUpperCase()}</p>
                  {account.institution && <p className="institution">{account.institution}</p>}
                  <p className="balance">
                    Balance: <span className={account.current_balance >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(account.current_balance)}
                    </span>
                  </p>
                  {account.account_number && (
                    <p className="account-number">***{account.account_number.slice(-4)}</p>
                  )}
                </div>
              ))}
            </div>
            
            <div className="summary">
              <h3>Summary</h3>
              <p>Total Accounts: {accounts.length}</p>
              <p>Net Worth: {formatCurrency(accounts.reduce((sum, acc) => sum + acc.current_balance, 0))}</p>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="transactions-view">
            <h2>Recent Transactions</h2>
            <div className="transactions-table">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Account</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(transaction => (
                    <tr key={transaction.id}>
                      <td>{formatDate(transaction.transaction_date)}</td>
                      <td>{transaction.description}</td>
                      <td>{accounts.find(acc => acc.id === transaction.account_id)?.name || 'Unknown'}</td>
                      <td>{categories.find(cat => cat.id === transaction.category_id)?.name || '-'}</td>
                      <td className={transaction.type === 'income' ? 'positive' : 'negative'}>
                        {transaction.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(transaction.amount))}
                      </td>
                      <td className={`type-${transaction.type}`}>{transaction.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {transactions.length === 0 && (
                <p className="no-data">No transactions found. Add your first transaction!</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'add-account' && (
          <AccountForm onAccountCreated={() => {
            loadData();
            setActiveTab('accounts');
          }} />
        )}

        {activeTab === 'add-transaction' && (
          <TransactionForm 
            accounts={accounts}
            categories={categories}
            onTransactionCreated={() => {
              loadData();
              setActiveTab('transactions');
            }}
          />
        )}
      </main>
    </div>
  );
};

export default App;