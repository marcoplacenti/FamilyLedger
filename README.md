# Family Ledger - Personal Finance Management Application

A modern desktop application built with Tauri for managing personal finances with both local and cloud storage options.

## 🏗️ Architecture Overview

### Technology Stack
- **Frontend**: TypeScript, HTML5, CSS3
- **Desktop Framework**: Tauri (Rust backend, web frontend)
- **Cloud Storage**: Google Drive API with OAuth 2.0
- **Local Storage**: Native file system via Tauri APIs
- **Build Tool**: Vite

### Core Features
- ✅ **Transaction Management**: Income, expenses, and transfers
- ✅ **Category-Based Budgeting**: Dynamic category creation and management
- ✅ **Dual Storage Options**: Local files or Google Drive cloud sync
- ✅ **Hybrid Architecture**: Local caching with cloud synchronization
- ✅ **Budget Tracking**: Monthly budget allocation and salary distribution
- ✅ **Responsive Design**: Works on desktop and mobile screen sizes
- ✅ **Offline Support**: Continues working without internet connection

## 🏛️ Application Architecture

### Storage Architecture
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Local Cache   │◄──►│  Application     │◄──►│  Google Drive   │
│   (Fast Access) │    │  Logic           │    │  (Cloud Sync)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Data Flow
1. **User Input** → Form validation → Memory storage
2. **Memory** → Local cache (instant) + Cloud sync (background)
3. **Startup** → Load from local cache → Sync with cloud if available
4. **Offline** → Continue with local cache → Sync when online

### File Structure
```
src/
├── main.ts          # Main application logic and state management
├── style.css        # All application styling and responsive design
└── index.html       # HTML structure and modal definitions

src-tauri/
├── tauri.conf.json  # Tauri configuration and permissions
├── Cargo.toml       # Rust dependencies and features
└── src/main.rs      # Rust backend (minimal, mostly default)
```

## 💾 Data Storage

### Local Storage
- **Location**: User-selected directory + `/FamilyLedger/`
- **Configuration**: `~/.familyledger/config.json`
- **Data Files**: 
  - `transactions.json` - All transaction data
  - `categories.json` - Category definitions

### Google Drive Storage
- **Authentication**: OAuth 2.0 with Google Identity Services
- **Folder Structure**: User-selected folder + `/FamilyLedger/`
- **Sync Strategy**: Hybrid with local caching
- **Offline Handling**: Graceful degradation with sync-on-reconnect

## 🔧 Configuration

### Environment Variables (.env)
```env
VITE_GOOGLE_CLIENT_ID=your-oauth-client-id
VITE_GOOGLE_API_KEY=your-google-api-key
```

### Google Cloud Console Setup
1. Create project in Google Cloud Console
2. Enable Google Drive API
3. Create OAuth 2.0 credentials (Web application type)
4. Add authorized origins: `http://localhost:1420`

## 🧩 Key Components

### Transaction Management
- **Form System**: Dynamic form rows with validation
- **CRUD Operations**: Create, edit, delete transactions
- **Type System**: Income (green), Expense (red), Transfer (blue)
- **Validation**: Numeric inputs with 2 decimal places max

### Category System
- **Dynamic Categories**: User-created categories with enable/disable
- **Budget Integration**: Each category has initial budget allocation
- **Availability Dates**: Categories can be enabled from specific months

### Budget Management
- **Monthly View**: Select month to view budget breakdown
- **Salary Distribution**: Automatic distribution of salary across categories
- **Balance Calculation**: Initial + Distribution - Expenses = Current Balance

### Sync System
- **Status Indicators**: Real-time sync status in UI
- **Manual Sync**: User-triggered synchronization button
- **Conflict Resolution**: Last-write-wins with local backup
- **Network Detection**: Online/offline awareness

## 🔐 Security Features

### Tauri Security
- **Allowlist System**: Only necessary APIs are enabled
- **Scope Restrictions**: File system access limited to specific paths
- **No Remote Code**: All code is bundled and signed

