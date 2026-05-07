/* eslint-disable @typescript-eslint/no-explicit-any,
                  @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-call,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/no-unsafe-argument */
// oidc-provider's runtime models (Interaction, Grant) are not statically
// typed — every integration point requires `as any`. The casts are localized
// to this file so the rest of the OAuth code stays strict.
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import { OidcProviderSingleton } from '../oidc-provider.singleton';
import { ConsentService } from './consent.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthClient } from '../entities/oauth-client.entity';
import {
  OrganizationMembership,
  MembershipStatus,
} from '../../organizations/organization-membership.entity';
import { Organization } from '../../organizations/organization.entity';

const SCOPE_LABELS: Record<string, { label: string; description: string }> = {
  'patients:read': {
    label: 'Leer pacientes',
    description: 'Buscar y consultar pacientes y su historial.',
  },
  'patients:write': {
    label: 'Editar pacientes',
    description: 'Crear y modificar pacientes.',
  },
  'clinical:read': {
    label: 'Leer datos clínicos',
    description: 'Consultar curaciones, notas de heridas y ciclos.',
  },
  'clinical:write': {
    label: 'Editar fichas clínicas',
    description: 'Crear y editar curaciones y notas de heridas.',
  },
  'agenda:read': {
    label: 'Leer agenda',
    description: 'Ver citas y disponibilidad.',
  },
  'agenda:write': {
    label: 'Editar agenda',
    description: 'Crear, modificar y cancelar citas.',
  },
  'inventory:read': {
    label: 'Leer inventario',
    description: 'Consultar productos, lotes y conteos.',
  },
  'inventory:write': {
    label: 'Editar inventario',
    description: 'Modificar stock y registrar conteos.',
  },
  'reports:read': {
    label: 'Leer reportes',
    description: 'Generar y exportar reportes.',
  },
  'org:admin': {
    label: 'Administrar organización',
    description: 'Gestionar miembros, roles e invitaciones.',
  },
};

@Controller('oauth/consent')
@UseGuards(JwtAuthGuard)
export class ConsentController {
  constructor(
    private readonly oidc: OidcProviderSingleton,
    private readonly consent: ConsentService,
    @InjectRepository(OAuthClient)
    private readonly clientRepo: Repository<OAuthClient>,
    @InjectRepository(OrganizationMembership)
    private readonly memRepo: Repository<OrganizationMembership>,
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
  ) {}

  @Get(':uid')
  async getInteraction(
    @Param('uid') uid: string,
    @CurrentUser() user: any,
  ) {
    const provider: any = this.oidc.get();
    const interaction = await provider.Interaction.find(uid);
    if (!interaction) throw new NotFoundException('Interaction not found');

    const params = interaction.params ?? {};
    const clientId: string = params.client_id ?? params.clientId;
    const client = await this.clientRepo.findOne({ where: { clientId } });
    if (!client) throw new NotFoundException('Client not found');

    const requestedScopes: string[] = String(params.scope ?? '')
      .split(/\s+/)
      .filter(Boolean);
    const functionalScopes = requestedScopes.filter((s) => SCOPE_LABELS[s]);

    const memberships = await this.memRepo.find({
      where: { userId: user.id, status: MembershipStatus.ACTIVE },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    const orgs = orgIds.length
      ? await this.orgRepo.findByIds(orgIds)
      : [];

    return {
      client: {
        name: client.clientName,
        logoUri: client.logoUri,
        policyUri: client.policyUri,
        tosUri: client.tosUri,
        redirectUri: params.redirect_uri,
        verified: client.firstAuthorizedAt !== null,
      },
      scopes: functionalScopes.map((s) => ({ id: s, ...SCOPE_LABELS[s] })),
      user: { id: user.id, username: user.username, fullName: user.username },
      organizations: orgs.map((o) => {
        const m = memberships.find((mm) => mm.organizationId === o.id)!;
        return { id: o.id, name: o.name, role: m.role };
      }),
      preselectedOrganizationId:
        user.organizationId ?? (orgs[0]?.id ?? ''),
    };
  }

  @Post(':uid')
  async submit(
    @Param('uid') uid: string,
    @Body() body: { approved: boolean; organizationId?: string },
    @CurrentUser() user: any,
  ): Promise<{ redirectTo: string }> {
    const provider: any = this.oidc.get();
    const interaction = await provider.Interaction.find(uid);
    if (!interaction) throw new NotFoundException('Interaction not found');

    if (!body.approved) {
      // Manually persist the interaction result rather than calling
      // `provider.interactionResult(req, res, ...)` — that method reads the
      // signed `_interaction` cookie from `req`, which the browser does NOT
      // send to `/oauth/consent/:uid` (the cookie is path-scoped to the SPA
      // route `/account/oauth/consent`). Saving by uid achieves the same
      // outcome and keeps the SPA -> API contract clean.
      interaction.result = {
        error: 'access_denied',
        error_description: 'User rejected consent',
      };
      await this.persistInteraction(interaction);
      return { redirectTo: interaction.returnTo };
    }
    if (!body.organizationId) {
      throw new BadRequestException('organizationId required');
    }

    const params = interaction.params ?? {};
    const clientId: string = params.client_id ?? params.clientId;
    const requestedScopes: string[] = String(params.scope ?? '')
      .split(/\s+/)
      .filter(Boolean);
    await this.consent.recordConsent({
      clientId,
      userId: user.id,
      organizationId: body.organizationId,
      scopes: requestedScopes,
    });

    const Grant = provider.Grant;
    const grant = new Grant({
      accountId: String(user.id),
      clientId,
    });
    requestedScopes.forEach((s: string) => grant.addOIDCScope(s));
    grant.organizationId = body.organizationId;
    const grantId = await grant.save();

    interaction.result = {
      login: { accountId: String(user.id) },
      consent: { grantId, organizationId: body.organizationId },
    };
    await this.persistInteraction(interaction);

    await this.clientRepo.update(
      { clientId },
      { firstAuthorizedAt: () => 'COALESCE("firstAuthorizedAt", now())' },
    );
    return { redirectTo: interaction.returnTo };
  }

  private async persistInteraction(interaction: any): Promise<void> {
    // `interaction.exp` is an absolute epoch (seconds). Translate to remaining
    // TTL seconds — same shape the provider's own `interactionResult` uses.
    const nowSec = Math.floor(Date.now() / 1000);
    const remaining = Math.max(1, interaction.exp - nowSec);
    await interaction.save(remaining);
  }
}
