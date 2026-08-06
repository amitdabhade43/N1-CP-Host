import app from "./app.js";
import { logger } from "./lib/logger.js";

// --- Startup validation ---
const rawPort = process.env["PORT"];
if (!rawPort) {
  logger.error("PORT environment variable is required but was not provided.");
  process.exit(1);
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  logger.error({ rawPort }, "Invalid PORT value");
  process.exit(1);
}

const sessionSecret = process.env["SESSION_SECRET"];
if (!sessionSecret || sessionSecret.length < 32) {
  logger.error(
    "SESSION_SECRET must be set and at least 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
  process.exit(1);
}

const masterKey = process.env["MASTER_KEY"];
if (!masterKey || masterKey.length < 32) {
  logger.error(
    "MASTER_KEY must be set and at least 32 characters. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
  process.exit(1);
}

// --- Start server ---
app.listen(port, () => {
  logger.info({ port }, "NinjaOne Control Panel listening");
});
