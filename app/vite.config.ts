import { defineConfig, loadEnv } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createLocalAiMiddleware } from './server/local-ai.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'LOREMASTER_');
  const host = env.LOREMASTER_HOST || '127.0.0.1';
  const localAi = createLocalAiMiddleware({
    baseUrl: env.LOREMASTER_LM_STUDIO_URL || 'http://127.0.0.1:1234/v1',
    model: env.LOREMASTER_LM_STUDIO_MODEL || '',
    statusTimeoutMs: Number(env.LOREMASTER_LM_STUDIO_STATUS_TIMEOUT_MS) || 2200,
    requestTimeoutMs: Number(env.LOREMASTER_LM_STUDIO_TIMEOUT_MS) || 90000
  });
  const apiPlugin:Plugin = {
    name: 'loremaster-local-ai-api',
    configureServer(server) { server.middlewares.use(localAi); },
    configurePreviewServer(server) { server.middlewares.use(localAi); }
  };
  return {
    plugins: [react(), apiPlugin],
    server: { host },
    preview: { host }
  };
});
