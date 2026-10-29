/**
 * Seeds a fresh database with demo staff, clients, shipments and invoices.
 *
 *   pnpm seed            # skips if shipments already exist
 *   pnpm seed --reset    # wipes operational data first
 *
 * The admin password comes from SEED_ADMIN_PASSWORD, or is generated and
 * printed once.
 */
import { randomBytes } from 'node:crypto'
import config from '@payload-config'
import { getPayload } from 'payload'

const day = 24 * 60 * 60 * 1000
const at = (offsetDays: number, hour = 9) => {
  const date = new Date(Date.now() + offsetDays * day)
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

const payload = await getPayload({ config })
const reset = process.argv.includes('--reset')

const existing = await payload.count({ collection: 'shipments', overrideAccess: true })
if (existing.totalDocs > 0 && !reset) {
  payload.logger.info('Shipments already exist; skipping seed. Pass --reset to reseed.')
  process.exit(0)
}

if (reset) {
  for (const collection of ['invoices', 'shipments', 'clients'] as const) {
    await payload.delete({ collection, where: { id: { exists: true } }, overrideAccess: true })
  }
}

const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(9).toString('base64url')
const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@ngb-logistics.test'

let createdAdmins = false
const findOrCreateAdmin = async (email: string, name: string, role: string) => {
  const found = await payload.find({
    collection: 'admins',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  if (found.docs[0]) return found.docs[0]
  createdAdmins = true
  return payload.create({
    collection: 'admins',
    data: { email, name, role: role as 'admin', password },
    overrideAccess: true,
  })
}

const amina = await findOrCreateAdmin(adminEmail, 'Amina Mhando', 'admin')
const baraka = await findOrCreateAdmin('baraka@ngb-logistics.test', 'Baraka Mushi', 'operations')
await findOrCreateAdmin('neema@ngb-logistics.test', 'Neema Kileo', 'finance')

const clientData = [
  {
    organization: 'Kivu Agro Traders',
    primaryContact: 'Jean-Paul Habimana',
    email: 'logistics@kivuagro.test',
    phone: '+250 788 410 221',
    preferredLanguage: 'fr',
    notificationChannels: ['email', 'whatsapp'],
    billingTerms: '30 days from delivery',
  },
  {
    organization: 'Lake Zone Hardware Ltd',
    primaryContact: 'Grace Nyirenda',
    email: 'imports@lakezonehw.test',
    phone: '+255 754 302 118',
    preferredLanguage: 'sw',
    notificationChannels: ['sms', 'whatsapp'],
    billingTerms: '50% on registration, balance on delivery',
  },
  {
    organization: 'Nile Pharma Distributors',
    primaryContact: 'David Okello',
    email: 'supply@nilepharma.test',
    phone: '+256 772 908 446',
    preferredLanguage: 'en',
    notificationChannels: ['email'],
    billingTerms: '14 days net',
  },
] as const

const clients = []
for (const data of clientData) {
  clients.push(
    await payload.create({
      collection: 'clients',
      data: { ...data, notificationChannels: [...data.notificationChannels], accountManager: amina.id },
      overrideAccess: true,
    }),
  )
}
const [kivu, lakeZone, nile] = clients

type Step = {
  milestone: string
  status: 'pending' | 'in-progress' | 'completed' | 'blocked'
  occurredAt?: string
  location?: string
  notes?: string
}

const shipmentData = [
  {
    reference: 'NGB-250184',
    client: kivu.id,
    status: 'active',
    origin: 'Dar es Salaam Port',
    destination: 'Kigali, Rwanda',
    eta: at(4, 15),
    cargoDescription: '2 x 40ft HC, bagged fertiliser (52 t)',
    currentMilestone: 'customs-release',
    bookingNumber: 'MSK-7741902',
    billOfLading: 'MAEU241188730',
    shippingLine: 'Maersk',
    vessel: 'Maersk Kampala',
    plannedArrival: at(-9),
    actualArrival: at(-8, 6),
    port: 'Dar es Salaam',
    terminal: 'TICTS Terminal 2',
    locationType: 'icd',
    containers: [
      { containerNumber: 'MSKU 482190-3', containerType: '40HC', sealNumber: 'ML-2210931' },
      { containerNumber: 'MSKU 482211-7', containerType: '40HC', sealNumber: 'ML-2210932' },
    ],
    clearance: {
      deliveryOrder: 'DO-55102',
      customsEntryReference: 'TANCIS-2025-118842',
      transitDocumentReference: 'T1-RW-44812',
      shippingLineRelease: 'received',
      customsStatus: 'processing',
      dutiesStatus: 'assessed',
      blockers: 'Awaiting RRA bond confirmation for transit to Rusumo.',
    },
    transport: {
      transporter: 'Mwanza Haulage Co.',
      truck: 'T 412 DKX',
      trailer: 'T 889 DKY',
      driverName: 'Hamisi Juma',
      driverPhone: '+255 713 220 914',
      borderCrossing: 'Rusumo',
      plannedLoading: at(0, 8),
      estimatedDelivery: at(4, 15),
      route: 'Dar es Salaam → Morogoro → Dodoma → Nzega → Rusumo → Kigali',
    },
    documentChecklist: [
      { name: 'Bill of lading', status: 'approved' },
      { name: 'Commercial invoice', status: 'approved' },
      { name: 'Packing list', status: 'received' },
      { name: 'Certificate of origin', status: 'missing', notes: 'Client chasing supplier' },
      { name: 'Transit bond', status: 'missing' },
    ],
    steps: [
      { milestone: 'onboarding', status: 'completed', occurredAt: at(-20), location: 'Dar es Salaam office' },
      { milestone: 'registration', status: 'completed', occurredAt: at(-18), location: 'Dar es Salaam office', notes: 'Original BL received by courier.' },
      { milestone: 'vessel-arrival', status: 'completed', occurredAt: at(-8, 6), location: 'Dar es Salaam anchorage' },
      { milestone: 'discharge', status: 'completed', occurredAt: at(-7, 14), location: 'TICTS Terminal 2' },
      { milestone: 'port-processing', status: 'completed', occurredAt: at(-5, 11), location: 'Kurasini ICD' },
      { milestone: 'truck-allocation', status: 'completed', occurredAt: at(-2, 10), location: 'Kurasini ICD', notes: 'Two trucks allocated from Mwanza Haulage.' },
      { milestone: 'loading', status: 'completed', occurredAt: at(-1, 16), location: 'Kurasini ICD' },
      { milestone: 'customs-release', status: 'in-progress', occurredAt: at(0, 9), location: 'Kurasini ICD', notes: 'Entry lodged; waiting on bond.' },
    ] as Step[],
  },
  {
    reference: 'NGB-250177',
    client: lakeZone.id,
    status: 'delayed',
    origin: 'Dar es Salaam Port',
    destination: 'Mwanza, Tanzania',
    eta: at(6, 12),
    cargoDescription: '1 x 20ft, galvanised roofing sheets',
    currentMilestone: 'port-processing',
    billOfLading: 'CMAU771023441',
    shippingLine: 'CMA CGM',
    vessel: 'CMA CGM Tanzanite',
    plannedArrival: at(-6),
    actualArrival: at(-3, 18),
    port: 'Dar es Salaam',
    terminal: 'DP World Berth 5',
    locationType: 'seaport-terminal',
    containers: [{ containerNumber: 'CMAU 330218-0', containerType: '20GP', sealNumber: 'CC-901223' }],
    clearance: {
      shippingLineRelease: 'pending',
      customsStatus: 'inspection',
      dutiesStatus: 'pending',
      blockers: 'Physical inspection scheduled; vessel arrived three days late.',
    },
    transport: { route: 'Dar es Salaam → Dodoma → Shinyanga → Mwanza' },
    documentChecklist: [
      { name: 'Bill of lading', status: 'approved' },
      { name: 'Commercial invoice', status: 'invalid', notes: 'HS code mismatch' },
      { name: 'Packing list', status: 'received' },
    ],
    steps: [
      { milestone: 'registration', status: 'completed', occurredAt: at(-12), location: 'Mwanza office' },
      { milestone: 'vessel-arrival', status: 'completed', occurredAt: at(-3, 18), location: 'Dar es Salaam anchorage', notes: 'Arrived 3 days behind schedule.' },
      { milestone: 'discharge', status: 'completed', occurredAt: at(-2, 9), location: 'DP World Berth 5' },
      { milestone: 'port-processing', status: 'blocked', occurredAt: at(-1, 13), location: 'DP World Berth 5', notes: 'Customs inspection requested.' },
    ] as Step[],
  },
  {
    reference: 'NGB-250162',
    client: nile.id,
    status: 'active',
    origin: 'Mombasa Port',
    destination: 'Kampala, Uganda',
    eta: at(1, 10),
    cargoDescription: '1 x 40ft reefer, temperature-controlled pharmaceuticals',
    currentMilestone: 'road-transit',
    billOfLading: 'MSCU558120934',
    shippingLine: 'MSC',
    vessel: 'MSC Amalfi',
    port: 'Mombasa',
    terminal: 'Kipevu CT2',
    locationType: 'in-transit',
    containers: [{ containerNumber: 'MSCU 901774-2', containerType: '40RF', sealNumber: 'MS-778104' }],
    clearance: {
      deliveryOrder: 'DO-MB-2231',
      customsEntryReference: 'KRA-ENT-662019',
      shippingLineRelease: 'received',
      customsStatus: 'released',
      dutiesStatus: 'paid',
    },
    transport: {
      transporter: 'Rift Valley Freight',
      truck: 'KDH 221Q',
      trailer: 'ZG 8812',
      driverName: 'Peter Wanjala',
      driverPhone: '+254 722 118 450',
      borderCrossing: 'Malaba',
      gateOutAt: at(-2, 7),
      estimatedDelivery: at(1, 10),
      route: 'Mombasa → Nairobi → Eldoret → Malaba → Kampala',
    },
    documentChecklist: [
      { name: 'Bill of lading', status: 'approved' },
      { name: 'Import permit (NDA)', status: 'approved' },
      { name: 'Temperature log', status: 'received' },
    ],
    steps: [
      { milestone: 'registration', status: 'completed', occurredAt: at(-15), location: 'Kampala office' },
      { milestone: 'vessel-arrival', status: 'completed', occurredAt: at(-9), location: 'Mombasa' },
      { milestone: 'discharge', status: 'completed', occurredAt: at(-8), location: 'Kipevu CT2' },
      { milestone: 'port-processing', status: 'completed', occurredAt: at(-6), location: 'Kipevu CT2' },
      { milestone: 'truck-allocation', status: 'completed', occurredAt: at(-4), location: 'Mombasa' },
      { milestone: 'loading', status: 'completed', occurredAt: at(-3), location: 'Kipevu CT2' },
      { milestone: 'customs-release', status: 'completed', occurredAt: at(-3, 15), location: 'Mombasa' },
      { milestone: 'gate-out', status: 'completed', occurredAt: at(-2, 7), location: 'Kipevu CT2 gate' },
      { milestone: 'road-transit', status: 'in-progress', occurredAt: at(0, 6), location: 'Malaba border', notes: 'Crossed into Uganda, reefer at 4°C.' },
    ] as Step[],
  },
  {
    reference: 'NGB-250139',
    client: kivu.id,
    status: 'completed',
    origin: 'Dar es Salaam Port',
    destination: 'Goma, DR Congo',
    eta: at(-10, 14),
    cargoDescription: '1 x 40ft, packaged maize flour',
    currentMilestone: 'closure',
    billOfLading: 'MAEU240911002',
    shippingLine: 'Maersk',
    port: 'Dar es Salaam',
    locationType: 'empty-depot',
    containers: [{ containerNumber: 'MSKU 771002-9', containerType: '40GP' }],
    clearance: { shippingLineRelease: 'received', customsStatus: 'released', dutiesStatus: 'paid' },
    transport: { transporter: 'Mwanza Haulage Co.', truck: 'T 233 DJA', borderCrossing: 'Rusumo / Gisenyi' },
    delivery: { arrivedAt: at(-10, 14), offloadedAt: at(-9, 11), emptyReturnedAt: at(-4, 10), receivingContact: 'Warehouse, Goma' },
    documentChecklist: [
      { name: 'Bill of lading', status: 'approved' },
      { name: 'Proof of delivery', status: 'approved' },
    ],
    steps: [
      { milestone: 'registration', status: 'completed', occurredAt: at(-40), location: 'Dar es Salaam office' },
      { milestone: 'gate-out', status: 'completed', occurredAt: at(-18), location: 'Kurasini ICD' },
      { milestone: 'destination-arrival', status: 'completed', occurredAt: at(-10, 14), location: 'Goma' },
      { milestone: 'offloading-return', status: 'completed', occurredAt: at(-4, 10), location: 'Dar es Salaam empty depot' },
      { milestone: 'closure', status: 'completed', occurredAt: at(-2, 12), location: 'Dar es Salaam office' },
    ] as Step[],
  },
  {
    reference: 'NGB-250191',
    client: lakeZone.id,
    status: 'active',
    origin: 'Dar es Salaam Port',
    destination: 'Bujumbura, Burundi',
    eta: at(12, 12),
    cargoDescription: '3 x 20ft, cement and building materials',
    currentMilestone: 'registration',
    billOfLading: 'COSU620011934',
    shippingLine: 'COSCO',
    vessel: 'COSCO Shenzhen',
    plannedArrival: at(3),
    port: 'Dar es Salaam',
    clearance: { shippingLineRelease: 'pending', customsStatus: 'not-started', dutiesStatus: 'not-applicable' },
    documentChecklist: [
      { name: 'Bill of lading', status: 'received' },
      { name: 'Commercial invoice', status: 'missing' },
      { name: 'Packing list', status: 'missing' },
    ],
    steps: [
      { milestone: 'onboarding', status: 'completed', occurredAt: at(-3), location: 'Dar es Salaam office' },
      { milestone: 'registration', status: 'in-progress', occurredAt: at(-1, 10), location: 'Dar es Salaam office', notes: 'Copy BL received; originals in courier.' },
    ] as Step[],
  },
]

const shipments: Record<string, { id: string | number }> = {}
for (const { steps, ...data } of shipmentData) {
  const doc = await payload.create({
    collection: 'shipments',
    data: {
      ...data,
      assignedTo: [amina.id, baraka.id],
      milestones: steps,
    } as never,
    overrideAccess: true,
  })
  shipments[data.reference] = doc
}

const invoiceData = [
  { invoiceNumber: 'INV-2025-0412', shipment: 'NGB-250184', client: kivu.id, amount: 6850, currency: 'USD', dueDate: at(14), status: 'partially-paid', balance: 3425, payments: [{ amount: 3425, paidAt: at(-5), reference: 'TT-889120', verified: true }] },
  { invoiceNumber: 'INV-2025-0405', shipment: 'NGB-250162', client: nile.id, amount: 4200, currency: 'USD', dueDate: at(7), status: 'issued', balance: 4200 },
  { invoiceNumber: 'INV-2025-0398', shipment: 'NGB-250177', client: lakeZone.id, amount: 9_450_000, currency: 'TZS', dueDate: at(-2), status: 'overdue', balance: 9_450_000 },
  { invoiceNumber: 'INV-2025-0371', shipment: 'NGB-250139', client: kivu.id, amount: 5900, currency: 'USD', dueDate: at(-12), status: 'paid', balance: 0, payments: [{ amount: 5900, paidAt: at(-11), reference: 'TT-871004', verified: true }] },
]

for (const { shipment, ...data } of invoiceData) {
  await payload.create({
    collection: 'invoices',
    data: { ...data, shipment: shipments[shipment].id } as never,
    overrideAccess: true,
  })
}

payload.logger.info(`Seeded ${shipmentData.length} shipments and ${invoiceData.length} invoices.`)
if (createdAdmins && !process.env.SEED_ADMIN_PASSWORD) {
  payload.logger.info(`Staff login: ${adminEmail} / ${password} (also baraka@, neema@ with the same password)`)
}
process.exit(0)
