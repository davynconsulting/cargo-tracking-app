'use client'

import type { Invoice, Shipment } from '@/payload-types'
import { useMemo, useState, type ReactNode } from 'react'

const milestoneLabels: Record<string, string> = {
  onboarding: 'Client onboarding',
  registration: 'Shipment registered',
  'vessel-arrival': 'Vessel arrived',
  discharge: 'Container discharged',
  'port-processing': 'Port processing',
  'truck-allocation': 'Truck allocated',
  loading: 'Loaded',
  'customs-release': 'Customs released',
  'gate-out': 'Gate-out',
  'road-transit': 'Road transit',
  'destination-arrival': 'Destination arrival',
  'offloading-return': 'Offload & return',
  'invoice-payment': 'Invoice & payment',
  closure: 'Shipment closed',
}

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
  delayed: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  completed: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  'on-hold': 'bg-rose-50 text-rose-700 ring-rose-600/20',
  draft: 'bg-slate-100 text-slate-600 ring-slate-500/15',
}

type IconName =
  | 'bell'
  | 'box'
  | 'chevron'
  | 'clock'
  | 'document'
  | 'finance'
  | 'grid'
  | 'help'
  | 'location'
  | 'search'
  | 'settings'
  | 'ship'
  | 'truck'
  | 'users'

const iconPaths: Record<IconName, ReactNode> = {
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  box: (
    <>
      <path d="m21 8-9 5-9-5" />
      <path d="M3 8l9-5 9 5v8l-9 5-9-5Z" />
      <path d="M12 13v8" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  document: (
    <>
      <path d="M6 2h8l4 4v16H6Z" />
      <path d="M14 2v5h5M9 13h6M9 17h4" />
    </>
  ),
  finance: (
    <>
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.4 2.4 0 1 1 3.2 2.3c-.7.3-1 1-1 1.7M12 17h.01" />
    </>
  ),
  location: (
    <>
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.7V21h-4v-.1A1.8 1.8 0 0 0 8.8 19a1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.7-1.1H2v-4h.1A1.8 1.8 0 0 0 4 8.4a1.8 1.8 0 0 0-.4-2l-.1-.1 2.8-2.8.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 9.5 2.3V2h4v.1A1.8 1.8 0 0 0 14.6 4a1.8 1.8 0 0 0 2-.4l.1-.1 2.8 2.8-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.7 1.1h.3v4h-.1A1.8 1.8 0 0 0 19.4 15Z" />
    </>
  ),
  ship: (
    <>
      <path d="m3 18 3-2 3 2 3-2 3 2 3-2 3 2" />
      <path d="M5 14V8h14v6M9 8V4h6v4" />
    </>
  ),
  truck: (
    <>
      <path d="M3 6h11v11H3Z" />
      <path d="M14 10h4l3 3v4h-7Z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
}

function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  )
}

function getClientName(shipment: Shipment) {
  return typeof shipment.client === 'object' ? shipment.client.organization : 'Client'
}

function shortDate(value?: string | null, withTime = false) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value))
}

function formatMoney(value: number | null | undefined, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value ?? 0)
}

