import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  LuChevronDown,
  LuHistory,
  LuLogOut,
  LuShieldCheck,
  LuSmartphone,
  LuTrash2,
  LuUpload,
} from 'react-icons/lu';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import {
  changePassword,
  disable2fa,
  enable2fa,
  fetchAuditLog,
  setup2fa,
  updateProfile,
} from '../api/endpoints';
import type { AuditLog } from '../api/types';
import { Alert, Button, Card, Spinner } from '../components/ui';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FieldError from '../components/FieldError';
import { useFormErrors } from '../lib/useFormErrors';
import * as v from '../lib/validators';
import avatarPlaceholder from '../assets/avatar-placeholder.png';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'candidate.stage_change': 'Moved candidate',
  'candidate.delete': 'Deleted candidate',
  'candidate.export': 'Exported candidate data',
  'job.delete': 'Deleted job',
  'retention.purge': 'Data retention purge',
};

/**
 * Avatar types we accept. Kept in step with the file input's `accept` attribute, which is
 * only a picker hint — a drag-and-drop (or a manual "all files" pick) bypasses it, so an
 * SVG or GIF would otherwise reach the canvas and get base64'd into the profile.
 */
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const AVATAR_MAX_MB = 5;
const PASSWORD_MIN = 8;

/** The submit buttons gate on 6 digits already; this also covers a bare Enter keypress. */
const codeRule = (code: string) =>
  /^\d{6}$/.test(code.trim()) ? undefined : 'Enter the 6-digit code from your authenticator app.';

