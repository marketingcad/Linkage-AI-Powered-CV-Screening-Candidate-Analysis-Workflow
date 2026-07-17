import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
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
import avatarPlaceholder from '../assets/avatar-placeholder.png';

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'Signed in',
  'candidate.stage_change': 'Moved candidate',
  'candidate.delete': 'Deleted candidate',
  'candidate.export': 'Exported candidate data',
  'job.delete': 'Deleted job',
  'retention.purge': 'Data retention purge',
};

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

  // Recent activity (audit log)
  const [activity, setActivity] = useState<AuditLog[]>([]);
  useEffect(() => {
    fetchAuditLog()
      .then((r) => setActivity(r.entries))
      .catch(() => {
        /* non-critical */
      });
  }, []);

  // --- Two-factor (TOTP) ---
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [disarming, setDisarming] = useState(false);
  const [twoFABusy, setTwoFABusy] = useState(false);
  const [twoFAErr, setTwoFAErr] = useState<string | null>(null);
  const [twoFAMsg, setTwoFAMsg] = useState<string | null>(null);

  // --- Profile form ---
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [avatar, setAvatar] = useState<string | null>(user?.avatarUrl ?? null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Password form ---
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwMsg, setPwMsg] = useState<string | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setProfileMsg(null);
    if (!file.type.startsWith('image/')) {
      setProfileErr('Please choose an image file (PNG or JPG).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileErr('Image must be under 5 MB.');
      return;
    }
    try {
      setAvatar(await resizeImage(file));
      setProfileErr(null);
    } catch {
      setProfileErr('Could not read that image. Try another file.');
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileErr(null);
    setProfileMsg(null);
    if (name.trim().length < 2) {
      setProfileErr('Please enter your full name.');
      return;
    }
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
      setProfileErr(err instanceof ApiError ? err.message : 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(null);
    setPwMsg(null);
    if (newPassword.length < 8) {
      setPwErr('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwErr('New password and confirmation do not match.');
      return;
    }
    setSavingPw(true);
    try {
      await changePassword(oldPassword, newPassword);
      setPwMsg('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwErr(err instanceof ApiError ? err.message : 'Could not change password.');
    } finally {
      setSavingPw(false);
    }
  }

  async function startSetup() {
    setTwoFAErr(null);
    setTwoFAMsg(null);
    setTwoFACode('');
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
    setTwoFABusy(true);
    try {
      const res = await enable2fa(twoFACode.trim());
      updateUser(res.user);
      setSetupData(null);
      setTwoFACode('');
      setTwoFAMsg('Two-factor authentication is now on.');
    } catch (err) {
      setTwoFAErr(err instanceof ApiError ? err.message : 'Could not enable two-factor.');
    } finally {
      setTwoFABusy(false);
    }
  }

  async function confirmDisable(e: React.FormEvent) {
    e.preventDefault();
    setTwoFAErr(null);
    setTwoFABusy(true);
    try {
      const res = await disable2fa(twoFACode.trim());
      updateUser(res.user);
      setDisarming(false);
      setTwoFACode('');
      setTwoFAMsg('Two-factor authentication has been turned off.');
    } catch (err) {
      setTwoFAErr(err instanceof ApiError ? err.message : 'Could not disable two-factor.');
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
              <p className="mt-2 text-xs text-slate-400">PNG, JPG or WebP · up to 5 MB.</p>
            </div>
            <span className="ml-auto hidden items-center gap-1.5 self-start rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium capitalize text-brand-700 sm:inline-flex">
              <LuShieldCheck className="h-3.5 w-3.5" />
              {user?.role ?? 'recruiter'}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          {profileErr && <Alert kind="error">{profileErr}</Alert>}
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
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </div>

          {pwErr && <Alert kind="error">{pwErr}</Alert>}
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
                  onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className="text-center text-lg tracking-[0.3em]"
                />
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
                    onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="123456"
                    className="max-w-48 text-center text-lg tracking-[0.3em]"
                  />
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

        {twoFAErr && (
          <div className="mt-4">
            <Alert kind="error">{twoFAErr}</Alert>
          </div>
        )}
        {twoFAMsg && (
          <div className="mt-4">
            <Alert kind="success">{twoFAMsg}</Alert>
          </div>
        )}
      </Card>

      {/* Recent activity */}
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <LuHistory className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700">Recent activity</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          An audit trail of recent recruiter and system actions.
        </p>
        {activity.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No activity recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
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
      </Card>

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
