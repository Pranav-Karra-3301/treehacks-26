import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

// Read at request time: on Cloudflare Workers, secrets are bound to process.env
// per request, so module-level reads can see empty values.
const getSitePassword = () => process.env.SITE_PASSWORD ?? '';
const getAuthSecret = () => process.env.AUTH_SECRET ?? '';
const COOKIE_NAME = 'kiru_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sign(value: string): string {
  return createHmac('sha256', getAuthSecret()).update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const SITE_PASSWORD = getSitePassword();
  if (!SITE_PASSWORD || !getAuthSecret()) {
    return NextResponse.json({ ok: false, error: 'Auth not configured' }, { status: 500 });
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const password = (body.password ?? '').trim();
  if (!password) {
    return NextResponse.json({ ok: false, error: 'Password required' }, { status: 400 });
  }

  if (!safeEqual(password, SITE_PASSWORD)) {
    return NextResponse.json({ ok: false, error: 'Wrong password' }, { status: 401 });
  }

  // Create signed token: timestamp + HMAC
  const timestamp = Date.now().toString();
  const token = `${timestamp}.${sign(timestamp)}`;

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
