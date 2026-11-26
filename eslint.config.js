// Flat ESLint config for the whole monorepo.
import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/next-env.d.ts",
      "apps/api/src/generated/**",
      "apps/web/public/maplibre/**",
      "docs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [...nextVitals],
    settings: { next: { rootDir: "apps/web" } },
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // CLI scripts and the seed stub print to stdout on purpose.
    files: ["scripts/**", "apps/api/scripts/**", "apps/api/prisma/seed.ts"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.test.ts", "apps/api/test/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  prettier,
);
