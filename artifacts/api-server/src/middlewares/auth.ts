import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.username) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
