import { defineConfig } from 'vite';

// Empacota o servidor autoritativo (src/server) num módulo ES único que as
// Edge Functions do Supabase (Deno) importam: supabase/functions/_shared/.
export default defineConfig({
  publicDir: false,
  build: {
    lib: { entry: 'src/server/index.ts', formats: ['es'], fileName: () => 'kaelora-server.js' },
    outDir: 'supabase/functions/_shared',
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
    sourcemap: false,
    copyPublicDir: false,
  },
});
