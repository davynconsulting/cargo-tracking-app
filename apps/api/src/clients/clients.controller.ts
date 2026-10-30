import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/auth.guard';
import { AuthUser, contextFor } from '../auth/auth.types';
import { DB } from '../common/config';
import { isUniqueViolation, NotFound, RuleViolation } from '../common/errors';
import { audit } from '../common/journal';
import { hashPassword } from '../common/password';
import { ZodPipe } from '../common/zod.pipe';
import { Db, withContext } from '../db/client';
import { consents, contacts, notifications, organizations, users } from '../db/schema';
import { STAFF_ROLES } from '../domain/workflow';
import { retryNotification } from '../notifications/outbox';

const phone = z.string().regex(/^\+[1-9]\d{7,14}$/, 'Use international format, e.g. +255754987321');

const CreateClientBody = z.object({
  legalName: z.string().min(2).max(200),
  clientCode: z.string().regex(/^[A-Z0-9]{2,10}$/, 'Use 2 to 10 capital letters or digits'),
  taxId: z.string().max(64).optional(),
  billingAddress: z.string().max(500).optional(),
  billingTermsDays: z.number().int().min(0).max(180).optional(),
  preferredLanguage: z.string().min(2).max(5).default('en'),
  timezone: z.string().default('Africa/Dar_es_Salaam'),
  primaryContact: z.object({
    name: z.string().min(2).max(128),
    phone,
    email: z.string().email().optional(),
    whatsappOptIn: z.boolean().default(false),
    /** Where the opt-in was captured, e.g. "signed onboarding form 2026-10-30". Required when opting in. */
    consentSource: z.string().max(200).optional(),
  }),
  portalPassword: z.string().min(10).optional(),
});

const ConsentBody = z.object({
  channel: z.enum(['whatsapp', 'push', 'email']),
  optedIn: z.boolean(),
  source: z.string().min(3).max(200),
});

@Controller()
export class ClientsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Roles('admin', 'ops_manager')
  @Post('clients')
  create(@CurrentUser() user: AuthUser, @Body(new ZodPipe(CreateClientBody)) body: z.infer<typeof CreateClientBody>) {
    const { primaryContact: pc, portalPassword, ...org } = body;
    if (pc.whatsappOptIn && !pc.consentSource) {
      throw new RuleViolation('consent_source_required', 'Say where the WhatsApp opt-in was captured.');
    }
    return withContext(this.db, contextFor(user), async (tx) => {
      let created: typeof organizations.$inferSelect;
      try {
        [created] = await tx.insert(organizations).values({ ...org, accountManagerId: user.id }).returning();
      } catch (err) {
        if (isUniqueViolation(err)) throw new RuleViolation('duplicate_client_code', 'That client code is taken.');
        throw err;
      }
      let portalUserId: string | null = null;
      if (portalPassword && pc.email) {
        const [u] = await tx
          .insert(users)
          .values({ email: pc.email, name: pc.name, role: 'client', organizationId: created.id, phone: pc.phone, passwordHash: await hashPassword(portalPassword) })
          .returning();
        portalUserId = u.id;
      }
      const [contact] = await tx
        .insert(contacts)
        .values({
          organizationId: created.id,
          userId: portalUserId,
          name: pc.name,
          phone: pc.phone,
          email: pc.email,
          locale: body.preferredLanguage,
          timezone: body.timezone,
          isPrimary: true,
          whatsappOptIn: pc.whatsappOptIn,
          emailOptIn: !!pc.email,
        })
        .returning();
      if (pc.whatsappOptIn) {
        await tx.insert(consents).values({ organizationId: created.id, contactId: contact.id, channel: 'whatsapp', optedIn: true, phone: pc.phone, source: pc.consentSource!, recordedBy: user.id });
      }
      await audit(tx, { actorUserId: user.id, organizationId: created.id, action: 'client.create', entity: 'organization', entityId: created.id });
      return { ...created, primaryContact: contact };
    });
  }

  @Roles(...STAFF_ROLES)
  @Get('clients')
  list(@CurrentUser() user: AuthUser) {
    return withContext(this.db, contextFor(user), (tx) => tx.select().from(organizations).orderBy(organizations.legalName));
  }

  @Roles(...STAFF_ROLES, 'client')
  @Get('clients/:id/contacts')
  contacts(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return withContext(this.db, contextFor(user), (tx) => tx.select().from(contacts).where(eq(contacts.organizationId, id)));
  }

  /** Every change is kept as its own consent record with its source (FRS 7.1). */
  @Roles('ops_manager', 'admin', 'client')
  @Put('contacts/:id/consent')
  consent(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(ConsentBody)) body: z.infer<typeof ConsentBody>) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const [contact] = await tx.select().from(contacts).where(eq(contacts.id, id)).for('update');
      if (!contact) throw new NotFound('Contact');
      if (body.channel === 'email' && body.optedIn && !contact.email) throw new RuleViolation('no_email', 'Add an email address first.');
      const field = body.channel === 'whatsapp' ? 'whatsappOptIn' : body.channel === 'push' ? 'pushEnabled' : 'emailOptIn';
      const [updated] = await tx.update(contacts).set({ [field]: body.optedIn }).where(eq(contacts.id, id)).returning();
      await tx.insert(consents).values({
        organizationId: contact.organizationId,
        contactId: id,
        channel: body.channel,
        optedIn: body.optedIn,
        phone: contact.phone,
        source: body.source,
        recordedBy: user.id,
      });
      return updated;
    });
  }

  @Roles(...STAFF_ROLES, 'client')
  @Get('notifications')
  notifications(@CurrentUser() user: AuthUser, @Query('shipmentId', new ParseUUIDPipe({ optional: true })) shipmentId?: string) {
    return withContext(this.db, contextFor(user), (tx) =>
      tx
        .select({
          id: notifications.id,
          shipmentId: notifications.shipmentId,
          channel: notifications.channel,
          template: notifications.template,
          locale: notifications.locale,
          body: notifications.body,
          status: notifications.status,
          attemptCount: notifications.attemptCount,
          errorCode: notifications.errorCode,
          createdAt: notifications.createdAt,
          lastAttemptAt: notifications.lastAttemptAt,
          recipient: contacts.name,
        })
        .from(notifications)
        .innerJoin(contacts, eq(contacts.id, notifications.recipientContactId))
        .where(shipmentId ? and(eq(notifications.shipmentId, shipmentId)) : undefined)
        .orderBy(desc(notifications.createdAt))
        .limit(200),
    );
  }

  @Roles('ops_manager')
  @Post('notifications/:id/retry')
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return withContext(this.db, contextFor(user), async (tx) => {
      const row = await retryNotification(tx, id);
      if (!row) throw new NotFound('Failed message');
      return row;
    });
  }
}
