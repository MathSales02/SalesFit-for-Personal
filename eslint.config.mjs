import next from "eslint-config-next";
import nextTs from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", ".next-e2e/**", "test-results/**", "playwright-report/**", "node_modules/**", ".agents/**", "drizzle/**", "next-env.d.ts"] },
  ...next,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];

export default config;
