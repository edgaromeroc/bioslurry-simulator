import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANTE: Cambia 'bioslurry-simulator' por el nombre exacto de tu repositorio en GitHub
  base: '/bioslurry-simulator/',
})
