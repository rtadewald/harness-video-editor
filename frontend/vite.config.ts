import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  // portas do dev.sh (o `.dev.env` de uma segunda cópia do projeto muda as duas)
  server: {
    port: Number(process.env.HARNESS_FRONT_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.HARNESS_API_PORT ?? 8000}` },
  },
})
