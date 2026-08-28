import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { sessionSecret } from './config';
import { queryOne } from './db';

/**
 * Deliberately minimal identity: a signed, HTTP-only cookie holding a user id.
 * No passwords, no OAuth, no profile pages — just enough to know who owns what
 * and to let a previous owner come back and reclaim.
 */

const COOKIE = 'cb_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days

export type SessionUser = {
  id: string;
  handle: string;
  email: string;
};

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function encodeSession(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, issuedAt, signature] = parts;
  const expected = sign(`${userId}.${issuedAt}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const age = (Date.now() - Number(issuedAt)) / 1000;
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_SECONDS) return null;
  return userId;
}

export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = decodeSession(store.get(COOKIE)?.value);
  if (!userId) return null;
  return queryOne<SessionUser>(
    'SELECT id, handle, email FROM users WHERE id = $1',
    [userId],
  );
}

export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/**
 * Finds an existing user by email, or creates one. Handles are unique, so a
 * returning bidder keeps their @handle and a colliding new handle is suffixed.
 */
export async function upsertUser(handle: string, email: string): Promise<SessionUser> {
  const existing = await queryOne<SessionUser>(
    'SELECT id, handle, email FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  if (existing) return existing;

  let candidate = handle;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE lower(handle) = lower($1)',
      [candidate],
    );
    if (!taken) break;
    candidate = `${handle}${randomUUID().slice(0, 4)}`;
  }

  const created = await queryOne<SessionUser>(
    'INSERT INTO users (handle, email) VALUES ($1, $2) RETURNING id, handle, email',
    [candidate, email],
  );
  if (!created) throw new Error('Could not create user');
  return created;
}
