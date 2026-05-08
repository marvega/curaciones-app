import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrgService } from './org.service';
import { Organization } from '../organizations/organization.entity';

describe('OrgService', () => {
  let service: OrgService;
  const orgRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        OrgService,
        { provide: getRepositoryToken(Organization), useValue: orgRepo },
      ],
    }).compile();
    service = m.get(OrgService);
    jest.clearAllMocks();
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
  });
});
