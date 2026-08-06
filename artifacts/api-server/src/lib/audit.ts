import fs from "fs";
import path from "path";
import { DATA_DIR } from "./paths.js";

const LOG_FILE = path.join(DATA_DIR, "audit.log");

export interface AuditEntry {
  action: string;
  username: string;
  details?: Record<string, unknown>;
}

export function auditLog(entry: AuditEntry): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const line =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        username: entry.username,
        action: entry.action,
        ...(entry.details ?? {}),
      }) + "\n";
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch {
    // Audit failures must not crash the server
  }
}
