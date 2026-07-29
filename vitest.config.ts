import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/lib/server/rules-agent": fileURLToPath(
        new URL("./lib/server/rules-agent-runtime.ts", import.meta.url)
      ),
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./test/server-only.ts", import.meta.url)
      )
    }
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "components/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", ".next/**"]
  }
});
