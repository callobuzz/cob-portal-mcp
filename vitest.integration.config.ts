import { defineConfig } from "vitest/config";

// Live tests against a real portal. They skip themselves unless COB_PORTAL_URL and COB_PORTAL_KEY are set.
export default defineConfig({
	test: {
		include: ["src/**/*.integration.test.ts"],
		testTimeout: 60_000,
		fileParallelism: false,
	},
});
