import { Reflector } from '@nestjs/core';
import { AuthController } from '../auth/auth.controller';
import { OAuthTokenController } from '../oauth/controllers/oauth-token.controller';
import { OAuthRegisterController } from '../oauth/controllers/oauth-register.controller';
import { OAuthCleanupController } from '../oauth/controllers/oauth-cleanup.controller';
import {
  THROTTLE_IDENTITY_KEY,
  ThrottleIdentitySource,
} from './throttle-identity.decorator';

/**
 * The declarations themselves, read off the real controllers.
 *
 * Why this exists separately from the behavioural tests. Every other test of
 * the tracker drives a purpose-built stub controller, because booting AppModule
 * needs a database, oidc-provider and an ESM loader flag. A stub carries its own
 * copy of the annotation, so deleting `@ThrottleIdentity` from the *real*
 * `AuthController.login` would leave all of them green while production lost
 * per-account login capping — the exact silent failure the fix exists to
 * prevent. This suite reads the metadata off the shipped classes, so the
 * mutation is caught where it happens.
 *
 * It is also the inventory. Every route that declares a discriminator is listed
 * with the field it declares, and the routes that deliberately declare nothing
 * are listed as such, so "should this endpoint have one?" is answered by a file
 * rather than by reading twelve controllers.
 */
const reflector = new Reflector();

function declaredSources(
  target: object,
  method: string,
): ThrottleIdentitySource[] | undefined {
  const handler = (target as Record<string, unknown>)[method];
  if (typeof handler !== 'function') {
    throw new Error(`No handler named '${method}' — was the route renamed?`);
  }
  return reflector.get<ThrottleIdentitySource[] | undefined>(
    THROTTLE_IDENTITY_KEY,
    handler,
  );
}

describe('@ThrottleIdentity declarations on the real routes', () => {
  describe('AuthController', () => {
    const proto = AuthController.prototype;

    it.each([
      // The account being logged into. Without this, one shared 5-per-minute
      // bucket for the whole clinic.
      ['login', 'usernameOrEmail'],
      // One session's refresh rate, not the clinic's.
      ['refresh', 'refreshToken'],
      // Per email, so one address being hammered cannot deny recovery to all.
      ['forgotPassword', 'email'],
      // Per recovery / invitation attempt in flight.
      ['resetPassword', 'token'],
      ['previewInvitation', 'token'],
      ['acceptInvitation', 'token'],
    ])('%s declares the %s body field', (method, field) => {
      expect(declaredSources(proto, method)).toEqual([{ kind: 'body', field }]);
    });

    it.each([
      // Authenticated routes: the bearer token already keys the bucket on
      // `user:<sub>`, and a body field would be a way around it.
      'logout',
      'logoutAll',
      'switchOrg',
      'changePassword',
    ])(
      '%s declares nothing, because a verified bearer already keys it',
      (method) => {
        expect(declaredSources(proto, method)).toBeUndefined();
      },
    );
  });

  describe('OAuthTokenController', () => {
    const proto = OAuthTokenController.prototype;

    it.each(['token', 'revoke'])(
      '%s declares client_id, then the HTTP Basic credential',
      (method) => {
        expect(declaredSources(proto, method)).toEqual([
          { kind: 'body', field: 'client_id' },
          { kind: 'basic-auth-client-id' },
        ]);
      },
    );

    it('userinfo declares nothing: it has no body, only a bearer', () => {
      expect(declaredSources(proto, 'userinfo')).toBeUndefined();
    });
  });

  describe('routes that must stay on the shared-IP bucket', () => {
    it('dynamic client registration declares nothing', () => {
      // Every field of a DCR body is invented by the caller and names no
      // pre-existing identity, so any declaration here would void the 10/hour
      // cap on a publicly writable table. Measured before the fix: appending a
      // `client_id` field turned 5 registrations into 5 buckets.
      expect(
        declaredSources(OAuthRegisterController.prototype, 'register'),
      ).toBeUndefined();
    });

    it('the cleanup hook declares nothing', () => {
      // Its own comment requires the counter to advance before and
      // independently of the authorisation logic, so the limit is never an
      // oracle for token validity. A discriminator read from the request would
      // break that.
      expect(
        declaredSources(OAuthCleanupController.prototype, 'run'),
      ).toBeUndefined();
    });
  });
});
