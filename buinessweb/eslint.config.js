import pluginVue from 'eslint-plugin-vue';
import eslintConfigPrettier from '@vue/eslint-config-prettier/skip-formatting';
import eslintConfigTypescript from '@vue/eslint-config-typescript';
import cypressPlugin from 'eslint-plugin-cypress';
import pluginOxlint from 'eslint-plugin-oxlint';

export default [
  {
    ignores: [
      'dist',
      'dist-ssr',
      'coverage',
      '*.local',
      'cypress/videos/',
      'cypress/screenshots/',
      'src/assets/symbol-font/*',
      '.eslintcache',
      '.trae',
      'docs',
    ]
  },
  ...pluginVue.configs['flat/essential'],
  ...eslintConfigTypescript(),
  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
  eslintConfigPrettier,
  {
    files: ['cypress/e2e/**/*.{cy,spec}.{js,ts,jsx,tsx}'],
    ...cypressPlugin.configs.recommended
  },
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  }
];
