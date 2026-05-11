import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Click-only handlers on non-interactive elements are widely used in
      // this codebase as cards/list items. We have keyboard-focusable buttons
      // for the primary actions; downgrade rather than rewrite every list.
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      // ExpenseForm and BudgetForm have many label elements without
      // htmlFor/id pairs. Phase 3.3 of the improvement plan replaces those
      // forms wholesale with react-hook-form + zod, where labels will be
      // associated correctly. Until then, surface as warning.
      'jsx-a11y/label-has-associated-control': 'warn',
      // Allow `_foo` to mark intentionally-discarded names (rest spread,
      // catch params we don't read, etc).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);
