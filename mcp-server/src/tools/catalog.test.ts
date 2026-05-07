import { describe, it, expect } from 'vitest';
import { TOOLS } from './catalog.js';

describe('tool catalog', () => {
  it('contains all 19 tools + whoami', () => {
    expect(TOOLS).toHaveLength(20);
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(20); // no duplicates
  });

  it('every tool has required metadata', () => {
    for (const tool of TOOLS) {
      expect(tool.name).toMatch(/^[a-z_]+$/);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeLessThan(500);
      expect(typeof tool.requiredScope).toBe('string'); // empty allowed for whoami
      expect(typeof tool.readOnly).toBe('boolean');
      expect(typeof tool.destructive).toBe('boolean');
      expect(typeof tool.handler).toBe('function');
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('whoami requires no scope', () => {
    const w = TOOLS.find((t) => t.name === 'whoami')!;
    expect(w.requiredScope).toBe('');
  });
});
