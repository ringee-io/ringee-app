import globals from "globals";
import js from "@eslint/js";
import tsEslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
// import prettierPlugin from "eslint-plugin-prettier";

export default tsEslint.config(
  {
    ignores: [
      "node_modules",
      "!.*",
      "**/dist",
      "**/build",
      "apps/frontend/.next",
      "apps/frontend/next-env.d.ts",
    ],
  },

  {
    extends: [js.configs.recommended, ...tsEslint.configs.recommended],
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: { globals: globals.node },
  },

  {
    files: [
      "apps/{frontend}/**/*.{jsx,tsx}",
      "packages/{components}/**/*.{jsx,tsx}",
    ],
    languageOptions: { globals: globals.browser },
    extends: [pluginReact.configs.flat.recommended],
    settings: {
      react: {
        version: "detect",
      },
    },
  },

  eslintPluginPrettierRecommended,
  // prettierPlugin.config.recommended,
);
