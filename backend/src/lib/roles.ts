/**
 * Team roles.
 *
 * - `admin`  — everything, including managing the team, deleting candidates/jobs,
 *              exporting candidate data, and reading the audit log.
 * - `member` — the full hiring workflow: jobs, candidates, pipeline stages, interviews,
 *              and team reviews (notes + ratings). Cannot delete, export, or administer.
 *
 * Anything destructive or bulk-PII is admin-only, so you can bring colleagues in to review
 * candidates without handing them the ability to erase or exfiltrate the pipeline.
 */
export const ROLES = ['admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_ROLE: Role = 'member';

/** Legacy rows (and old JWTs) predate the two-role model; treat anything unknown as member. */
export function normalizeRole(role: string | null | undefined): Role {
  return role === 'admin' ? 'admin' : DEFAULT_ROLE;
}

export function isAdmin(role: string | null | undefined): boolean {
  return normalizeRole(role) === 'admin';
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  member: 'Member',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: 'Full access, including team management, deleting records, exports, and the audit log.',
  member: 'Can manage jobs, candidates, interviews, and reviews. Cannot delete, export, or manage the team.',
};
