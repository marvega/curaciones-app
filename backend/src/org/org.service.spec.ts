import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { OrgService } from './org.service';
import { Organization } from '../organizations/organization.entity';

describe('OrgService', () => {
  let service: OrgService;
  let orgRepo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    orgRepo = { findOne: jest.fn(), save: jest.fn() };
    const m = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
      ],
    }).compile();
    service = m.get(OrgService);
  });

  describe('updateSettings', () => {
    it('persists name and rut', async () => {
      orgRepo.findOne.mockResolvedValue({ id: '1', name: 'Old', rut: null });
      orgRepo.save.mockImplementation(async (o) => o);
      const result = await service.updateSettings('1', { name: 'New', rut: '11.111.111-1' });
      expect(result).toEqual({ name: 'New', rut: '11.111.111-1' });
      expect(orgRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: '1', name: 'New', rut: '11.111.111-1' }),
      );
    });

    it('persists null when rut is omitted', async () => {
      orgRepo.findOne.mockResolvedValue({ id: '1', name: 'Old', rut: '11.111.111-1' });
      orgRepo.save.mockImplementation(async (o) => o);
      const result = await service.updateSettings('1', { name: 'New' });
      expect(result).toEqual({ name: 'New', rut: null });
    });

    it('throws NotFoundException when the organization is missing', async () => {
      orgRepo.findOne.mockResolvedValue(null);
      await expect(service.updateSettings('1', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });
});