### Google API Security
- **OAuth 2.0**: Industry-standard authentication
- **Scope Limitation**: Only Google Drive file access
- **Token Management**: Secure token storage and refresh

### File System Security
- **Path Validation**: All file operations use validated paths
- **Permission Checks**: Proper error handling for access issues
- **User Control**: User explicitly chooses data storage location

## 🚀 Development Setup

### Prerequisites
- Node.js 18+
- Rust and Cargo
- Tauri CLI

### Installation
```bash
npm install
npm install -g @tauri-apps/cli
```

### Development
```bash
npm run tauri dev  # Starts development server
```

### Building
```bash
npm run tauri build  # Creates production binary
```

## 📱 User Interface

### Navigation
- **Single Page Application**: Tab-based navigation
- **Responsive Layout**: Mobile-first design principles
- **Accessibility**: Keyboard navigation and screen reader support

### Pages
1. **Dashboard**: Summary cards with total balance, income, expenses
2. **Budgets**: Monthly budget allocation and tracking
3. **Transactions**: Form for adding new transactions + recent history
4. **Categories**: Dynamic category management interface
5. **Reports**: Future expansion for charts and analytics

### Modals
- **First Launch**: Storage location selection (local vs. Google Drive)
- **Google Drive Setup**: OAuth flow and folder selection

## 🔄 State Management

### Global State Variables
```typescript
let transactions: Transaction[]        // All transaction data
let categories: Category[]            // Category definitions
let dataStoragePath: string | null    // Storage location
let storageType: 'local' | 'googledrive' // Storage backend
let googleDriveAuth: any             // OAuth tokens
let isOnline: boolean                // Network status
```

### Event-Driven Updates
- Form submissions → Update memory → Save to storage → Refresh UI
- Storage type changes → Update configuration → Switch backends
- Network changes → Update sync status → Trigger sync if needed

## 🧪 Code Documentation

### Main Components (main.ts)
The application is organized into these key sections:

1. **Global State & Interfaces** (lines 1-80)
   - Data structures for transactions and categories
   - Application-wide state variables
   - Utility functions for ID generation and formatting

2. **UI Management** (lines 81-180)
   - Page navigation system
   - Dashboard calculations and updates
   - Transaction rendering and display

3. **Form Management** (lines 181-400)
   - Dynamic form creation and validation
   - Transaction input handling
   - Category selection logic

4. **Event Listeners** (lines 401-600)
   - Comprehensive event handling setup
   - Button clicks, form submissions, input validation
   - Storage type switching

5. **Application Initialization** (lines 601-720)
   - Startup sequence and first-launch detection
   - Configuration loading and app setup
   - Network status monitoring

6. **Storage & Configuration** (lines 721-900)
   - Local file operations
   - Configuration management
   - Data persistence logic

7. **Google Drive Integration** (lines 901-1200)
   - OAuth 2.0 authentication flow
   - Google Drive API operations
   - Hybrid sync implementation

8. **Budget & Category Management** (lines 1201-1500)
   - Category CRUD operations
   - Budget calculations and distributions
   - Monthly budget overview

9. **Transaction Operations** (lines 1501-end)
   - Transaction editing and updates
   - Data validation and persistence
   - UI synchronization

## 📈 Future Enhancements

### Planned Features
- **Charts & Analytics**: Visual spending analysis
- **Import/Export**: CSV and other format support
- **Multi-Currency**: Support for different currencies
- **Backup System**: Automated backup scheduling
- **Mobile App**: Companion mobile application

### Technical Improvements
- **Database Migration**: Move from JSON to SQLite
- **Performance**: Lazy loading for large datasets
- **Testing**: Comprehensive test suite
- **CI/CD**: Automated build and deployment

---

This documentation provides a comprehensive overview of the Family Ledger application architecture, helping you understand the codebase structure and implementation decisions.