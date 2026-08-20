import type { Request, Response, NextFunction } from "express";

/**
 * Whether the request carries a valid admin bearer token.
 *
 * Fails closed: if `ADMIN_TOKEN` is not configured, no request is ever treated
 * as admin. Used both to gate writes (via `requireAdmin`) and to decide whether
 * unpublished draft content may be returned on read endpoints.
 */
export function isAdminRequest(req: Request): boolean {
  const configured = process.env.ADMIN_TOKEN;
  if (!configured) return false;

  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();

  return Boolean(token) && token === configured;
}

/**
 * Gate a route behind the admin bearer token.
 *
 * The token is read from the `ADMIN_TOKEN` env var. Requests must send
 * `Authorization: Bearer <ADMIN_TOKEN>`. If the env var is not configured the
 * route is denied (fail closed) so admin actions are never accidentally open.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!process.env.ADMIN_TOKEN) {
    req.log.error("ADMIN_TOKEN is not configured; denying admin request");
    res.status(401).json({ message: "Admin access is not configured." });
    return;
  }

  if (!isAdminRequest(req)) {
    res.status(401).json({ message: "Invalid or missing admin token." });
    return;
  }

  next();
}
