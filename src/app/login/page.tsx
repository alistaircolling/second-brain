'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const DIGITS = ['1','2','3','4','5','6','7','8','9','0'];

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const maskedPin = useMemo(() => '*'.repeat(pin.length), [pin.length]);

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pin }),
      });

      if (!res.ok) throw new Error('Invalid login.');
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Unlock</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="pin">
              PIN
            </label>
            <div
              id="pin"
              className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm"
            >
              {maskedPin || '••••'}
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              {DIGITS.map((digit) => (
                <Button
                  key={digit}
                  type="button"
                  variant="outline"
                  onClick={() => setPin((current) => current + digit)}
                >
                  {digit}
                </Button>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setPin((current) => current.slice(0, -1))}
              >
                Back
              </Button>
              <Button type="button" variant="outline" onClick={() => setPin('')}>
                Clear
              </Button>
              <Button type="button" onClick={submit} disabled={isSubmitting}>
                Unlock
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
