import { AsyncLocalStorage } from 'async_hooks';

export interface OrgContextStore {
  organizationId?: string;
  bypass?: boolean;
}

export const orgContext = new AsyncLocalStorage<OrgContextStore>();

export function runWithOrg<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    orgContext.run({ organizationId }, () => fn().then(resolve, reject));
  });
}

export function runWithBypass<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    orgContext.run({ bypass: true }, () => fn().then(resolve, reject));
  });
}

export function getCurrentOrgId(): string | undefined {
  return orgContext.getStore()?.organizationId;
}

export function isBypassed(): boolean {
  return orgContext.getStore()?.bypass === true;
}

export function getStoreOrThrow(): OrgContextStore {
  const s = orgContext.getStore();
  if (!s) throw new Error('No org context active');
  return s;
}
