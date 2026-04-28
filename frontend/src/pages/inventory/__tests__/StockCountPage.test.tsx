import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import StockCountPage from '../StockCountPage';
import * as api from '../../../services/api';

vi.mock('../../../services/api');

describe('StockCountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.openStockCount as any) = vi.fn().mockResolvedValue({
      id: 1,
      countDate: '2026-04-27',
      status: 'DRAFT',
      establishmentId: 1,
      performedById: 1,
      closedAt: null,
      createdAt: '',
    });
    (api.listLots as any) = vi.fn().mockResolvedValue([
      {
        id: 10,
        productId: 1,
        establishmentId: 1,
        lotCode: 'L1',
        expiresAt: '2027-01-01',
        receivedAt: '2026-04-01',
        createdAt: '',
        currentStock: 5,
        product: { id: 1, name: 'A' },
      },
    ]);
    (api.patchStockCountEntry as any) = vi.fn().mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces patch on input change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<StockCountPage />);
    await waitFor(() => screen.getByText('A'));
    const input = screen.getByDisplayValue('5') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '7' } });
    expect(api.patchStockCountEntry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    await waitFor(() => expect(api.patchStockCountEntry).toHaveBeenCalledWith(1, 10, { absoluteValue: 7 }));
  });
});
