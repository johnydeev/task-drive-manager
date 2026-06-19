import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Service worker generado por serwist — no es código fuente, no lintear.
    "public/sw.js",
    "public/swe-worker-*.js",
  ]),
  {
    // La regla del React Compiler (Next 16) marca como ERROR patrones que en
    // realidad son correctos y comunes: el guard `mounted` para SSR-safety y
    // sincronizar datos de TanStack Query al estado local de un form.
    // La bajamos a warning para no romper el CI por falsos positivos.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
