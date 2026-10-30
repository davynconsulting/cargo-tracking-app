import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, Public, Roles } from '../auth/auth.guard';
import { AuthUser, contextFor } from '../auth/auth.types';
import { DB } from '../common/config';
import { NotFound, RuleViolation } from '../common/errors';
import { audit } from '../common/journal';
import { ZodPipe } from '../common/zod.pipe';
import { Db, SYSTEM, withContext } from '../db/client';
import { documents, shipments } from '../db/schema';
import { detectMime, FILE_STORE, FileStore, MAX_UPLOAD_BYTES } from './storage';

const DOCUMENT_TYPES = ['bill_of_lading', 'delivery_order', 'customs_entry', 'release_order', 'gate_pass', 'packing_list', 'commercial_invoice', 'pod', 'photo', 'receipt', 'other'] as const;
const UploadBody = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  clientVisible: z.enum(['true', 'false']).default('true'),
  replacesDocumentId: z.string().uuid().optional(),
});
const LINK_TTL_SECONDS = 300;

@Controller()
export class DocumentsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(FILE_STORE) private readonly store: FileStore,
    private readonly jwt: JwtService,
  ) {}

  @Roles('ops_manager', 'documentation', 'clearing_agent', 'transport', 'finance', 'driver')
  @Post('shipments/:id/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) shipmentId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodPipe(UploadBody)) body: z.infer<typeof UploadBody>,
  ) {
    if (!file) throw new RuleViolation('missing_file', 'Attach a file in the "file" field.');
    const mime = detectMime(file.buffer);
    if (!mime) throw new RuleViolation('unsupported_file', 'Upload a PDF, JPEG, PNG or WebP file.');

    return withContext(this.db, contextFor(user), async (tx) => {
      const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId));
      if (!shipment) throw new NotFound('Shipment');
      let version = 1;
      if (body.replacesDocumentId) {
        const [previous] = await tx.select().from(documents).where(eq(documents.id, body.replacesDocumentId));
        if (!previous || previous.shipmentId !== shipmentId) throw new NotFound('Document to replace');
        version = previous.version + 1;
      }
      const { key, sha256 } = await this.store.put(file.buffer);
      const [doc] = await tx
        .insert(documents)
        .values({
          organizationId: shipment.organizationId,
          shipmentId,
          documentType: body.documentType,
          fileStorageKey: key,
          fileName: file.originalname.slice(0, 200),
          mimeType: mime,
          sizeBytes: file.size,
          sha256,
          clientVisible: body.clientVisible === 'true',
          uploadedBy: user.id,
          version,
          replacesDocumentId: body.replacesDocumentId,
        })
        .returning();
      await audit(tx, { actorUserId: user.id, organizationId: shipment.organizationId, action: 'document.upload', entity: 'document', entityId: doc.id });
      const { fileStorageKey: _key, ...visible } = doc;
      return visible;
    });
  }

  /** Access is checked here, under the caller's row-level security; the link itself expires in 5 minutes (AC-16). */
  @Get('documents/:id/link')
  async link(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const doc = await withContext(this.db, contextFor(user), async (tx) => {
      const [row] = await tx.select().from(documents).where(eq(documents.id, id));
      return row && (user.role !== 'client' || row.clientVisible) ? row : null;
    });
    if (!doc) throw new NotFound('Document');
    const token = await this.jwt.signAsync({ typ: 'file', doc: doc.id, sub: user.id }, { expiresIn: LINK_TTL_SECONDS });
    return { url: `/files/${token}`, expiresAt: new Date(Date.now() + LINK_TTL_SECONDS * 1000) };
  }

  @Public()
  @Get('files/:token')
  async download(@Param('token') token: string, @Res() res: Response) {
    let docId: string;
    try {
      const payload = await this.jwt.verifyAsync<{ typ: string; doc: string }>(token);
      if (payload.typ !== 'file') throw new Error('wrong token type');
      docId = payload.doc;
    } catch {
      throw new UnauthorizedException({ code: 'link_expired', message: 'This download link has expired. Open the document again.' });
    }
    const doc = await withContext(this.db, SYSTEM, async (tx) => (await tx.select().from(documents).where(eq(documents.id, docId)))[0]);
    if (!doc) throw new NotFound('Document');
    const content = await this.store.get(doc.fileStorageKey);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName.replace(/[^\w.\- ]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(content);
  }
}
