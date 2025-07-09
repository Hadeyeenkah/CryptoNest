// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500, // increases warning limit to 1.5MB
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5173'
    }
  }
})
