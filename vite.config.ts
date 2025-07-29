import { defineConfig } from 'vite'

export default defineConfig(async () => ({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: [
        '**/src-tauri/**',
        '**/Google Drive/**',
        'src-tauri/**',
        'src-tauri/Google Drive/**',
        '**/transactions.json'
      ],
    },
  },
}))