import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import {
  Reflector,
  DiscoveryService,
  DiscoveryModule,
  MetadataScanner,
} from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { REQUIRED_SCOPES_KEY } from '../../src/oauth/decorators/required-scopes.decorator';
import { NO_OAUTH_ACCESS_KEY } from '../../src/oauth/decorators/no-oauth-access.decorator';

// Endpoints under these prefixes are infrastructure / IAM surfaces that don't
// represent domain data and therefore are intentionally NOT gated by OAuth
// scopes:
//
//   /api/auth/   — first-party SPA login/refresh/invite/password endpoints
//                  (whole AuthController is @NoOAuthAccess)
//   /api/health  — liveness probe; returns no tenant data
//   /oauth/      — the OAuth Authorization Server endpoints themselves
//   /.well-known/, /jwks.json — OIDC discovery (publicly readable)
//
// NOTE: `/api/account/connected-apps` will be added back when Phase 9 lands.
const EXEMPT_PATH_PREFIXES = [
  '/api/auth/',
  '/api/health',
  '/oauth/',
  '/.well-known/',
  '/jwks.json',
];

describe('OAuth scope coverage', () => {
  it(
    'every domain endpoint has @RequiredScopes or @NoOAuthAccess',
    async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule, DiscoveryModule],
      }).compile();

      const reflector = moduleRef.get(Reflector);
      const discovery = moduleRef.get(DiscoveryService);
      const scanner = moduleRef.get(MetadataScanner);

      const offenders: string[] = [];
      const controllers = discovery.getControllers();

      for (const wrapper of controllers) {
        const instance = wrapper.instance;
        if (!instance || typeof instance !== 'object') continue;
        const proto = Object.getPrototypeOf(instance);
        const ctor = (instance as any).constructor;

        const classNoAccess = reflector.get<boolean>(
          NO_OAUTH_ACCESS_KEY,
          ctor,
        );
        if (classNoAccess) continue;

        const classRequired = reflector.get<string[] | undefined>(
          REQUIRED_SCOPES_KEY,
          ctor,
        );

        const classPath: string =
          (Reflect.getMetadata('path', ctor) as string | string[] | undefined) instanceof
          Array
            ? ((Reflect.getMetadata('path', ctor) as string[])[0] ?? '')
            : ((Reflect.getMetadata('path', ctor) as string | undefined) ?? '');

        scanner.scanFromPrototype(instance, proto, (methodName: string) => {
          const handler = (proto as any)[methodName];
          if (typeof handler !== 'function') return;
          // Only consider Nest route handlers (have a 'method' metadata).
          const httpMethod = Reflect.getMetadata('method', handler);
          if (httpMethod === undefined) return;

          const handlerPathRaw = Reflect.getMetadata('path', handler);
          const handlerPath: string = Array.isArray(handlerPathRaw)
            ? handlerPathRaw[0] ?? ''
            : handlerPathRaw ?? '';
          const fullPath = ('/' + classPath + '/' + handlerPath).replace(
            /\/+/g,
            '/',
          );

          if (EXEMPT_PATH_PREFIXES.some((p) => fullPath.startsWith(p))) return;

          const scopes = reflector.get<string[]>(REQUIRED_SCOPES_KEY, handler);
          const noAccess = reflector.get<boolean>(NO_OAUTH_ACCESS_KEY, handler);

          if (!scopes && !noAccess && !classRequired) {
            offenders.push(`${ctor.name}.${methodName} (${fullPath})`);
          }
        });
      }

      await moduleRef.close();

      if (offenders.length > 0) {
        throw new Error(
          'Endpoints lacking @RequiredScopes or @NoOAuthAccess:\n' +
            offenders.join('\n'),
        );
      }
    },
    30000,
  );
});
