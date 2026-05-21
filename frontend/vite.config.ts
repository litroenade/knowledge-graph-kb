import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';

const FRONTEND_DIR = dirname(fileURLToPath(import.meta.url));
const MAX_TCP_PORT = 65535;

function read_env(mode: string): Record<string, string> {
  return {
    ...loadEnv(mode, FRONTEND_DIR, ''),
    ...process.env
  };
}

function read_optional_port(value: string | undefined, name: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) {
    throw new Error(`${name} must be an integer TCP port.`);
  }
  return port;
}

export default defineConfig(({ mode }) => {
  const env = read_env(mode);
  const server_host = env.KB_FRONTEND_DEV_HOST;
  const server_port = read_optional_port(env.KB_FRONTEND_DEV_PORT, 'KB_FRONTEND_DEV_PORT');
  const api_proxy_target = env.KB_FRONTEND_API_PROXY_TARGET;

  return {
    plugins: [react()],
    server: {
      ...(server_host ? { host: server_host } : {}),
      ...(server_port ? { port: server_port } : {}),
      ...(api_proxy_target
        ? {
            proxy: {
              '/api': {
                target: api_proxy_target,
                changeOrigin: true
              }
            }
          }
        : {})
    },
    build: {
      sourcemap: true
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/setup_tests.ts'
    }
  };
});
