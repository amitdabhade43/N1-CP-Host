// Session type augmentation for express-session
import type {} from "express-session";

declare module "express-session" {
  interface SessionData {
    username?: string;
    csrfToken?: string;
  }
}

export {};
