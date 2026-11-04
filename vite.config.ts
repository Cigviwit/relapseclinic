import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// `vite preview` serves the same security headers as production, so a page that breaks under them fails locally too.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] };
const headers = Object.fromEntries(vercel.headers[0].headers.map(h => [h.key, h.value]));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  preview: { headers },
  build: { sourcemap: true },
});
