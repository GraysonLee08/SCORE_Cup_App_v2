/**
 * Create an admin account from the server, not from the app.
 *
 * Admin is the one role the web interface will not grant. An admin can rebuild
 * the schedule and clear results, so the set of people holding it should be
 * small and chosen deliberately -- not something an admin can widen on a whim
 * or by mistake. Keeping it here means gaining it requires access to the
 * machine, which is a meaningful gate rather than a checkbox.
 *
 * Prints a one-time password once. The account must change it at first login,
 * and the temporary one expires after a week, so it is worth running this
 * close to when the person will actually sign in.
 *
 *   npm run create-admin --workspace @scores-cup/api -- "them@example.org" "Their Name"
 *
 * Re-running for an existing address issues a fresh temporary password rather
 * than failing, which is also how you recover an admin who is locked out.
 */

import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
import { hashPassword, generateTempPassword, tempPasswordExpiry, TEMP_PASSWORD_TTL_DAYS } from '../auth/password.js';

const [email, displayName] = process.argv.slice(2);

if (!email || !displayName) {
  console.error('Usage: create-admin <email> <display name>');
  process.exit(2);
}

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`"${email}" does not look like an email address.`);
  process.exit(2);
}

const config = loadConfig();
const db = createPool(config.DATABASE_URL);

try {
  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);

  const { rows } = await db.query<{ id: string; created: boolean }>(
    `INSERT INTO users (email, password_hash, role, display_name,
                        must_change_password, temp_password_expires_at)
     VALUES ($1, $2, 'admin', $3, TRUE, $4)
     ON CONFLICT (lower(email)) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'admin',
           disabled = FALSE,
           must_change_password = TRUE,
           temp_password_expires_at = EXCLUDED.temp_password_expires_at
     RETURNING id, (xmax = 0) AS created`,
    [email, hash, displayName, tempPasswordExpiry()],
  );

  const row = rows[0]!;
  console.log('');
  console.log(row.created ? 'Admin created.' : 'Existing account promoted to admin and reset.');
  console.log(`  Name      ${displayName}`);
  console.log(`  Email     ${email}`);
  console.log(`  Password  ${tempPassword}`);
  console.log('');
  console.log(`Shown once. They must change it at first sign-in, and it stops`);
  console.log(`working after ${TEMP_PASSWORD_TTL_DAYS} days.`);
  console.log('');
} finally {
  await db.end();
}
