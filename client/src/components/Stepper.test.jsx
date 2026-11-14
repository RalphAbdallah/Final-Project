import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Stepper from './Stepper.jsx';

// The − count + control a guest uses to claim units of an item (Session 22: test what the user sees).
describe('Stepper', () => {
  it('shows the count, named for screen readers', () => {
    render(<Stepper value={2} max={5} label="Fries" onChange={() => {}} />);
    expect(screen.getByRole('group', { name: 'Fries: 2' })).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('asks for one more when + is clicked', async () => {
    const onChange = vi.fn();
    render(<Stepper value={2} max={5} label="Fries" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'One more Fries' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it('asks for one less when − is clicked', async () => {
    const onChange = vi.fn();
    render(<Stepper value={2} max={5} label="Fries" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'One less Fries' }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  // The edges: nobody can claim more than is left, and claiming 1 can be undone.
  it('stops at the units left: + is disabled and does nothing', async () => {
    const onChange = vi.fn();
    render(<Stepper value={5} max={5} label="Fries" onChange={onChange} />);
    const plus = screen.getByRole('button', { name: 'One more Fries' });
    expect(plus).toBeDisabled();
    await userEvent.click(plus);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('turns − into "Unclaim" at 1 when claiming (min 0)', async () => {
    const onChange = vi.fn();
    render(<Stepper value={1} max={5} label="Fries" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Unclaim Fries' }));
    expect(onChange).toHaveBeenCalledWith(0);
  });

  it('never goes below 1 for a quantity (min 1)', () => {
    render(<Stepper value={1} min={1} max={9} label="Pizza" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'One less Pizza' })).toBeDisabled();
  });
});
