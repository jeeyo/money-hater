import { webcrypto } from 'node:crypto';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const crypto = webcrypto;

// Hard guard: this script must never touch a remote database. We are the
// only thing standing between a fat-finger and prod.
const argString = process.argv.slice(2).join(' ');
if (argString.includes('--remote') || process.env.SEED_TARGET === 'remote') {
  console.error('Refusing to seed: this script is local-only.');
  process.exit(1);
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    data,
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );

  const hashArray = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);

  return btoa(String.fromCharCode(...combined));
}

async function seed() {
  console.log('Seeding local database...');

  let sqlPath;
  try {
    const password = await hashPassword('test1234!');
    const id = crypto.randomUUID();

    // Write the SQL to a temp file and execute via --file so values never get
    // pasted into a shell command line. The hash + uuid are still trusted
    // sources, but using a file removes the pattern entirely.
    const dir = mkdtempSync(join(tmpdir(), 'money-hater-seed-'));
    sqlPath = join(dir, 'seed.sql');
    const sql = `INSERT OR IGNORE INTO User (id, email, username, password, name) VALUES ('${id}', 'test@example.com', 'test', '${password.replace(/'/g, "''")}', 'Test User');\n`;
    writeFileSync(sqlPath, sql, 'utf8');

    execSync(`npx wrangler d1 execute money-hater-db --local --file ${JSON.stringify(sqlPath)}`, {
      stdio: 'inherit',
    });

    console.log('Seed completed. Login with username=test password=test1234!');
  } catch (error) {
    console.error('Seed failed:', error);
    // Don't fail the dev start if seed fails (e.g. DB not initialized yet).
  } finally {
    if (sqlPath) {
      try {
        unlinkSync(sqlPath);
      } catch {
        // ignore
      }
    }
  }
}

seed();
