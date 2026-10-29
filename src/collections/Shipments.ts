import type { CollectionConfig, Field } from 'payload'
import { isStaff } from './access'

const milestoneOptions = [
  ['onboarding', 'Client onboarding'],
  ['registration', 'Shipment registration & BL reception'],
  ['vessel-arrival', 'Vessel arrival at port'],
  ['discharge', 'Container discharged at terminal / ICD'],
  ['port-processing', 'Port processing & clearance preparation'],
  ['truck-allocation', 'Truck allocation'],
  ['loading', 'Loading & dispatch checks'],
  ['customs-release', 'Customs entry & release'],
  ['gate-out', 'Port / ICD gate-out'],
  ['road-transit', 'Road transit'],
  ['destination-arrival', 'Arrival at final destination'],
  ['offloading-return', 'Offloading & empty-container return'],
  ['invoice-payment', 'Invoice & payment'],
  ['closure', 'Shipment closure'],
].map(([value, label]) => ({ value, label }))

const operationalDetails: Field[] = [
  {
    type: 'row',
    fields: [
      { name: 'bookingNumber', type: 'text' },
      { name: 'billOfLading', label: 'Bill of lading (BL)', type: 'text', index: true },
      { name: 'shippingLine', type: 'text' },
    ],
  },
  {
    type: 'row',
    fields: [
      { name: 'vessel', type: 'text' },
      { name: 'plannedArrival', type: 'date' },
      { name: 'actualArrival', type: 'date' },
    ],
  },
  {
    type: 'row',
    fields: [
      { name: 'port', type: 'text' },
      { name: 'terminal', type: 'text' },
      {
        name: 'locationType',
        type: 'select',
        options: [
          { label: 'Seaport terminal', value: 'seaport-terminal' },
          { label: 'Inland container depot (ICD)', value: 'icd' },
          { label: 'In transit', value: 'in-transit' },
          { label: 'Final destination', value: 'final-destination' },
          { label: 'Empty depot', value: 'empty-depot' },
        ],
      },
    ],
  },
  {
    name: 'containers',
    type: 'array',
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'containerNumber', type: 'text', required: true },
          { name: 'containerType', type: 'text' },
          { name: 'sealNumber', type: 'text' },
        ],
      },
      { name: 'conditionNotes', type: 'textarea' },
    ],
  },
  {
    name: 'clearance',
    type: 'group',
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'deliveryOrder', type: 'text' },
          { name: 'customsEntryReference', type: 'text' },
          { name: 'transitDocumentReference', type: 'text' },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            name: 'shippingLineRelease',
            type: 'select',
            defaultValue: 'pending',
            options: ['pending', 'received', 'blocked'],
          },
          {
            name: 'customsStatus',
            type: 'select',
            defaultValue: 'not-started',
            options: ['not-started', 'processing', 'inspection', 'released', 'blocked'],
          },
          {
            name: 'dutiesStatus',
            type: 'select',
            defaultValue: 'not-applicable',
            options: ['not-applicable', 'pending', 'assessed', 'paid'],
          },
        ],
      },
      { name: 'blockers', type: 'textarea' },
    ],
  },
  {
    name: 'transport',
    type: 'group',
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'transporter', type: 'text' },
          { name: 'truck', type: 'text' },
          { name: 'trailer', type: 'text' },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'driverName', type: 'text' },
          { name: 'driverPhone', type: 'text' },
          { name: 'borderCrossing', type: 'text' },
        ],
      },
      {
        type: 'row',
        fields: [
          { name: 'plannedLoading', type: 'date' },
          { name: 'gateOutAt', type: 'date' },
          { name: 'estimatedDelivery', type: 'date' },
        ],
      },
      { name: 'route', type: 'text' },
    ],
  },
  {
    name: 'delivery',
    type: 'group',
    fields: [
      {
        type: 'row',
        fields: [
          { name: 'arrivedAt', type: 'date' },
          { name: 'offloadedAt', type: 'date' },
          { name: 'emptyReturnedAt', type: 'date' },
        ],
      },
      { name: 'receivingContact', type: 'text' },
      { name: 'conditionIssues', type: 'textarea' },
      { name: 'proofOfDelivery', type: 'upload', relationTo: 'media' },
    ],
  },
]

export const Shipments: CollectionConfig = {
  slug: 'shipments',
  access: {
    create: isStaff,
    delete: isStaff,
    read: isStaff,
    update: isStaff,
  },
  admin: {
    group: 'Operations',
    useAsTitle: 'reference',
    defaultColumns: ['reference', 'client', 'currentMilestone', 'status', 'eta'],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'reference', type: 'text', required: true, unique: true, index: true },
        { name: 'client', type: 'relationship', relationTo: 'clients', required: true },
        {
          name: 'status',
          type: 'select',
          defaultValue: 'active',
          options: ['draft', 'active', 'delayed', 'on-hold', 'completed'],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'origin', type: 'text', required: true },
        { name: 'destination', type: 'text', required: true },
        { name: 'eta', type: 'date' },
      ],
    },
    { name: 'cargoDescription', type: 'textarea', required: true },
    {
      name: 'currentMilestone',
      type: 'select',
      required: true,
      defaultValue: 'registration',
      options: milestoneOptions,
    },
    ...operationalDetails,
    {
      name: 'documentChecklist',
      type: 'array',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'name', type: 'text', required: true },
            {
              name: 'status',
              type: 'select',
              defaultValue: 'missing',
              options: ['missing', 'received', 'invalid', 'approved'],
            },
          ],
        },
        { name: 'document', type: 'upload', relationTo: 'media' },
        { name: 'notes', type: 'text' },
      ],
    },
    {
      name: 'milestones',
      type: 'array',
      admin: { description: 'Chronological operational and client-notification timeline.' },
      fields: [
        { name: 'milestone', type: 'select', required: true, options: milestoneOptions },
        {
          type: 'row',
          fields: [
            {
              name: 'status',
              type: 'select',
              required: true,
              defaultValue: 'pending',
              options: ['pending', 'in-progress', 'completed', 'blocked'],
            },
            { name: 'occurredAt', type: 'date' },
            { name: 'revisedEta', type: 'date' },
          ],
        },
        { name: 'location', type: 'text' },
        { name: 'notes', type: 'textarea' },
        {
          name: 'clientNotification',
          type: 'group',
          fields: [
            { name: 'message', type: 'textarea' },
            { name: 'sentAt', type: 'date' },
            {
              name: 'channels',
              type: 'select',
              dbName: 'notify_channels',
              hasMany: true,
              options: ['email', 'sms', 'whatsapp'],
            },
          ],
        },
        { name: 'evidence', type: 'upload', relationTo: 'media', hasMany: true },
      ],
    },
    { name: 'assignedTo', type: 'relationship', relationTo: 'admins', hasMany: true },
  ],
}
