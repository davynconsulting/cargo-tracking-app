import config from '@payload-config'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getPayload } from 'payload'
import { OperationsDashboard } from './operations-dashboard'

export default async function HomePage() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await headers() })

  // Shipment and invoice data is staff-only; send visitors to the admin login.
  if (!user || user.collection !== 'admins') redirect('/admin/login?redirect=%2F')

  const [shipments, invoices] = await Promise.all([
    payload.find({
      collection: 'shipments',
      depth: 1,
      limit: 50,
      overrideAccess: false,
      sort: '-createdAt',
      user,
    }),
    payload.find({
      collection: 'invoices',
      depth: 1,
      limit: 50,
      overrideAccess: false,
      sort: '-createdAt',
      user,
    }),
  ])

  return (
    <OperationsDashboard
      currentUser={{ name: user.name || user.email, role: user.role }}
      invoices={invoices.docs}
      shipments={shipments.docs}
    />
  )
}
