// Database interface for Family Ledger
// Provides a unified interface that can use different storage backends

// For now, we use the JSON adapter which is compatible with Tauri v1
// Later, when upgrading to Tauri v2, we can easily switch to SQLite
export * from './json-adapter';

// When ready to switch to SQLite (Tauri v2), uncomment the line below and comment out the JSON adapter
// export * from './operations';

// Also export migrations for when we upgrade
export * from './migrations';