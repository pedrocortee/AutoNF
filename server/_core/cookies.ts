import type { Request } from "express";

export function getSessionCookieOptions(req: Request) {
  const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecure,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  };
}
