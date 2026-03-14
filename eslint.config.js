import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Global ignores
  {
    ignores: ['dist/**', 'scripts/**', '*.js', '*.cjs', '*.mjs'],
  },
  // TypeScript source files
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      // Downgrade some strict rules that are impractical for a Phaser game
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Prevent accidental console.error swallowing
      'no-empty': ['error', { allowEmptyCatch: false }],
    },
  },
)
