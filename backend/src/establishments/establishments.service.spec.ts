import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EstablishmentsService } from './establishments.service';
import { Establishment } from './establishment.entity';
import { runWithOrg } from '../common/org-context';

const inOrg = (fn: () => Promise<void>) => () => runWithOrg('1', fn);

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

  it('list returns establishments scoped to current org ordered by id', inOrg(async () => {
    repo.find.mockResolvedValue([{ id: 1, name: 'CESFAM Pompeya', comuna: 'Quilpué' }]);
    const result = await service.list();
    expect(result).toHaveLength(1);
    expect(repo.find).toHaveBeenCalledWith({
      order: { id: 'ASC' },
      where: { organizationId: '1' },
    });
  }));

  it('findById throws if not found', inOrg(async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findById(999)).rejects.toThrow();
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 999, organizationId: '1' },
    });
  }));
});
