'use client';

import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginForm() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (data.ok) {
        const next = searchParams.get('next') || '/chat';
        router.push(next as '/');
        router.refresh();
      } else {
        setError(data.error || 'Wrong password');
        setPassword('');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit(e as unknown as FormEvent);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafaf9] px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span
            className="text-[42px] tracking-tight text-gray-950 italic"
            style={{ fontFamily: '"Martina Plantijn", Georgia, serif' }}
          >
            kiru
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-1 shadow-soft focus-within:border-gray-300 focus-within:shadow-card transition-all duration-200">
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Password"
                autoFocus
                disabled={loading}
                className="flex-1 bg-transparent px-4 py-3 text-[14px] text-gray-900 placeholder-gray-400 outline-none disabled:text-gray-400"
              />
              <button
                type="submit"
                disabled={!password.trim() || loading}
                className="shrink-0 mr-1 rounded-xl bg-gray-900 px-5 py-2.5 text-[13px] font-medium text-white transition-all duration-150 hover:bg-gray-700 active:scale-[0.97] disabled:bg-gray-200 disabled:text-gray-400"
              >
                {loading ? '...' : 'Enter'}
              </button>
            </div>
          </div>

          {error ? (
            <p className="text-center text-[13px] text-red-500">{error}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
