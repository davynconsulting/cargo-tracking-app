import { DbContext } from '../db/client';
import { Role } from '../domain/workflow';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  organizationId: string | null;
}

export function contextFor(user: AuthUser): DbContext {
  const kind = user.role === 'client' ? 'client' : user.role === 'driver' ? 'driver' : 'staff';
  return { kind, userId: user.id, orgId: user.organizationId };
}
