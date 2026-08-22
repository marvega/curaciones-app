/* eslint-disable @typescript-eslint/no-unsafe-assignment,
                  @typescript-eslint/no-unsafe-member-access,
                  @typescript-eslint/no-unsafe-argument,
                  @typescript-eslint/no-unsafe-return,
                  @typescript-eslint/require-await */
// jest mock callbacks are typed as `any`; the matching public method signatures
// on InvitationsService provide the real type checks.
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { InvitationsService } from './invitations.service';
import { Invitation } from './invitation.entity';
import { Organization } from '../organizations/organization.entity';
import {
  OrganizationMembership,
  OrgRole,
} from '../organizations/organization-membership.entity';
import { User } from '../users/user.entity';
import { EMAIL_SERVICE } from '../email/email.service';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let invRepo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock };
  let orgRepo: { findOne: jest.Mock };
  let email: { send: jest.Mock };

  beforeEach(async () => {
    invRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (inv) => ({ id: 'inv-1', ...inv })),
      findOne: jest.fn(),
    };
    orgRepo = {
      findOne: jest.fn().mockResolvedValue({ name: 'CESFAM Norte' }),
    };
    email = { send: jest.fn().mockResolvedValue({ id: 'email-1' }) };

    const module = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: getRepositoryToken(Invitation), useValue: invRepo },
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
        {
          provide: getRepositoryToken(OrganizationMembership),
          useValue: { save: jest.fn(), create: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn(), save: jest.fn(), create: jest.fn() },
        },
        { provide: EMAIL_SERVICE, useValue: email },
      ],
    }).compile();

    service = module.get(InvitationsService);
  });

  describe('acceptUrlFor', () => {
    // acceptUrlFor reads process.env at call time. Jest workers reuse the same
    // process across spec files, so restore the prior value — including "was
    // unset", which is the case the fallback branch needs.
    let savedFrontendUrl: string | undefined;

    beforeEach(() => {
      savedFrontendUrl = process.env.FRONTEND_URL;
    });

    afterEach(() => {
      if (savedFrontendUrl === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = savedFrontendUrl;
    });

    it('builds the URL from FRONTEND_URL', () => {
      process.env.FRONTEND_URL = 'https://curaciones.web.app';

      expect(service.acceptUrlFor('tok-abc')).toBe(
        'https://curaciones.web.app/accept-invitation?token=tok-abc',
      );
    });

    it('falls back to the local dev origin when FRONTEND_URL is unset', () => {
      delete process.env.FRONTEND_URL;

      expect(service.acceptUrlFor('tok-abc')).toBe(
        'http://localhost:5173/accept-invitation?token=tok-abc',
      );
    });

    it('falls back when FRONTEND_URL is set but empty', () => {
      process.env.FRONTEND_URL = '';

      expect(service.acceptUrlFor('tok-abc')).toBe(
        'http://localhost:5173/accept-invitation?token=tok-abc',
      );
    });

    it('carries a base64url token through verbatim — no escaping needed', () => {
      process.env.FRONTEND_URL = 'https://curaciones.web.app';
      const token = 'aB3-_xyz0123456789ABCDEFabcdef-_9876543210x';

      const url = service.acceptUrlFor(token);

      expect(new URL(url).searchParams.get('token')).toBe(token);
    });
  });

  describe('create', () => {
    it('persists only the token hash, never the token itself', async () => {
      const { invitation, token } = await service.create(
        '1',
        7,
        'owner',
        'nuevo@cesfam.cl',
        OrgRole.CLINICIAN,
      );

      // 32 random bytes as base64url.
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(invRepo.save).toHaveBeenCalledTimes(1);
      const persisted = invRepo.save.mock.calls[0][0];
      expect(persisted.tokenHash).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      expect(JSON.stringify(persisted)).not.toContain(token);
      expect(JSON.stringify(invitation)).not.toContain(token);
    });

    it('emails the acceptUrl built by acceptUrlFor', async () => {
      const spy = jest.spyOn(service, 'acceptUrlFor');

      const { token } = await service.create(
        '1',
        7,
        'owner',
        'nuevo@cesfam.cl',
        OrgRole.ADMIN,
      );

      expect(spy).toHaveBeenCalledWith(token);
      expect(email.send).toHaveBeenCalledTimes(1);
      const sent = email.send.mock.calls[0][0];
      expect(sent.to).toBe('nuevo@cesfam.cl');
      expect(sent.subject).toContain('CESFAM Norte');
      expect(sent.react.props.acceptUrl).toBe(spy.mock.results[0].value);
    });

    it('expires the invitation 7 days out', async () => {
      const before = Date.now();

      await service.create(
        '1',
        7,
        'owner',
        'nuevo@cesfam.cl',
        OrgRole.CLINICIAN,
      );

      const persisted = invRepo.save.mock.calls[0][0];
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      expect(persisted.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + sevenDays,
      );
      expect(persisted.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + sevenDays,
      );
    });
  });

  describe('findValid', () => {
    const base = {
      id: 'inv-1',
      acceptedAt: null,
      cancelledAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    it('looks the invitation up by token hash, not by token', async () => {
      invRepo.findOne.mockResolvedValue(base);

      await service.findValid('tok-abc');

      expect(invRepo.findOne).toHaveBeenCalledWith({
        where: {
          tokenHash: createHash('sha256').update('tok-abc').digest('hex'),
        },
      });
    });

    it('returns the row when the invitation is pending', async () => {
      invRepo.findOne.mockResolvedValue(base);
      await expect(service.findValid('tok-abc')).resolves.toEqual(base);
    });

    it.each([
      ['unknown token', null],
      ['already accepted', { ...base, acceptedAt: new Date() }],
      ['cancelled', { ...base, cancelledAt: new Date() }],
      ['expired', { ...base, expiresAt: new Date(Date.now() - 1) }],
    ])('returns null when %s', async (_label, row) => {
      invRepo.findOne.mockResolvedValue(row);
      await expect(service.findValid('tok-abc')).resolves.toBeNull();
    });
  });
});
