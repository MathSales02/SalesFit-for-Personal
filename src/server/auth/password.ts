import "server-only";
import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id (the library default algorithm) with the OWASP Password Storage
 * Cheat Sheet baseline: 19 MiB memory, 2 iterations, parallelism 1.
 * Raise these when hardware allows; old hashes are upgraded at next login.
 */
const PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;
const PARAM_TAG = `m=${PARAMS.memoryCost},t=${PARAMS.timeCost},p=${PARAMS.parallelism}`;

export function hashPassword(password: string): Promise<string> {
  return hash(password, PARAMS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function needsRehash(passwordHash: string): boolean {
  return !passwordHash.startsWith("$argon2id$") || !passwordHash.includes(PARAM_TAG);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies against a throwaway hash so a login for an unknown email takes as
 * long as one for a real account (prevents user enumeration by timing).
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("cadencia-timing-equalizer-not-a-real-password");
  await verifyPassword(await dummyHash, password);
}
