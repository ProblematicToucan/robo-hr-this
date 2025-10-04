import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./tests/setup.ts'],
        include: ['tests/**/*.{test,spec}.{js,ts}'],
        exclude: ['node_modules', 'dist', '.git'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                'tests/',
                '**/*.d.ts',
                'src/index.ts',
                'src/db/migrations/**',
                'src/ground/**'
            ]
        }
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src')
        }
    }
});
