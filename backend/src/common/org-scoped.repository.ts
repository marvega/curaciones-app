import { Repository, FindManyOptions, FindOneOptions } from 'typeorm';
import { orgContext } from './org-context';

/**
 * Helper used by services that read tenanted entities. Adds
 * `where.organizationId = ctx.organizationId` automatically. If no context
 * is active and bypass is not set, throws.
 */
export async function findScoped<T extends { organizationId?: string }>(
  repo: Repository<T>,
  options: FindManyOptions<T> = {},
): Promise<T[]> {
  const store = orgContext.getStore();
  if (!store) throw new Error('findScoped: no org context');
  if (store.bypass) return repo.find(options);
  const where = { ...(options.where ?? {}), organizationId: store.organizationId } as any;
  return repo.find({ ...options, where });
}

export async function findOneScoped<T extends { organizationId?: string }>(
  repo: Repository<T>,
  options: FindOneOptions<T>,
): Promise<T | null> {
  const store = orgContext.getStore();
  if (!store) throw new Error('findOneScoped: no org context');
  if (store.bypass) return repo.findOne(options);
  const where = { ...(options.where ?? {}), organizationId: store.organizationId } as any;
  return repo.findOne({ ...options, where });
}
