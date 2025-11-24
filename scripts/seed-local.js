import { webcrypto } from 'node:crypto';
import { execSync } from 'node:child_process';

const crypto = webcrypto;

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    data,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashArray = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);

  return btoa(String.fromCharCode(...combined));
}

async function seed() {
  console.log('Seeding local database...');

  try {
    const password = await hashPassword('test');
    const id = crypto.randomUUID();

    const sql = `INSERT OR IGNORE INTO User (id, email, username, password, name) VALUES ('${id}', 'test@example.com', 'test', '${password}', 'Test User');`;

    // console.log('Executing SQL:', sql);

    execSync(`npx wrangler d1 execute money-hater-db --local --command "${sql}"`, { stdio: 'inherit' });

    console.log('Seed completed.');
  } catch (error) {
    console.error('Seed failed:', error);
    // Don't fail the build/start if seed fails (e.g. DB not initialized yet)
    // But maybe we should warn.
    // process.exit(1); 
  }
}

seed();
