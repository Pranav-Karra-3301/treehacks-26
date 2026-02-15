import { NextRequest, NextResponse } from 'next/server';

const AUTH_SECRET = process.env.AUTH_SECRET ?? '';
const COOKIE_NAME = 'kiru_auth';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const PROTECTED_PATHS = ['/chat', '/dashboard'];

async function hmacSha256(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function isValidToken(token: string): Promise<boolean> {
  if (!AUTH_SECRET) return false;

  const dotIndex = token.indexOf('.');
  if (dotIndex < 1) return false;

  const timestamp = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);

  // Check signature
  const expected = await hmacSha256(AUTH_SECRET, timestamp);
  if (sig.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) {
    mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  if (mismatch !== 0) return false;

  // Check expiry
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) return false;
  if (Date.now() - ts > COOKIE_MAX_AGE_MS) return false;

  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect specific paths
  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  // If no AUTH_SECRET configured, skip auth (dev convenience)
  if (!AUTH_SECRET) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (token && await isValidToken(token)) {
    return NextResponse.next();
  }

  // Redirect to login
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/chat/:path*', '/dashboard/:path*'],
};
