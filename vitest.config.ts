import { defineConfig } from "vitest/config";

// Les tests vivent hors de web/ (root de Vite) : on lance vitest depuis la racine.
export default defineConfig({
  root: ".",
  test: { include: ["server/**/*.test.ts", "shared/**/*.test.ts", "web/src/**/*.test.ts", "scripts/**/*.test.ts"] },
});
