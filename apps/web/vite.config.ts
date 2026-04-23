import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
      '@opc/core': path.resolve(rootDir, '../../packages/core/src'),
      '@opc/ui': path.resolve(rootDir, '../../packages/ui/src'),
      '@opc/design-tokens': path.resolve(rootDir, '../../packages/design-tokens'),
    },
  },
})
