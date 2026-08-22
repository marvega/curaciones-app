import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InventoryListPage from '../InventoryListPage';
import * as api from '../../../services/api';

vi.mock('../../../services/api');

describe('InventoryListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The component derives `today` from the real clock to decide "Vencido" vs
    // "Vence en Nd". Pin the clock 18 days before the fixture's 2026-05-15 lot
    // so the expiry assertion holds on any future run date.
    // Only Date is faked: timers stay real so waitFor() keeps working.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders lots with expiring highlights', async () => {
    vi.mocked(api.listLots).mockResolvedValue([
      { id: 1, productId: 1, establishmentId: 1, lotCode: 'L1', expiresAt: '2027-01-01', receivedAt: '2026-04-01', createdAt: '', currentStock: 10, daysToExpiry: 90, product: { id: 1, name: 'APOSITO HIDROCOLOIDE', codes: [] } },
      { id: 2, productId: 2, establishmentId: 1, lotCode: 'L2', expiresAt: '2026-05-15', receivedAt: '2026-04-01', createdAt: '', currentStock: 5, daysToExpiry: 18, product: { id: 2, name: 'APOSITO ESPUMA', codes: [] } },
    ]);
    render(
      <MemoryRouter>
        <InventoryListPage />
      </MemoryRouter>,
    );
    // Product name is rendered via toSentenceCase + accent recovery, e.g. 'APOSITO HIDROCOLOIDE' -> 'Apósito hidrocoloide'
    await waitFor(() => expect(screen.getByText('Apósito hidrocoloide')).toBeInTheDocument());
    expect(screen.getByText('Vence en 18d')).toBeInTheDocument();
  });
});
