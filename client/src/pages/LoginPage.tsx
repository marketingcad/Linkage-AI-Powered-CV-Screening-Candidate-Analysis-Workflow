import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { Alert, Spinner } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/hr';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-brand-700 lg:flex lg:flex-col lg:justify-between p-12 text-white">
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'radial-gradient(600px 300px at 15% 10%, rgba(255,255,255,0.16), transparent 60%), radial-gradient(700px 380px at 110% 100%, rgba(0,0,0,0.35), transparent 55%)',
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-sm font-bold backdrop-blur">
            CV
          </div>
          <span className="font-display text-lg font-semibold">ScreenAI</span>
        </div>

        <div className="relative max-w-md animate-rise">
          <h2 className="font-display text-4xl font-semibold leading-tight">
            Screen hundreds of CVs in minutes, not days.
          </h2>
          <p className="mt-4 text-brand-100">
            AI extracts, scores, and ranks every applicant against the role — so your team spends
            time on people, not paperwork.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-brand-50">
            {[
              'AI qualification & skills-match scoring',
              'Auto-generated screening exams',
              'CV authenticity (AI-written) detection',
              'Applicant status tracking & email updates',
            ].map((f) => (
              <li key={f} className="flex items-center gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-brand-200">© {new Date().getFullYear()} ScreenAI Careers</p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-rise">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">
              CV
            </div>
            <span className="font-display text-lg font-semibold text-slate-800">ScreenAI</span>
          </div>

          <h1 className="font-display text-2xl font-semibold text-slate-900">Welcome back</h1>
          <p className="mt-1.5 text-sm text-slate-500">Sign in to your recruiter dashboard.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hr@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && <Alert kind="error">{error}</Alert>}
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Spinner /> : 'Sign in'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            Looking to apply?{' '}
            <Link to="/apply" className="font-medium text-brand-600 hover:underline">
              Browse open roles
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
