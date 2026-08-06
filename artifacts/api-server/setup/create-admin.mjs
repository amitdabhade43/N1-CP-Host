#!/usr/bin/env node
/**
 * NinjaOne Control Panel — Admin setup script
 *
 * Run from the repo root:
 *   node artifacts/api-server/setup/create-admin.mjs
 *
 * Or from the artifact directory:
 *   node setup/create-admin.mjs
 *
 * Requires MASTER_KEY environment variable (used to locate/create data/ dir).
 * Does NOT require MASTER_KEY for the admin account itself — passwords are
 * hashed with bcrypt and stored in data/admin-users.json independently.
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// Resolve data/ directory relative to this script
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../data");
const ADMIN_FILE = resolve(DATA_DIR, "admin-users.json");

// Load bcryptjs from the package's node_modules
const require = createRequire(import.meta.url);
let bcrypt;
try {
  bcrypt = require("bcryptjs");
} catch {
  console.error("Error: bcryptjs not found. Run `pnpm install` in artifacts/api-server first.");
  process.exit(1);
}

function loadStore() {
  if (!existsSync(ADMIN_FILE)) return { users: [] };
  return JSON.parse(readFileSync(ADMIN_FILE, "utf8"));
}

function saveStore(store) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(ADMIN_FILE, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
}

async function main() {
  const rl = createInterface({ input, output });

  console.log("\nNinjaOne Control Panel — Admin Account Setup");
  console.log("============================================\n");

  const store = loadStore();

  if (store.users.length > 0) {
    console.log("Existing admin users:", store.users.map((u) => u.username).join(", "));
    const overwrite = await rl.question("\nAdd another admin user? [y/N] ");
    if (!overwrite.trim().toLowerCase().startsWith("y")) {
      rl.close();
      console.log("Cancelled.");
      return;
    }
  }

  const username = (await rl.question("Username: ")).trim();
  if (!username) {
    console.error("Username cannot be empty.");
    rl.close();
    process.exit(1);
  }

  if (store.users.some((u) => u.username === username)) {
    const replace = await rl.question(`User "${username}" already exists. Replace password? [y/N] `);
    if (!replace.trim().toLowerCase().startsWith("y")) {
      rl.close();
      console.log("Cancelled.");
      return;
    }
    store.users = store.users.filter((u) => u.username !== username);
  }

  const password = await rl.question("Password (hidden): ");
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    rl.close();
    process.exit(1);
  }

  const confirm = await rl.question("Confirm password: ");
  if (password !== confirm) {
    console.error("Passwords do not match.");
    rl.close();
    process.exit(1);
  }

  rl.close();

  console.log("\nHashing password…");
  const hash = await bcrypt.hash(password, 12);
  store.users.push({ username, passwordHash: hash });
  saveStore(store);

  console.log(`\n✓ Admin user "${username}" created successfully.`);
  console.log(`  Stored in: ${ADMIN_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
