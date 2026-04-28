import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodePill } from './CodePill';

describe('<CodePill>', () => {
  it('renders code', () => {
    render(<CodePill>1408</CodePill>);
    expect(screen.getByText('1408')).toBeInTheDocument();
  });

  it('uses monospace and blue background', () => {
    render(<CodePill>1408</CodePill>);
    expect(screen.getByText('1408').className).toMatch(/font-mono/);
    expect(screen.getByText('1408').className).toMatch(/bg-blue/);
  });
});
