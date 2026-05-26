import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('/jspdf/') || id.includes('/html2canvas/')) {
            return 'export-pdf'
          }

          if (id.includes('/jszip/')) {
            return 'export-zip'
          }

          if (id.includes('/flexsearch/') || id.includes('/pinyin-pro/')) {
            return 'search'
          }

          return undefined
        },
      },
    },
  },
})
