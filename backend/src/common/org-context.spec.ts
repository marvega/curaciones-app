import {
  orgContext,
  runWithOrg,
  runWithBypass,
  getCurrentOrgId,
  isBypassed,
} from './org-context';

describe('orgContext', () => {
  it('exposes orgId inside runWithOrg', async () => {
    let captured: string | undefined;
    await runWithOrg('42', async () => {
      captured = getCurrentOrgId();
    });
    expect(captured).toBe('42');
  });

  it('marks bypass inside runWithBypass', async () => {
    let bypassed = false;
    await runWithBypass(async () => {
      bypassed = isBypassed();
    });
    expect(bypassed).toBe(true);
  });

  it('returns undefined outside any run', () => {
    expect(getCurrentOrgId()).toBeUndefined();
  });
});
