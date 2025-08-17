import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'client',           // 👈 your index.html is in /client
  plugins: [react()],
  build: {
    outDir: '../dist',       // 👈 build output to /dist
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500
  },
  server: {
    host: '0.0.0.0',       // Exposes the server to external devices (including WSL)
    port: 3000,             // Port to use
  }
})
