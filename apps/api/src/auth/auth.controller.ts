import { Body, Controller, Get, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DB } from '../common/config';
import { verifyPassword } from '../common/password';
import { ZodPipe } from '../common/zod.pipe';
import { Db, withContext } from '../db/client';
import { users } from '../db/schema';
import { Role } from '../domain/workflow';
import { CurrentUser, Public } from './auth.guard';
import { AuthUser } from './auth.types';

const LoginBody = z.object({ email: z.string().email(), password: z.string().min(1) });

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body(new ZodPipe(LoginBody)) body: z.infer<typeof LoginBody>) {
    const rows = await this.db.execute<{
      id: string;
      name: string;
      role: Role;
      organization_id: string | null;
      password_hash: string;
      is_active: boolean;
    }>(sql`select * from auth_lookup(${body.email})`);
    const found = rows.rows[0];
    // Same message for an unknown email and a wrong password.
    if (!found || !found.is_active || !(await verifyPassword(body.password, found.password_hash))) {
      throw new UnauthorizedException({ code: 'invalid_credentials', message: 'Email or password is wrong.' });
    }
    const user: AuthUser = { id: found.id, name: found.name, role: found.role, organizationId: found.organization_id };
    await withContext(this.db, { kind: 'system' }, (tx) =>
      tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)),
    );
    const token = await this.jwt.signAsync(
      { sub: user.id, name: user.name, role: user.role, organizationId: user.organizationId },
      { expiresIn: '8h' },
    );
    return { token, user };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
