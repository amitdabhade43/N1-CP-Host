import { Router } from "express";
import type { IRouter } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { findAdminUser } from "../lib/vault.js";
import { auditLog } from "../lib/audit.js";

const router: IRouter = Router();

// GET /auth/session
router.get("/session", (req, res) => {
  if (req.session?.username) {
    res.json({
      authenticated: true,
      username: req.session.username,
      csrfToken: req.session.csrfToken,
    });
  } else {
    res.json({ authenticated: false });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const user = findAdminUser(username);
  if (!user) {
    await new Promise((r) => setTimeout(r, 200)); // constant-time-ish
    auditLog({ action: "login_failed", username, details: { reason: "user_not_found" } });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    auditLog({ action: "login_failed", username, details: { reason: "wrong_password" } });
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Regenerate session to prevent fixation
  req.session.regenerate((err) => {
    if (err) {
      res.status(500).json({ error: "Session error" });
      return;
    }
    const csrfToken = crypto.randomBytes(32).toString("hex");
    req.session.username = username;
    req.session.csrfToken = csrfToken;
    req.session.save((saveErr) => {
      if (saveErr) {
        res.status(500).json({ error: "Session save error" });
        return;
      }
      auditLog({ action: "login", username });
      res.json({ ok: true, username, csrfToken });
    });
  });
});

// POST /auth/logout
router.post("/logout", (req, res) => {
  const username = req.session?.username ?? "unknown";
  req.session.destroy(() => {
    auditLog({ action: "logout", username });
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

export default router;
