import "./types.js";
import express from "express";
import type { Express } from "express";
import path from "path";
import { fileURLToPath } from "url";
import session from "express-session";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger.js";
import { PUBLIC_DIR } from "./lib/paths.js";
import apiRouter from "./routes/index.js";
import authRouter from "./routes/auth.js";

const app: Express = express();

// Trust proxy (Replit sits behind one)
app.set("trust proxy", 1);

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);

// Request logging
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
const sessionSecret = process.env["SESSION_SECRET"]!;
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
    },
  }),
);

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, please try again later." },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests." },
});

// Health endpoint (no auth required)
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Auth routes (rate-limit login specifically)
app.use("/auth/login", loginLimiter);
app.use("/auth", authRouter);

// API routes (rate-limited, auth enforced per route)
app.use("/api", apiLimiter, apiRouter);

// Static files (login.html, index.html, style.css)
app.use(express.static(PUBLIC_DIR));

// Root redirect → login
app.get("/", (_req, res) => {
  res.redirect("/login.html");
});

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
