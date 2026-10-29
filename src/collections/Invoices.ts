import type { CollectionConfig } from 'payload'
import { isFinanceField, isFinanceStaff, isStaff } from './access'

export const Invoices: CollectionConfig = {
  slug: 'invoices',
  access: {
    create: isFinanceStaff,
    delete: isFinanceStaff,
    read: isStaff,
    update: isFinanceStaff,
  },
  admin: {
    group: 'Finance',
    useAsTitle: 'invoiceNumber',
    defaultColumns: ['invoiceNumber', 'shipment', 'amount', 'currency', 'dueDate', 'status'],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'invoiceNumber', type: 'text', required: true, unique: true, index: true },
        { name: 'shipment', type: 'relationship', relationTo: 'shipments', required: true },
        { name: 'client', type: 'relationship', relationTo: 'clients', required: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'amount', type: 'number', required: true, min: 0 },
        {
          name: 'currency',
          type: 'select',
          required: true,
          defaultValue: 'USD',
          options: ['USD', 'TZS', 'KES', 'RWF'],
        },
        { name: 'dueDate', type: 'date', required: true },
      ],
    },
    { name: 'terms', type: 'textarea' },
    { name: 'invoiceDocument', type: 'upload', relationTo: 'media' },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'issued',
      options: ['draft', 'issued', 'partially-paid', 'paid', 'overdue', 'credit-approved'],
    },
    {
      name: 'payments',
      type: 'array',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'amount', type: 'number', required: true, min: 0 },
            { name: 'paidAt', type: 'date', required: true },
            { name: 'reference', type: 'text' },
          ],
        },
        { name: 'receipt', type: 'upload', relationTo: 'media' },
        {
          name: 'verified',
          type: 'checkbox',
          defaultValue: false,
          access: { create: isFinanceField, update: isFinanceField },
          admin: { description: 'Only finance or admin staff can verify a payment.' },
        },
      ],
    },
    {
      name: 'balance',
      type: 'number',
      min: 0,
      admin: { description: 'Outstanding balance after verified payments.' },
    },
  ],
}
