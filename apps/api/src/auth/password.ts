import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Characters chosen to survive being read aloud, retyped from an email, or
 * written on a sticky note at a field: no 0/O, 1/l/I, or 5/S.
 */
const UNAMBIGUOUS = 'ABCDEFGHJKMNPQRTUVWXYZ2346789';

function randomString(length: number, alphabet: string): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

/**
 * Temporary password an admin reads out or pastes into an email reply.
 * Single-use by policy: it forces a change on first login and expires.
 */
export function generateTempPassword(): string {
  return `${randomString(4, UNAMBIGUOUS)}-${randomString(4, UNAMBIGUOUS)}`;
}

/** Team join code a coach shares so teammates register onto the right team. */
export function generateJoinCode(): string {
  return randomString(6, UNAMBIGUOUS);
}

export const TEMP_PASSWORD_TTL_DAYS = 7;

export function tempPasswordExpiry(now: Date = new Date()): Date {
  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + TEMP_PASSWORD_TTL_DAYS);
  return expiry;
}

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

/**
 * Length over composition rules. Forcing symbols and digits pushes people
 * toward "Password1!" and a sticky note; length is what actually helps.
 */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const problems: string[] = [];
  if (password.length < 10) problems.push('Use at least 10 characters.');
  if (password.length > 200) problems.push('Use fewer than 200 characters.');
  if (/^\s|\s$/.test(password)) problems.push('Remove leading or trailing spaces.');
  return { ok: problems.length === 0, problems };
}
