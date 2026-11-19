import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Home from './Home.jsx';
import { api, cachedProfile } from '../api/client.js';

// The payer's dashboard (Session 22: test what the user sees). The server is replaced
// by fakes, so these tests only check the page.
vi.mock('../api/client.js', () => ({
  api: { profile: vi.fn(), sampleBill: vi.fn() },
  cachedProfile: vi.fn(),
}));
vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ token: 'payer-token', logout: () => {} }),
}));

const PROFILE = {
  name: 'Ralph Abdallah',
  email: 'ralph@example.com',
  payouts: [],
  bills: [{ id: 'b1', venue: 'Castle Rooftop', date: '2026-11-19', guests: 2, total: 4000, outstanding: 1500, currency: 'USD' }],
};

// Home at "/", and a stand-in bill screen to see where the button goes.
function renderHome() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/bills/:id" element={<p>Bill screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Home (payer dashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('greets the payer and lists what is still owed', async () => {
    cachedProfile.mockReturnValue({ ...PROFILE, readingOn: true });
    api.profile.mockResolvedValue({ ...PROFILE, readingOn: true });
    renderHome();
    expect(screen.getByRole('heading', { name: 'Hi Ralph.' })).toBeInTheDocument();
    expect(screen.getByText('Castle Rooftop')).toBeInTheDocument();
    expect(screen.getByText('$15.00 owed')).toBeInTheDocument();
  });

  it('hides "Try a sample bill" when receipt reading is on', () => {
    cachedProfile.mockReturnValue({ ...PROFILE, readingOn: true });
    api.profile.mockResolvedValue({ ...PROFILE, readingOn: true });
    renderHome();
    expect(screen.queryByRole('button', { name: 'Try a sample bill' })).not.toBeInTheDocument();
  });

  it('offers a sample bill when reading is off, and opens it', async () => {
    cachedProfile.mockReturnValue({ ...PROFILE, readingOn: false });
    api.profile.mockResolvedValue({ ...PROFILE, readingOn: false });
    api.sampleBill.mockResolvedValue({ id: 'sample1', shareToken: 'abc' });
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'Try a sample bill' }));
    expect(api.sampleBill).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Bill screen')).toBeInTheDocument();
  });

  it('says so when the sample bill could not be made', async () => {
    cachedProfile.mockReturnValue({ ...PROFILE, readingOn: false });
    api.profile.mockResolvedValue({ ...PROFILE, readingOn: false });
    api.sampleBill.mockRejectedValue(new Error('offline'));
    renderHome();
    await userEvent.click(screen.getByRole('button', { name: 'Try a sample bill' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't make the sample bill. Try again.");
  });
});
