import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages, Vercel, Netlify or any sub-path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