function KpiCard({
  icon,
  label,
  value,
  note,
  tone,
}: {
  icon: IconName
  label: string
  value: string
  note: string
  tone: 'green' | 'orange' | 'blue' | 'slate'
}) {
  const tones = {
    green: 'bg-emerald-50 text-emerald-700',
    orange: 'bg-orange-50 text-orange-700',
    blue: 'bg-sky-50 text-sky-700',
    slate: 'bg-slate-100 text-slate-700',
  }
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="mb-5 flex items-start justify-between">
        <div className={`grid size-10 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon name={icon} />
        </div>
        <span className="text-xs font-medium text-slate-400">Live</span>
      </div>
      <p className="text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
      <p className="mt-1 text-xs text-slate-400">{note}</p>
    </div>
  )
}

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  operations: 'Operations',
  finance: 'Finance',
  'client-service': 'Client service',
}

function initials(name: string) {
  return (
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  )
}

export function OperationsDashboard({
  shipments,
  invoices,
  currentUser,
}: {
  shipments: Shipment[]
  invoices: Invoice[]
  currentUser: { name: string; role?: string | null }
}) {
  const preferred =
    shipments.find((shipment) => shipment.reference === 'NGB-250184') ?? shipments[0]
  const [selectedId, setSelectedId] = useState<string | number | undefined>(preferred?.id)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const selected = shipments.find((shipment) => shipment.id === selectedId) ?? preferred

  const visibleShipments = useMemo(() => {
    const term = search.toLowerCase().trim()
    return shipments.filter((shipment) => {
      const matchesFilter = filter === 'all' || shipment.status === filter
      const matchesSearch =
        !term ||
        [shipment.reference, shipment.origin, shipment.destination, getClientName(shipment)].some(
          (value) => value.toLowerCase().includes(term),
        )
      return matchesFilter && matchesSearch
    })
  }, [filter, search, shipments])

  const activeCount = shipments.filter((shipment) => shipment.status === 'active').length
  const delayCount = shipments.filter((shipment) => shipment.status === 'delayed').length
  const pendingDocs = shipments
    .flatMap((shipment) => shipment.documentChecklist ?? [])
    .filter((doc) => doc.status === 'missing' || doc.status === 'invalid').length
  // Balances are in different currencies, so total them per currency rather than adding TZS to USD.
  const openInvoices = invoices.filter((invoice) => (invoice.balance ?? 0) > 0)
  const outstandingByCurrency = openInvoices.reduce<Record<string, number>>((totals, invoice) => {
    totals[invoice.currency] = (totals[invoice.currency] ?? 0) + (invoice.balance ?? 0)
    return totals
  }, {})
  const outstandingUsd = outstandingByCurrency.USD ?? 0
  const otherOutstanding = Object.entries(outstandingByCurrency)
    .filter(([currency]) => currency !== 'USD')
    .map(([currency, amount]) => formatMoney(amount, currency))
  const completedMilestones =
    selected?.milestones?.filter((item) => item.status === 'completed').length ?? 0
  const progress = selected ? Math.round((completedMilestones / 14) * 100) : 0
  const latestMilestone = selected?.milestones?.at(-1)

  return (
    <div className="min-h-screen bg-[#f4f5f1] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#12352d] px-4 py-6 text-white lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="relative grid size-10 place-items-center rounded-xl bg-[#f5ad45] text-[#12352d] shadow-lg shadow-black/10">
            <Icon name="box" className="size-5" />
            <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-[#12352d] bg-[#f2793d]" />
          </div>
          <div>
            <p className="text-base font-bold tracking-wide">NGB LOGISTICS</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-100/60">
              Cargo operations
            </p>
          </div>
        </div>

        <nav className="mt-10 space-y-1" aria-label="Main navigation">
          {[
            ['grid', 'Overview', '/'],
            ['ship', 'Shipments', '/admin/collections/shipments'],
            ['users', 'Clients', '/admin/collections/clients'],
            ['truck', 'Fleet & drivers', '/admin/collections/shipments'],
            ['document', 'Documents', '/admin/collections/media'],
            ['finance', 'Finance', '/admin/collections/invoices'],
          ].map(([icon, label, href]) => (
            <a
              key={label}
              href={href}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${href === '/' ? 'bg-white/12 text-white' : 'text-emerald-50/65 hover:bg-white/7 hover:text-white'}`}
            >
              <Icon name={icon as IconName} className="size-[18px]" />
              {label}
              {label === 'Documents' && pendingDocs > 0 && (
                <span className="ml-auto rounded-full bg-[#f2793d] px-2 py-0.5 text-[10px] font-bold text-white">
                  {pendingDocs}
                </span>
              )}
            </a>
          ))}
        </nav>

        <div className="mt-auto space-y-1">
          <a
            href="/admin"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-50/65 transition hover:bg-white/7 hover:text-white"
          >
            <Icon name="settings" className="size-[18px]" />
            Admin workspace
          </a>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-emerald-50/65 transition hover:bg-white/7 hover:text-white"
            type="button"
          >
            <Icon name="help" className="size-[18px]" />
            Help & support
          </button>
          <a
            href="/admin/logout"
            title="Sign out"
            className="mt-4 flex items-center gap-3 border-t border-white/10 px-2 pt-5"
          >
            <div className="grid size-9 place-items-center rounded-full bg-[#f5ad45] text-xs font-bold text-[#12352d]">
              {initials(currentUser.name)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{currentUser.name}</p>
              <p className="text-xs text-emerald-100/50">
                {roleLabels[currentUser.role ?? ''] ?? 'Staff'}
              </p>
            </div>
            <Icon name="chevron" className="ml-auto size-4 text-white/40" />
          </a>
        </div>
      </aside>

      <main className="lg:ml-64">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-slate-200/80 bg-[#f4f5f1]/90 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <div className="grid size-9 place-items-center rounded-xl bg-[#12352d] text-[#f5ad45]">
              <Icon name="box" className="size-5" />
            </div>
            <span className="text-sm font-bold tracking-wide">NGB LOGISTICS</span>
          </div>
          <div className="relative hidden w-full max-w-md md:block">
            <Icon
              name="search"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white/70 pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:bg-white focus:ring-4 focus:ring-emerald-700/5"
              placeholder="Search shipments, clients or destinations"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              className="relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:text-slate-900"
              type="button"
              aria-label="Notifications"
            >
              <Icon name="bell" className="size-[18px]" />
              <span className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-white bg-[#f2793d]" />
            </button>
            <a
              href="/admin/collections/shipments/create"
              className="hidden h-10 items-center rounded-xl bg-[#12352d] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#19483d] sm:flex"
            >
              Register shipment
            </a>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 sm:py-9">
          <div className="mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                Operations center
              </p>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Good morning, Amina
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Here’s what’s moving across your network today.
              </p>
            </div>
            <p className="text-sm font-medium text-slate-500">Thursday, 29 October</p>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
            <KpiCard
              icon="ship"
              label="Active shipments"
              value={String(activeCount)}
              note="Across Dar es Salaam & Mombasa"
              tone="green"
            />
            <KpiCard
              icon="clock"
              label="Attention needed"
              value={String(delayCount)}
              note={delayCount ? 'Customs or document blockers' : 'No material delays'}
              tone="orange"
            />
            <KpiCard
              icon="document"
              label="Document issues"
              value={String(pendingDocs)}
              note="Missing or invalid items"
              tone="blue"
            />
            <KpiCard
              icon="finance"
              label="Outstanding"
              value={formatMoney(outstandingUsd)}
              note={[
                `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}`,
                ...otherOutstanding.map((amount) => `+ ${amount}`),
              ].join(' · ')}
              tone="slate"
            />
          </section>

          {selected ? (
            <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,.7fr)]">
              <div className="overflow-hidden rounded-2xl bg-[#173c32] text-white shadow-[0_14px_40px_rgba(18,53,45,0.15)]">
                <div className="relative overflow-hidden p-6 sm:p-8">
                  <div className="absolute -right-24 -top-28 size-80 rounded-full border border-white/5" />
                  <div className="absolute -right-10 -top-10 size-52 rounded-full border border-white/5" />
                  <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
                    <div>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-200">
                          {selected.status}
                        </span>
                        <span className="text-xs text-emerald-50/55">
                          Updated {shortDate(selected.updatedAt, true)}
                        </span>
                      </div>
                      <h2 className="text-2xl font-semibold tracking-tight">
                        {selected.reference}
                      </h2>
                      <p className="mt-1 text-sm text-emerald-50/60">
                        {getClientName(selected)} · {selected.cargoDescription}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 sm:text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-100/50">
                        Estimated arrival
                      </p>
                      <p className="mt-1 text-lg font-semibold">{shortDate(selected.eta, true)}</p>
                    </div>
                  </div>

                  <div className="relative mt-9 grid grid-cols-[auto_1fr_auto] items-center gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-emerald-100/45">Origin</p>
                      <p className="mt-1 text-sm font-semibold sm:text-base">{selected.origin}</p>
                    </div>
                    <div className="relative mx-2 h-px bg-white/20">
                      <span className="absolute left-0 top-1/2 size-2 -translate-y-1/2 rounded-full bg-[#f5ad45]" />
                      <span className="absolute left-[58%] top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#f5ad45] text-[#12352d] shadow-lg shadow-black/20">
                        <Icon name="truck" className="size-4" />
                      </span>
                      <span className="absolute right-0 top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-[#f5ad45] bg-[#173c32]" />
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wider text-emerald-100/45">
                        Destination
                      </p>
                      <p className="mt-1 text-sm font-semibold sm:text-base">
                        {selected.destination}
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 pt-5 text-xs text-emerald-50/65">
                    <span className="flex items-center gap-2">
                      <Icon name="location" className="size-4 text-[#f5ad45]" />
                      {latestMilestone?.location ?? selected.port ?? 'Location pending'}
                    </span>
                    <span className="flex items-center gap-2">
                      <Icon name="box" className="size-4 text-[#f5ad45]" />
                      {selected.containers?.[0]?.containerNumber ?? 'Container pending'}
                    </span>
                    <span className="flex items-center gap-2">
                      <Icon name="truck" className="size-4 text-[#f5ad45]" />
                      {selected.transport?.truck ?? 'Allocation pending'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-white/10 bg-black/10 px-6 py-5 sm:px-8">
                  <div className="mb-3 flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-50/80">Overall journey</span>
                    <span className="font-bold text-[#f5ad45]">{progress}% complete</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#f5ad45] transition-all"
                      style={{ width: `${Math.max(progress, 4)}%` }}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2 text-[10px] text-emerald-50/40 sm:grid-cols-7">
                    {[
                      'Registration',
                      'Arrival',
                      'Clearance',
                      'Dispatch',
                      'Transit',
                      'Delivery',
                      'Closure',
                    ].map((item, index) => (
                      <span
                        key={item}
                        className={index <= Math.floor(progress / 15) ? 'text-emerald-50/80' : ''}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                      Next action
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                      {milestoneLabels[selected.currentMilestone]}
                    </h2>
                  </div>
                  <div className="grid size-10 place-items-center rounded-xl bg-orange-50 text-orange-700">
                    <Icon name="clock" />
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  {latestMilestone?.notes ??
                    'Operational team to confirm the next milestone and client notification.'}
                </p>
                <div className="mt-5 space-y-3 border-t border-slate-100 pt-5">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-slate-400">Current location</span>
                    <span className="text-right font-semibold text-slate-700">
                      {latestMilestone?.location ?? selected.terminal ?? 'Pending update'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-slate-400">Customs status</span>
                    <span className="capitalize font-semibold text-slate-700">
                      {selected.clearance?.customsStatus?.replaceAll('-', ' ') ?? 'Not started'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-slate-400">Client notified</span>
                    <span className="font-semibold text-slate-700">
                      {latestMilestone?.clientNotification?.sentAt
                        ? shortDate(latestMilestone.clientNotification.sentAt, true)
                        : 'Not yet'}
                    </span>
                  </div>
                </div>
                {selected.clearance?.blockers && (
                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
                      Material blocker
                    </p>
                    <p className="mt-1.5 text-sm leading-5 text-amber-900">
                      {selected.clearance.blockers}
                    </p>
                  </div>
                )}
                <a
                  href={`/admin/collections/shipments/${selected.id}`}
                  className="mt-5 flex h-11 w-full items-center justify-center rounded-xl bg-[#12352d] text-sm font-semibold text-white transition hover:bg-[#19483d]"
                >
                  Open shipment record
                </a>
              </div>
            </section>
          ) : (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">
              No shipments are registered yet.
            </div>
          )}

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
            <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  Shipment portfolio
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {visibleShipments.length} records in view
                </p>
              </div>
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                {['all', 'active', 'delayed', 'completed'].map((item) => (
                  <button
                    key={item}
                    onClick={() => setFilter(item)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${filter === item ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left">
                <thead className="bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  <tr>
                    <th className="px-6 py-3.5">Shipment</th>
                    <th className="px-4 py-3.5">Route</th>
                    <th className="px-4 py-3.5">Current milestone</th>
                    <th className="px-4 py-3.5">ETA</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-6 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleShipments.map((shipment) => (
                    <tr
                      key={shipment.id}
                      onClick={() => setSelectedId(shipment.id)}
                      className={`cursor-pointer transition hover:bg-emerald-50/30 ${selected?.id === shipment.id ? 'bg-emerald-50/50' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-800">{shipment.reference}</p>
                        <p className="mt-1 text-xs text-slate-400">{getClientName(shipment)}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-slate-700">{shipment.origin}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                          <Icon name="location" className="size-3" />
                          {shipment.destination}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-slate-700">
                          {milestoneLabels[shipment.currentMilestone]}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {shipment.milestones?.at(-1)?.location ??
                            shipment.port ??
                            'Location pending'}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-700">
                        {shortDate(shipment.eta)}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${statusStyles[shipment.status ?? 'draft']}`}
                        >
                          {shipment.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Icon name="chevron" className="ml-auto size-4 text-slate-300" />
                      </td>
                    </tr>
                  ))}
                  {!visibleShipments.length && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">
                        No shipments match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-6 grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  Recent milestone activity
                </h2>
                <span className="text-xs font-semibold text-emerald-700">Live timeline</span>
              </div>
              <div className="mt-5 space-y-0">
                {shipments
                  .flatMap((shipment) =>
                    (shipment.milestones ?? []).map((milestone) => ({ ...milestone, shipment })),
                  )
                  .filter((item) => item.occurredAt)
                  .sort(
                    (a, b) => new Date(b.occurredAt!).getTime() - new Date(a.occurredAt!).getTime(),
                  )
                  .slice(0, 4)
                  .map((item, index) => (
                    <div
                      key={`${item.shipment.id}-${item.id}`}
                      className="relative flex gap-4 pb-5 last:pb-0"
                    >
                      {index < 3 && (
                        <span className="absolute left-[17px] top-9 h-[calc(100%-20px)] w-px bg-slate-200" />
                      )}
                      <div
                        className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full ${item.status === 'blocked' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
                      >
                        <Icon
                          name={item.status === 'blocked' ? 'clock' : 'location'}
                          className="size-4"
                        />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-800">
                            {milestoneLabels[item.milestone]}
                          </p>
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {shortDate(item.occurredAt, true)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {item.shipment.reference} ·{' '}
                          {item.notes ?? item.location ?? 'Milestone update recorded'}
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight text-slate-950">
                  Finance snapshot
                </h2>
                <a
                  href="/admin/collections/invoices"
                  className="text-xs font-semibold text-emerald-700"
                >
                  View invoices
                </a>
              </div>
              <div className="mt-5 space-y-3">
                {invoices.slice(0, 3).map((invoice) => {
                  const relatedShipment =
                    typeof invoice.shipment === 'object' ? invoice.shipment : undefined
                  return (
                    <div
                      key={invoice.id}
                      className="flex items-center gap-4 rounded-xl border border-slate-100 p-4"
                    >
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                        <Icon name="document" className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">
                          {invoice.invoiceNumber}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {relatedShipment?.reference ?? 'Shipment'} · Due{' '}
                          {shortDate(invoice.dueDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">
                          {formatMoney(invoice.amount, invoice.currency)}
                        </p>
                        <p
                          className={`mt-0.5 text-[10px] font-bold uppercase ${invoice.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}
                        >
                          {invoice.status}
                        </p>
                      </div>
                    </div>
                  )
                })}
                {!invoices.length && (
                  <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
                    No invoices issued.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
