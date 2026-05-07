import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OAuthGrant } from '../entities/oauth-grant.entity';

@Injectable()
export class OAuthGrantService {
  // The repo injection is preserved for Phase 6, where consent-reuse will be
  // implemented. The current Phase 4 stub always forces a fresh consent flow.
  constructor(@InjectRepository(OAuthGrant) private readonly repo: Repository<OAuthGrant>) {}

  loadExistingGrant = async (_ctx: any): Promise<any | undefined> => {
    return undefined; // Phase 6 will implement consent-reuse
  };
}
