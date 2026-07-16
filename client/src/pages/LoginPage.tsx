import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { IconType } from 'react-icons';
import {
  LuCircleCheck,
  LuEye,
  LuEyeOff,
  LuFileText,
  LuLock,
  LuMail,
  LuScanLine,
  LuSparkles,
  LuStar,
  LuUserCheck,
} from 'react-icons/lu';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import { Alert, Spinner } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import loginHero from '../assets/login-hero.jpg';
import loginHeroVideo from '../assets/login-hero.mp4';

/** Symbols of the screening workflow, drifting behind the form — each its own colour. */
const FLOATERS: {
  Icon: IconType;
  pos: string;
  box: string;
  icon: string;
  color: string;
  dur: string;
  delay: string;
}[] = [
  { Icon: LuFileText, pos: 'left-[9%] top-[17%]', box: 'h-14 w-14', icon: 'h-6 w-6', color: 'border-brand-200/60 bg-brand-50/70 text-brand-600', dur: '8s', delay: '0s' },
  { Icon: LuSparkles, pos: 'right-[11%] top-[13%]', box: 'h-12 w-12', icon: 'h-5 w-5', color: 'border-violet-200/60 bg-violet-50/70 text-violet-500', dur: '7s', delay: '1.2s' },
  { Icon: LuScanLine, pos: 'left-[13%] top-[57%]', box: 'h-12 w-12', icon: 'h-5 w-5', color: 'border-sky-200/60 bg-sky-50/70 text-sky-500', dur: '9s', delay: '0.6s' },
  { Icon: LuStar, pos: 'right-[9%] top-[33%]', box: 'h-10 w-10', icon: 'h-4 w-4', color: 'border-amber-200/60 bg-amber-50/70 text-amber-500', dur: '6.5s', delay: '2s' },
  { Icon: LuCircleCheck, pos: 'right-[13%] bottom-[16%]', box: 'h-12 w-12', icon: 'h-5 w-5', color: 'border-emerald-200/60 bg-emerald-50/70 text-emerald-500', dur: '8.5s', delay: '0.3s' },
  { Icon: LuUserCheck, pos: 'left-[8%] bottom-[15%]', box: 'h-14 w-14', icon: 'h-6 w-6', color: 'border-rose-200/60 bg-rose-50/70 text-rose-500', dur: '7.5s', delay: '1.6s' },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/hr';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      <div className="relative hidden overflow-hidden bg-brand-950 lg:flex lg:flex-col lg:justify-between p-12 text-white">
        {/* Video backdrop — a real résumé-review / interview scene. The still image is
            the poster: it paints instantly and is the fallback if video can't play. */}
        <video
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          poster={loginHero}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src={loginHeroVideo} type="video/mp4" />
        </video>
        {/* Brand gradient for legibility + colour cohesion */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-b from-brand-950/85 via-brand-900/78 to-brand-950/94" />
        <div className="pointer-events-none absolute inset-0 bg-brand-700/25 mix-blend-multiply" />

        <div className="relative flex items-center gap-2.5">
          <img
            src="/Favicon_Linkage.png"
            alt="Linkage ScreenAI"
            className="h-9 w-9 rounded-xl bg-white object-contain p-0.5"
          />
          <span className="font-display text-lg font-semibold">Linkage ScreenAI</span>
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

          {/* Floating glass stat — reinforces the AI-ranking value */}
          <div className="animate-float mt-9 inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-lg backdrop-blur-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400 text-sm font-bold text-emerald-950">
              97
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Top match found</p>
              <p className="text-xs text-brand-100">AI-ranked against the role in seconds</p>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-brand-200">© {new Date().getFullYear()} ScreenAI Careers</p>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center overflow-hidden px-6 py-12">
        {/* Soft brand accents behind the form */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-brand-100/50 blur-3xl" />

        {/* Floating workflow symbols */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {FLOATERS.map((f, i) => (
            <span
              key={i}
              style={{ animationDuration: f.dur, animationDelay: f.delay }}
              className={`animate-float-drift absolute ${f.pos} ${f.box} ${f.color} flex items-center justify-center rounded-2xl border shadow-sm backdrop-blur-sm`}
            >
              <f.Icon className={f.icon} />
            </span>
          ))}
        </div>

        <div className="relative z-10 w-full max-w-sm animate-rise">
          <div className="rounded-3xl border border-white/60 bg-white/80 p-8 shadow-[0_24px_60px_-24px_rgba(28,45,110,0.35)] backdrop-blur-md">
            {/* Logo + heading */}
            <div className="mb-7">
              <div className="mb-5 flex items-center gap-2.5">
                <img
                  src="/Favicon_Linkage.png"
                  alt="Linkage ScreenAI"
                  className="h-10 w-10 rounded-xl object-contain"
                />
                <span className="font-display text-base font-semibold text-slate-800">
                  Linkage ScreenAI
                </span>
              </div>
              <h1 className="font-display text-2xl font-semibold text-slate-900">Welcome back</h1>
              <p className="mt-1.5 text-sm text-slate-500">Sign in to your recruiter dashboard.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <LuMail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="email"
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hr@example.com"
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <LuLock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:text-slate-600"
                  >
                    {showPassword ? <LuEyeOff className="h-4 w-4" /> : <LuEye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && <Alert kind="error">{error}</Alert>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <Spinner /> : 'Sign in'}
              </Button>
            </form>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <LuLock className="h-3.5 w-3.5" />
            Secure recruiter access · Linkage ScreenAI
          </p>
        </div>
      </div>
    </div>
  );
}
