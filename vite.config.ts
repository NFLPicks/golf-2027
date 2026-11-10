import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from GitHub Pages at https://nflpicks.github.io/golf-2027/
export default defineConfig({
  base: '/golf-2027/',
  plugins: [react()],
});
