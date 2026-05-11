import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Two projects: jsdom for React components, node for worker code.
    projects: [
      {
        extends: true,
        test: {
          name: 'frontend',
          environment: 'jsdom',
          include: ['src/**/*.{test,spec}.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
          globals: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'worker',
          environment: 'node',
          include: ['worker/**/*.{test,spec}.ts'],
          globals: true,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        'src/test/**',
        'src/main.tsx',
        'src/App.tsx',
        'vite.config.ts',
        'vitest.config.ts',
      ],
    },
  },
});
