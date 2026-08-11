import { describe, it, expect } from 'vitest';
import {
  checkPasswordPolicy,
  generateJoinCode,
  generateTempPassword,
  hashPassword,
  tempPasswordExpiry,
  verifyPassword,
} from '../src/auth/password.js';

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('Correct horse battery', hash)).toBe(false);
  });

  it('produces a different hash each time', async () => {
    const [a, b] = await Promise.all([hashPassword('same'), hashPassword('same')]);
    expect(a).not.toBe(b);
  });
});

describe('generated credentials', () => {
  it('omits characters that get misread when typed from an email', () => {
    // No 0/O, 1/l/I or 5/S -- these get handed around at a field.
    const ambiguous = /[0O1lI5S]/;
    for (let i = 0; i < 200; i++) {
      expect(generateTempPassword().replace('-', '')).not.toMatch(ambiguous);
      expect(generateJoinCode()).not.toMatch(ambiguous);
    }
  });

  it('does not repeat itself across many draws', () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateJoinCode()));
    expect(codes.size).toBeGreaterThan(490);
  });

  it('expires temporary passwords a week out', () => {
    const now = new Date('2026-08-11T12:00:00Z');
    const expiry = tempPasswordExpiry(now);
    const days = (expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBeCloseTo(7, 1);
  });
});

describe('password policy', () => {
  it('accepts a long passphrase', () => {
    expect(checkPasswordPolicy('two fields one whistle').ok).toBe(true);
  });

  it('rejects something too short', () => {
    const result = checkPasswordPolicy('short');
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toContain('10 characters');
  });

  it('rejects padding that will be lost on copy-paste', () => {
    expect(checkPasswordPolicy('  padded password  ').ok).toBe(false);
  });
});
