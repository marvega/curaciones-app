/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/no-explicit-any */
// oidc-provider's runtime ctx and Grant model are dynamically typed; the
// casts here are localized to this integration boundary.
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';

@Injectable()
export class OAuthGrantService {
  // The repo injection is preserved for the future consent-reuse path
  // (skip-prompt when an unrevoked grant covers the requested scopes); the
  // current arrow function only consults runtime state to keep oidc-provider
  // happy on the post-consent resume.
  constructor(
    @InjectRepository(OAuthGrant) private readonly repo: Repository<OAuthGrant>,
  ) {}

  loadExistingGrant = async (ctx: any): Promise<any | undefined> => {
    // After our SPA POSTs to /oauth/consent/:uid we save a runtime Grant via
    // `provider.Grant({...}).save()` and stash its id on
    // `interaction.result.consent.grantId`. The provider's `resume.js` then
    // copies the result into `ctx.oidc.result`. When `loadGrant` runs, we
    // pick it up here so the consent-policy checks see the scopes the user
    // approved and the authorization request can issue a code instead of
    // re-prompting.
    const grantId: string | undefined = ctx?.oidc?.result?.consent?.grantId;
    if (grantId) {
      const grant = await ctx.oidc.provider.Grant.find(grantId);
      if (grant) return grant;
    }
    // Otherwise we have no record — letting `loadGrant` create a fresh
    // (empty) Grant is correct: its scopes are empty, the consent policy
    // requests an interaction, and the user is shown the consent screen.
    return undefined;
  };
}
