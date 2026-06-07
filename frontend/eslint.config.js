import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.browser
    },
    rules: {
      "no-undef": "off"
    }
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended
  },
  {
    files: ["*.config.{js,ts}", "eslint.config.js"],
    languageOptions: {
      globals: globals.node
    }
  }
);
