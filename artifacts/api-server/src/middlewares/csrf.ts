import type { Request, Response, NextFunction } from "express";

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const tokenHeader = req.headers["x-csrf-token"];
  const sessionToken = req.session?.csrfToken;

  if (!tokenHeader || !sessionToken || tokenHeader !== sessionToken) {
    res.status(403).json({ error: "Invalid or missing CSRF token" });
    return;
  }
  next();
}
