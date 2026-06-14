import { eslintConfigScratch } from 'eslint-config-scratch'
import { globalIgnores } from 'eslint/config'
import globals from 'globals'

// Prototype lint profile. We keep eslint-config-scratch's recommended rules for real
// problems (unused vars, undefined refs, etc.) but relax the parts of the house style
// that don't fit an exploratory prototype:
//  - JSDoc is not required on every internal helper/component.
//  - Non-null assertions are allowed (common in tests and ref handling here).
//  - `new Function` is intentional: the runtime compiles generated code by design.
//  - A couple of newer React-Compiler / a11y rules are relaxed for the prototype UI.
export default eslintConfigScratch.defineConfig(
  eslintConfigScratch.recommended,
  {
    files: ['src/**', 'test/**'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-console': 'off',
      'jsdoc/require-jsdoc': 'off',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-implied-eval': 'off',
      '@typescript-eslint/prefer-regexp-exec': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'jsx-a11y/click-events-have-key-events': 'off',
      'jsx-a11y/interactive-supports-focus': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['*'], // config files in the package root
    languageOptions: {
      globals: globals.node,
    },
  },
  globalIgnores(['coverage/**', 'dist/**', 'node_modules/**', 'test-results/**']),
)
