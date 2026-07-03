import crypto from "crypto";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "troque-esta-senha";
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8h

const sessions = new Map<string, number>(); // token -> expiresAt

export function adminLogin(password: string): string | null {
  if (password !== ADMIN_PASSWORD) return null;
  const token = crypto.randomUUID();
  sessions.set(token, Date.now() + TOKEN_TTL_MS);
  return token;
}

export function validateAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}
