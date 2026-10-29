import type { Access, FieldAccess } from 'payload'

type StaffRole = 'admin' | 'operations' | 'finance' | 'client-service'

const getStaffRole = (user: unknown): StaffRole | undefined => {
  if (!user || typeof user !== 'object') return undefined
  const candidate = user as { collection?: string; role?: StaffRole }
  return candidate.collection === 'admins' ? candidate.role : undefined
}

export const isStaff: Access = ({ req }) => req.user?.collection === 'admins'

export const isFinanceStaff: Access = ({ req }) => {
  const role = getStaffRole(req.user)
  return role === 'admin' || role === 'finance'
}

export const isFinanceField: FieldAccess = ({ req }) => {
  const role = getStaffRole(req.user)
  return role === 'admin' || role === 'finance'
}
