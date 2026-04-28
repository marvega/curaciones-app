import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

function Trap({ active }: { active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, active);
  return (
    <div>
      <button>outside</button>
      <div ref={ref}>
        <button>first</button>
        <button>last</button>
      </div>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('cycles focus between first and last when active', async () => {
    const user = userEvent.setup();
    render(<Trap active={true} />);

    const first = screen.getByRole('button', { name: 'first' });
    first.focus();
    expect(first).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'last' })).toHaveFocus();

    await user.tab();
    expect(first).toHaveFocus(); // wraps back
  });
});
