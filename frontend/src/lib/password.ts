import { compare, hash } from 'bcryptjs';

const ROUNDS = 10;

export function isPasswordHash(value: string | null | undefined): boolean {
  return !!value && (value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$'));
}

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, ROUNDS);
}

/** Supports bcrypt hashes and legacy plaintext (upgrades on next change/login). */
export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  if (isPasswordHash(stored)) {
    return compare(plain, stored);
  }
  return plain === stored;
}

export function generateTempPassword(length = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join('');
}
