import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", "playwright-report/**", "test-results/**"]),
  {
    rules: {
      // Band/sponsor images are user-provided external URLs; next/image would require whitelisting every host.
      "@next/next/no-img-element": "off",
    },
  },
  {
    // The scoring engine must stay pure: no DB, no React, no Node I/O.
    files: ["src/modules/scoring-engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@/lib/*", "@/generated/*", "@/modules/!(scoring-engine)/**", "react", "next", "next/*", "node:*", "pg", "fs", "path"], message: "scoring-engine must remain pure (no I/O, no framework imports)." },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
