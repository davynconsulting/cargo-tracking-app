import type { CollectionConfig } from 'payload'
import { isStaff } from './access'

export const Clients: CollectionConfig = {
  slug: 'clients',
  access: {
    create: isStaff,
    delete: isStaff,
    read: isStaff,
    update: isStaff,
  },
  admin: {
    group: 'Operations',
    useAsTitle: 'organization',
    defaultColumns: ['organization', 'primaryContact', 'preferredLanguage', 'accountStatus'],
  },
  fields: [
    { name: 'organization', type: 'text', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'primaryContact', type: 'text', required: true },
        { name: 'email', type: 'email', required: true },
        { name: 'phone', type: 'text', required: true },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'preferredLanguage',
          type: 'select',
          defaultValue: 'en',
          options: [
            { label: 'English', value: 'en' },
            { label: 'French', value: 'fr' },
            { label: 'Swahili', value: 'sw' },
          ],
        },
        {
          name: 'accountStatus',
          type: 'select',
          defaultValue: 'active',
          options: [
            { label: 'Active', value: 'active' },
            { label: 'On hold', value: 'on-hold' },
            { label: 'Archived', value: 'archived' },
          ],
        },
      ],
    },
    {
      name: 'notificationChannels',
      type: 'select',
      hasMany: true,
      defaultValue: ['email'],
      options: [
        { label: 'Email', value: 'email' },
        { label: 'SMS', value: 'sms' },
        { label: 'WhatsApp', value: 'whatsapp' },
      ],
    },
    { name: 'billingTerms', type: 'textarea' },
    { name: 'accountManager', type: 'relationship', relationTo: 'admins' },
  ],
}
