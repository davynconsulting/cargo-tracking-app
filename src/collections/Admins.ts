import type { Access, CollectionConfig, FieldAccess } from 'payload'

const isPayloadAdmin: Access = ({ req }) => req.user?.collection === 'admins'

const hasAdminRole = (user: unknown) =>
  !!user &&
  typeof user === 'object' &&
  (user as { collection?: string }).collection === 'admins' &&
  (user as { role?: string }).role === 'admin'

const isAdminRole: Access = ({ req }) => hasAdminRole(req.user)

const isAdminRoleOrSelf: Access = ({ req }) => {
  if (hasAdminRole(req.user)) return true
  return req.user?.collection === 'admins' ? { id: { equals: req.user.id } } : false
}

const isAdminRoleField: FieldAccess = ({ req }) => hasAdminRole(req.user)

// No signed-in user only happens during first-user registration, since
// collection create access already requires an administrator.
const canSetRoleOnCreate: FieldAccess = ({ req }) => !req.user || hasAdminRole(req.user)

export const Admins: CollectionConfig = {
  slug: 'admins',
  access: {
    create: isAdminRole,
    delete: isAdminRole,
    read: isPayloadAdmin,
    update: isAdminRoleOrSelf,
  },
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [
    // Email added by default
    { name: 'name', type: 'text' },
    {
      name: 'role',
      type: 'select',
      // Only administrators can grant or change roles.
      access: { create: canSetRoleOnCreate, update: isAdminRoleField },
      defaultValue: 'operations',
      required: true,
      options: [
        { label: 'Administrator', value: 'admin' },
        { label: 'Operations', value: 'operations' },
        { label: 'Finance', value: 'finance' },
        { label: 'Client service', value: 'client-service' },
      ],
    },
  ],
  versions: false,
}
