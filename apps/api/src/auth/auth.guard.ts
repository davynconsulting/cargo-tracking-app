import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../domain/workflow';
import { AuthUser } from './auth.types';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'public';

/** Restricts a route to these roles. Routes without it are open to any signed-in user. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user;
});

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException({ code: 'unauthenticated', message: 'Sign in first.' });
    try {
      const payload = await this.jwt.verifyAsync<AuthUser & { sub: string; typ?: string }>(token);
      if (payload.typ) throw new Error('not a session token');
      req.user = { id: payload.sub, name: payload.name, role: payload.role, organizationId: payload.organizationId };
    } catch {
      throw new UnauthorizedException({ code: 'unauthenticated', message: 'Your session has expired. Sign in again.' });
    }

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles && !roles.includes(req.user.role)) {
      throw new ForbiddenException({ code: 'forbidden', message: 'Your role cannot do this.' });
    }
    return true;
  }
}
