import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The Automation Studio project has thousands of files the website never uses.
    watch: { ignored: ['**/plc/**', '**/docs/**'] },
  },
});
