import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Vercel sets VERCEL_ENV ('production' | 'preview' | 'development') at build time. The new-version prompt runs
  // only in 'production' builds (contexts/AppVersionContext.tsx).
  define: { __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? 'development') },
});
