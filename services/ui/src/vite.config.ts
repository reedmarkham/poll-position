import { defineConfig } from 'vite';

// Optional: include aliases or plugins if needed
export default defineConfig({
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
  },
  define: {
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(process.env.VITE_API_BASE_URL)
  }
});