function initials(name?: string): string {
  if (!name) return 'HR';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Read an image file, center-crop to a square, and return a compact JPEG data URL. */
function resizeImage(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('decode failed'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('no canvas'));
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function AccountSettingsPage() {
  const { user, applyAuth, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  // Recent activity (audit log). Admin-only, and collapsed by default so it doesn't
  // stretch the page — the entries are only fetched once it's actually opened.
  const isAdmin = user?.role === 'admin';
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  useEffect(() => {
    if (!showActivity || activityLoaded || !isAdmin) return;
    setActivityLoaded(true);
    fetchAuditLog()
      .then((r) => setActivity(r.entries))
      .catch(() => {
        /* non-critical */
      });
  }, [showActivity, activityLoaded, isAdmin]);

  // --- Two-factor (TOTP) ---
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [disarming, setDisarming] = useState(false);
  const [twoFABusy, setTwoFABusy] = useState(false);
  const [twoFAErr, setTwoFAErr] = useState<string | null>(null);
  const [twoFAMsg, setTwoFAMsg] = useState<string | null>(null);
  const twoFAFields = useFormErrors<'code'>('twofa');

  // --- Profile form ---
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [avatar, setAvatar] = useState<string | null>(user?.avatarUrl ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  // Each form keeps its own error state; `formError` is this form's banner-level message.
  const profileFields = useFormErrors<'name' | 'email' | 'avatar'>('profile');
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Password form ---
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const pwFields = useFormErrors<'oldPassword' | 'newPassword' | 'confirmPassword'>('pw');

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setProfileMsg(null);
    if (!AVATAR_TYPES.includes(file.type)) {
      profileFields.validate({ avatar: 'Photo must be a PNG, JPG, or WebP image.' });
      return;
    }
    if (file.size > AVATAR_MAX_MB * 1024 * 1024) {
      profileFields.validate({
        avatar: `Photo is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${AVATAR_MAX_MB} MB.`,
      });
      return;
    }
    try {
      setAvatar(await resizeImage(file));
      profileFields.clearError('avatar');
      profileFields.setFormError(null);
    } catch {
      profileFields.validate({ avatar: 'Could not read that image. Try another file.' });
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    const ok = profileFields.validate({
      name:
        v.required(name, 'Full name') ??
        v.minLen(name, 2, 'Full name') ??
        v.maxLen(name, v.LIMITS.fullName, 'Full name'),
      email: v.email(email),
    });
    if (!ok) return;
    setSavingProfile(true);
    try {
      const res = await updateProfile({
        name: name.trim(),
        email: email.trim(),
        avatarUrl: avatar,
      });
      applyAuth(res.token, res.user);
      setProfileMsg('Profile updated.');
    } catch (err) {
      profileFields.setServerError(err, 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    const ok = pwFields.validate({
      oldPassword: v.required(oldPassword, 'Old password'),
      newPassword:
        v.required(newPassword, 'New password') ??
        // Length measured untrimmed — spaces are legitimate password characters, and this
        // has to agree with the server's raw `.min(8)` check.
        (newPassword.length < PASSWORD_MIN
          ? `New password must be at least ${PASSWORD_MIN} characters.`
          : undefined) ??
        v.maxLen(newPassword, v.LIMITS.password, 'New password'),
      confirmPassword:
        newPassword !== confirmPassword
          ? 'New password and confirmation do not match.'
          : undefined,
    });
    if (!ok) return;
    setSavingPw(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPwMsg('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      pwFields.setServerError(err, 'Could not change password.');
    } finally {
      setSavingPw(false);
    }
  }

  async function startSetup() {
    setTwoFAErr(null);
    setTwoFAMsg(null);
    setTwoFACode('');
    twoFAFields.reset();
    setTwoFABusy(true);
    try {
      setSetupData(await setup2fa());
    } catch (err) {
      setTwoFAErr(err instanceof ApiError ? err.message : 'Could not start setup.');
    } finally {
      setTwoFABusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setTwoFAErr(null);
    if (!twoFAFields.validate({ code: codeRule(twoFACode) })) return;
    setTwoFABusy(true);
    try {
      const res = await enable2fa(twoFACode.trim());
      updateUser(res.user);
      setSetupData(null);
      setTwoFACode('');
      setTwoFAMsg('Two-factor authentication is now on.');
    } catch (err) {
      twoFAFields.setServerError(err, 'Could not enable two-factor.');
    } finally {
      setTwoFABusy(false);
    }
  }

  async function confirmDisable(e: React.FormEvent) {
    e.preventDefault();
    setTwoFAErr(null);
    if (!twoFAFields.validate({ code: codeRule(twoFACode) })) return;
    setTwoFABusy(true);
    try {
      const res = await disable2fa(twoFACode.trim());
      updateUser(res.user);
      setDisarming(false);
      setTwoFACode('');
      setTwoFAMsg('Two-factor authentication has been turned off.');
    } catch (err) {
      twoFAFields.setServerError(err, 'Could not disable two-factor.');
    } finally {
      setTwoFABusy(false);
    }
  }

  function signOut() {
    logout();
    navigate('/login');
  }

  return (
    <div className="animate-rise mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Account settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your recruiter profile and password.</p>
      </div>

      {/* Profile */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-700">Profile</h2>

        <form onSubmit={saveProfile} className="mt-4 space-y-5">
          {/* Avatar */}
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Avatar className="h-20 w-20">
              <AvatarImage src={avatar ?? avatarPlaceholder} alt={name || 'Account'} />
              <AvatarFallback className="text-lg">{initials(name)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onPickFile}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <LuUpload className="h-4 w-4" />
                  Upload photo
                </Button>
                {avatar && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setAvatar(null)}>
                    <LuTrash2 className="h-4 w-4" />
                    Remove
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                PNG, JPG or WebP · up to {AVATAR_MAX_MB} MB.
              </p>
              <FieldError
                id={profileFields.errorId('avatar')}
                message={profileFields.errors.avatar}
              />
            </div>
            <span className="ml-auto hidden items-center gap-1.5 self-start rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium capitalize text-brand-700 sm:inline-flex">
              <LuShieldCheck className="h-3.5 w-3.5" />
              {user?.role ?? 'recruiter'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                maxLength={v.LIMITS.fullName}
                onChange={(e) => {
                  setName(e.target.value);
                  profileFields.clearError('name');
                }}
                required
                {...profileFields.fieldProps('name')}
              />
              <FieldError id={profileFields.errorId('name')} message={profileFields.errors.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                maxLength={v.LIMITS.email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  profileFields.clearError('email');
                }}
                required
                {...profileFields.fieldProps('email')}
              />
              <FieldError id={profileFields.errorId('email')} message={profileFields.errors.email} />
            </div>
          </div>

          {profileFields.formError && <Alert kind="error">{profileFields.formError}</Alert>}
          {profileMsg && <Alert kind="success">{profileMsg}</Alert>}

          <div className="flex justify-end">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? <Spinner /> : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Password */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-700">Change password</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter your current password, then choose a new one.
        </p>

        <form onSubmit={savePassword} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="oldPassword">Old password</Label>
            <Input
              id="oldPassword"
              type="password"
              autoComplete="current-password"
              maxLength={v.LIMITS.password}
              value={oldPassword}
              onChange={(e) => {
                setOldPassword(e.target.value);
                pwFields.clearError('oldPassword');
              }}
              required
              {...pwFields.fieldProps('oldPassword')}
            />
            <FieldError id={pwFields.errorId('oldPassword')} message={pwFields.errors.oldPassword} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                maxLength={v.LIMITS.password}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  pwFields.clearError('newPassword');
                  pwFields.clearError('confirmPassword');
                }}
                required
                aria-invalid={pwFields.errors.newPassword ? true : undefined}
                // Keep the strength hint announced alongside any error, not replaced by it.
                aria-describedby={
                  pwFields.errors.newPassword
                    ? `newPassword-hint ${pwFields.errorId('newPassword')}`
                    : 'newPassword-hint'
                }
              />
              <p id="newPassword-hint" className="text-xs text-slate-400 dark:text-slate-500">
                At least {PASSWORD_MIN} characters — mix letters, numbers, and symbols.
              </p>
              <FieldError
                id={pwFields.errorId('newPassword')}
                message={pwFields.errors.newPassword}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                maxLength={v.LIMITS.password}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  pwFields.clearError('confirmPassword');
                }}
                required
                {...pwFields.fieldProps('confirmPassword')}
              />
              <FieldError
                id={pwFields.errorId('confirmPassword')}
                message={pwFields.errors.confirmPassword}
              />
            </div>
          </div>

          {pwFields.formError && <Alert kind="error">{pwFields.formError}</Alert>}
          {pwMsg && <Alert kind="success">{pwMsg}</Alert>}

          <div className="flex justify-end">
            <Button type="submit" disabled={savingPw}>
              {savingPw ? <Spinner /> : 'Update password'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Two-factor authentication */}
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <LuShieldCheck className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Two-factor authentication</h2>
          {user?.totpEnabled && (
            <span className="ml-1 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              On
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Require a one-time code from an authenticator app (Google Authenticator, Authy,
          1Password…) each time you sign in.
        </p>

        {user?.totpEnabled ? (
          disarming ? (
            <form onSubmit={confirmDisable} className="mt-4 max-w-xs space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="disableCode">Enter a current code to turn it off</Label>
                <Input
                  id="disableCode"
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={twoFACode}
                  onChange={(e) => {
                    setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    twoFAFields.clearError('code');
                  }}
                  placeholder="123456"
                  className="text-center text-lg tracking-[0.3em]"
                  {...twoFAFields.fieldProps('code')}
                />
                <FieldError id={twoFAFields.errorId('code')} message={twoFAFields.errors.code} />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={twoFABusy || twoFACode.length !== 6}>
                  {twoFABusy ? <Spinner /> : 'Disable'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDisarming(false);
                    setTwoFACode('');
                    setTwoFAErr(null);
                    twoFAFields.reset();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-emerald-700">
                Enabled — a code is required at sign-in.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDisarming(true);
                  setTwoFAErr(null);
                  setTwoFAMsg(null);
                  setTwoFACode('');
                  twoFAFields.reset();
                }}
              >
                Disable
              </Button>
            </div>
          )
        ) : setupData ? (
          <div className="mt-5 flex flex-col gap-5 sm:flex-row">
            <div className="shrink-0 self-start rounded-xl border border-slate-200 bg-white p-3">
              <QRCodeSVG value={setupData.otpauthUrl} size={168} level="M" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-600">
                <b>1.</b> Scan this QR code with your authenticator app.
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Or enter this key manually:
              </p>
              <code className="mt-1 block break-all rounded-md bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-700">
                {setupData.secret}
              </code>
              <form onSubmit={confirmEnable} className="mt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="enableCode">
                    <b>2.</b> Enter the 6-digit code it shows
                  </Label>
                  <Input
                    id="enableCode"
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={twoFACode}
                    onChange={(e) => {
                      setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      twoFAFields.clearError('code');
                    }}
                    placeholder="123456"
                    className="max-w-48 text-center text-lg tracking-[0.3em]"
                    {...twoFAFields.fieldProps('code')}
                  />
                  <FieldError id={twoFAFields.errorId('code')} message={twoFAFields.errors.code} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={twoFABusy || twoFACode.length !== 6}>
                    {twoFABusy ? <Spinner /> : 'Verify & enable'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSetupData(null);
                      setTwoFACode('');
                      setTwoFAErr(null);
                      twoFAFields.reset();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <Button className="mt-4" onClick={startSetup} disabled={twoFABusy}>
            {twoFABusy ? (
              <Spinner />
            ) : (
              <>
                <LuSmartphone className="h-4 w-4" />
                Enable two-factor
              </>
            )}
          </Button>
        )}

        {(twoFAErr ?? twoFAFields.formError) && (
          <div className="mt-4">
            <Alert kind="error">{twoFAErr ?? twoFAFields.formError}</Alert>
          </div>
        )}
        {twoFAMsg && (
          <div className="mt-4">
            <Alert kind="success">{twoFAMsg}</Alert>
          </div>
        )}
      </Card>

      {/* Recent activity — admin-only (the audit endpoint rejects members). */}
      {isAdmin && (
        <Card className="p-6">
          <button
            type="button"
            onClick={() => setShowActivity((s) => !s)}
            aria-expanded={showActivity}
            aria-controls="recent-activity-panel"
            className="flex w-full items-center gap-2 text-left"
          >
            <LuHistory className="h-4 w-4 shrink-0 text-slate-500" />
            <span className="flex-1">
              <span className="block text-sm font-semibold text-slate-700">Recent activity</span>
              <span className="mt-1 block text-sm text-slate-500">
                An audit trail of recent recruiter and system actions.
              </span>
            </span>
            <span className="shrink-0 text-xs font-medium text-brand-600">
              {showActivity ? 'Hide' : 'Show'}
            </span>
            <LuChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
                showActivity ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showActivity && (
            <div id="recent-activity-panel">
              {!activityLoaded ? (
                <p className="mt-4 text-sm text-slate-400">Loading…</p>
              ) : activity.length === 0 ? (
                <p className="mt-4 text-sm text-slate-400">No activity recorded yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {activity.slice(0, 12).map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700">
                          {ACTION_LABELS[e.action] ?? e.action}
                        </p>
                        {e.detail && <p className="truncate text-xs text-slate-500">{e.detail}</p>}
                        <p className="text-xs text-slate-400">{e.actorEmail ?? 'system'}</p>
                      </div>
                      <span className="shrink-0 text-xs text-slate-400">
                        {new Date(e.createdAt).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Session */}
      <Card className="p-6">
        <h2 className="text-sm font-semibold text-slate-700">Session</h2>
        <p className="mt-1 text-sm text-slate-500">Sign out of the dashboard on this device.</p>
        <Button variant="outline" className="mt-4" onClick={signOut}>
          <LuLogOut className="h-4 w-4" />
          Sign out
        </Button>
      </Card>
    </div>
  );
}
