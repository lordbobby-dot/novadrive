import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/** Salted scrypt rather than bcrypt/argon2 — no new dependency needed, `node:crypto` already
 * ships scrypt as a KDF suitable for this (a shared-link password is a low-stakes secret
 * compared to an account password; this isn't guarding Clerk-managed identity). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return (
    derivedKey.length === keyBuffer.length &&
    timingSafeEqual(derivedKey, keyBuffer)
  );
}
