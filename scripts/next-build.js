/* eslint-disable no-console */
const { spawnSync } = require("node:child_process");

/**
 * Next 16+ may run builds with Turbopack on some setups.
 * On Windows this can panic due to junction-point collisions (os error 80).
 *
 * This wrapper forces the webpack-based build by disabling Turbopack via env.
 */
const env = {
  ...process.env,
  // Keep bundler selection explicit via CLI flag below.
};

let nextBin;
try {
  nextBin = require.resolve("next/dist/bin/next");
} catch (err) {
  console.error("Unable to resolve Next.js binary.");
  console.error(err);
  process.exit(1);
}

const result = spawnSync(process.execPath, [nextBin, "build", "--webpack"], {
  stdio: "inherit",
  env,
});

if (result.error) {
  console.error(result.error);
}
process.exit(result.status ?? 1);

