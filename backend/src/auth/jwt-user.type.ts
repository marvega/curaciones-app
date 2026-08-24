import { OrgRole } from '../organizations/organization-membership.entity';

/**
 * Shape returned by JwtStrategy.validate() and surfaced by @CurrentUser().
 * Centralized here to avoid drift across controllers that need different
 * subsets of the JWT payload.
 */
export interface JwtUser {
  id: number;
  sub: number;
  username: string;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  establishmentIds: string[];
  jti: string;
}
