import { useEffect, useState } from 'react';
import { LuShieldCheck, LuTrash2, LuUserPlus, LuUsers } from 'react-icons/lu';
import {
  createTeamMember,
  fetchTeam,
  removeTeamMember,
  updateTeamMember,
  type TeamMember,
  type TeamRole,
} from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Alert, Button, Card, Spinner } from '../components/ui';
import FieldError from '../components/FieldError';
import { useFormErrors } from '../lib/useFormErrors';
import * as v from '../lib/validators';

const ROLE_HELP: Record<TeamRole, string> = {
  admin: 'Full access, including team management, deleting records, exports, and the activity log.',
  member: 'Manages jobs, candidates, interviews, and reviews. Cannot delete, export, or manage the team.',
};

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25';

export default function TeamPage() {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<TeamRole>('member');
  const [saving, setSaving] = useState(false);
  const f = useFormErrors<'name' | 'email' | 'password'>('team');

  function load() {
    setLoading(true);
    fetchTeam()
      .then((r) => setMembers(r.members))
      .catch(() => setListError('Could not load the team.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    const ok = f.validate({
      name: v.required(name, 'Name') ?? v.minLen(name, 2, 'Name') ?? v.maxLen(name, v.LIMITS.fullName, 'Name'),
      email: v.email(email),
      password:
        v.required(password, 'Password') ??
        v.minLen(password, 8, 'Password') ??
        v.maxLen(password, v.LIMITS.password, 'Password'),
    });
    if (!ok) return;

    setSaving(true);
    try {
      const { member } = await createTeamMember({ name, email, password, role });
      setMembers((m) => [...m, member]);
      setNotice(`${member.name} can now sign in with the password you set.`);
      setName('');
      setEmail('');
      setPassword('');
      setRole('member');
      setShowInvite(false);
      f.reset();
    } catch (err) {
      f.setServerError(err, 'Could not add that teammate.');
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(m: TeamMember, next: TeamRole) {
    setNotice(null);
    setListError(null);
    setBusyId(m.id);
    try {
      const { member } = await updateTeamMember(m.id, { role: next });
      setMembers((list) => list.map((x) => (x.id === member.id ? member : x)));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not change that role.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(m: TeamMember) {
    if (!confirm(`Remove ${m.name} from the team? They will lose access immediately.`)) return;
    setNotice(null);
    setListError(null);
    setBusyId(m.id);
    try {
      await removeTeamMember(m.id);
      setMembers((list) => list.filter((x) => x.id !== m.id));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not remove that teammate.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <LuUsers className="h-5 w-5 text-brand-500" />
            Team
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Everyone who can sign in and review candidates.
          </p>
        </div>
        <Button type="button" onClick={() => setShowInvite((s) => !s)}>
          <LuUserPlus className="mr-1.5 h-4 w-4" />
          Add teammate
        </Button>
      </div>

      {notice && <Alert kind="success">{notice}</Alert>}
      {listError && <Alert kind="error">{listError}</Alert>}

      {showInvite && (
        <Card className="p-5">
          <form onSubmit={invite} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Name<span aria-hidden="true" className="ml-0.5 text-rose-500">*</span>
                </span>
                <input
                  value={name}
                  maxLength={v.LIMITS.fullName}
                  onChange={(e) => { setName(e.target.value); f.clearError('name'); }}
                  className={inputCls}
                  placeholder="Alex Reviewer"
                  {...f.fieldProps('name')}
                />
                <FieldError id={f.errorId('name')} message={f.errors.name} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email<span aria-hidden="true" className="ml-0.5 text-rose-500">*</span>
                </span>
                <input
                  type="email"
                  value={email}
                  maxLength={v.LIMITS.email}
                  onChange={(e) => { setEmail(e.target.value); f.clearError('email'); }}
                  className={inputCls}
                  placeholder="alex@company.com"
                  {...f.fieldProps('email')}
                />
                <FieldError id={f.errorId('email')} message={f.errors.email} />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Temporary password<span aria-hidden="true" className="ml-0.5 text-rose-500">*</span>
                </span>
                <input
                  type="text"
                  value={password}
                  minLength={8}
                  maxLength={v.LIMITS.password}
                  onChange={(e) => { setPassword(e.target.value); f.clearError('password'); }}
                  className={inputCls}
                  placeholder="At least 8 characters"
                  {...f.fieldProps('password')}
                />
                <FieldError id={f.errorId('password')} message={f.errors.password} />
                <span className="mt-1 block text-xs text-slate-400">
                  Share this with them — they can change it in Settings after signing in.
                </span>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Role
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as TeamRole)}
                  className={inputCls}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <span className="mt-1 block text-xs text-slate-400">{ROLE_HELP[role]}</span>
              </label>
            </div>

            {f.formError && <Alert kind="error">{f.formError}</Alert>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { setShowInvite(false); f.reset(); }}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Adding…' : 'Add teammate'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-0">
        {loading ? (
          <div className="p-6">
            <Spinner label="Loading team…" />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {members.map((m) => {
              const isSelf = m.id === (user?.id ?? user?.sub);
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
                    {m.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {m.name}
                      {isSelf && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                      {m.totpEnabled && (
                        <LuShieldCheck
                          title="Two-factor enabled"
                          className="ml-1.5 inline h-3.5 w-3.5 text-emerald-500"
                        />
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-500">{m.email}</p>
                  </div>

                  <select
                    aria-label={`Role for ${m.name}`}
                    value={m.role}
                    disabled={busyId === m.id}
                    onChange={(e) => void changeRole(m, e.target.value as TeamRole)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>

                  <button
                    type="button"
                    aria-label={`Remove ${m.name}`}
                    title={isSelf ? 'You cannot remove your own account' : `Remove ${m.name}`}
                    disabled={isSelf || busyId === m.id}
                    onClick={() => void remove(m)}
                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-rose-950/30"
                  >
                    <LuTrash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-4 text-xs text-slate-500 dark:text-slate-400">
        <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">What the roles mean</p>
        <p className="mb-0.5"><strong>Admin</strong> — {ROLE_HELP.admin}</p>
        <p><strong>Member</strong> — {ROLE_HELP.member}</p>
      </Card>
    </div>
  );
}
