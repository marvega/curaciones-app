import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tag } from './Tag';

describe('<Tag>', () => {
  it('renders children', () => {
    render(<Tag>Activo</Tag>);
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('applies blue variant', () => {
    render(<Tag variant="blue">x</Tag>);
    expect(screen.getByText('x').className).toMatch(/bg-blue-50/);
  });

  it('applies uppercase styling when uppercase prop true', () => {
    render(<Tag uppercase>x</Tag>);
    expect(screen.getByText('x').className).toMatch(/uppercase/);
  });
});
