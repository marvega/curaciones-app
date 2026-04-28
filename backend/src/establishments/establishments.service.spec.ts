import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EstablishmentsService } from './establishments.service';
import { Establishment } from './establishment.entity';

describe('EstablishmentsService', () => {
  let service: EstablishmentsService;
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      providers: [
        EstablishmentsService,
        { provide: getRepositoryToken(Establishment), useValue: repo },
      ],
    }).compile();
    service = m.get(EstablishmentsService);
    jest.clearAllMocks();
  });

  it('list returns all establishments ordered by id', async () => {
    repo.find.mockResolvedValue([{ id: 1, name: 'CESFAM Pompeya', comuna: 'Quilpué' }]);
    const result = await service.list();
    expect(result).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith({ order: { id: 'ASC' } });
  });

  it('findById throws if not found', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findById(999)).rejects.toThrow();
  });
});
