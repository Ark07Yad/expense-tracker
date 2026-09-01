/**
 * @vitest-environment jsdom
 */

/**
 * The shared primitives.
 *
 * These cover behaviours where a regression is silent: a focus trap that stops
 * trapping looks identical to one that works unless you are using a keyboard,
 * and a number field that quietly mangles input produces wrong amounts rather
 * than errors. Several of these are regressions that actually happened here —
 * the currency override and the field-metric mismatch both shipped as bugs
 * before they were caught by hand.
 */

import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import {
  Bar, Button, ConfirmButton, MoneyInput, NumberInput, Ring, Segmented, Sheet, Toast,
} from './ui';
import { renderWithStore, seed } from '../test/render';

describe('Sheet', () => {
  const Harness = ({ onClose }) => (
    <Sheet open onClose={onClose} title="Edit holding" subtitle="Sub">
      <button>first</button>
      <input aria-label="middle" />
      <button>last</button>
    </Sheet>
  );

  it('is a labelled modal dialog', () => {
    seed();
    renderWithStore(<Harness onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // Labelled by its own heading, so a screen reader announces what it is.
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId)).toHaveTextContent('Edit holding');
  });

  it('moves focus into the dialog on open', async () => {
    seed();
    renderWithStore(<Harness onClose={() => {}} />);
    await vi.waitFor(() => {
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    });
  });

  it('keeps Tab inside the dialog', async () => {
    // Without this, Tab walks straight out into the page behind — which is
    // still there and still interactive as far as the keyboard is concerned.
    seed();
    const { user } = renderWithStore(<Harness onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    await vi.waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    for (let i = 0; i < 8; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('wraps backwards too', async () => {
    seed();
    const { user } = renderWithStore(<Harness onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    await vi.waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    for (let i = 0; i < 8; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('closes on Escape', async () => {
    seed();
    const onClose = vi.fn();
    const { user } = renderWithStore(<Harness onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('returns focus to whatever opened it', async () => {
    // Closing a sheet must not dump focus at the top of the document.
    seed();
    const Opener = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open the sheet</button>
          <Sheet open={open} onClose={() => setOpen(false)} title="A sheet">
            <button>inside</button>
          </Sheet>
        </>
      );
    };
    const { user } = renderWithStore(<Opener />);
    const opener = screen.getByRole('button', { name: 'Open the sheet' });
    await user.click(opener);
    await vi.waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });
});

describe('MoneyInput', () => {
  it('shows the stored currency symbol', () => {
    seed({ profile: { currency: 'GBP' } });
    renderWithStore(<MoneyInput value={100} onChange={() => {}} />);
    expect(screen.getByText('£')).toBeTruthy();
  });

  it('lets a caller override the currency', () => {
    // The regression this exists for: during onboarding the chosen currency
    // lives in local state until the profile is committed, so a field reading
    // the store showed the default rupee sign a step after the user picked €.
    seed({ profile: { currency: 'INR' } });
    renderWithStore(<MoneyInput value={100} onChange={() => {}} currency="EUR" />);
    expect(screen.getByText('€')).toBeTruthy();
    expect(screen.queryByText('₹')).toBeNull();
  });

  it('matches standard field metrics at size md', () => {
    // md exists so the settings field lines up with the selects beside it.
    seed();
    const { container } = renderWithStore(<MoneyInput size="md" value={1} onChange={() => {}} />);
    const input = container.querySelector('input');
    expect(input.className).toContain('pl-8');
    expect(input.className).not.toContain('text-[17px]');
  });

  it('keeps the large treatment by default', () => {
    seed();
    const { container } = renderWithStore(<MoneyInput value={1} onChange={() => {}} />);
    expect(container.querySelector('input').className).toContain('text-[17px]');
  });
});

describe('NumberInput', () => {
  const Controlled = (props) => {
    const [v, setV] = useState(props.initial ?? null);
    return <NumberInput value={v} onChange={setV} allowEmpty {...props} />;
  };

  it('does not leave a leading zero when typing over an empty field', async () => {
    // The bug this guards: `Number('') === 0` re-rendered as "0", so typing 85
    // left you looking at "085".
    seed();
    const { user } = renderWithStore(<Controlled aria-label="amount" />);
    const input = screen.getByLabelText('amount');
    await user.type(input, '85');
    expect(input).toHaveValue('85');
  });

  it('allows an empty field while editing', async () => {
    seed();
    const { user } = renderWithStore(<Controlled initial={42} aria-label="amount" />);
    const input = screen.getByLabelText('amount');
    await user.clear(input);
    expect(input).toHaveValue('');
  });

  it('accepts a partial decimal on the way to a number', async () => {
    seed();
    const { user } = renderWithStore(<Controlled aria-label="amount" />);
    const input = screen.getByLabelText('amount');
    await user.type(input, '12.');
    expect(input).toHaveValue('12.');
    await user.type(input, '5');
    expect(input).toHaveValue('12.5');
  });

  it('rejects letters outright', async () => {
    seed();
    const { user } = renderWithStore(<Controlled aria-label="amount" />);
    const input = screen.getByLabelText('amount');
    await user.type(input, '1a2b');
    expect(input).toHaveValue('12');
  });

  it('clamps to the range on blur', async () => {
    seed();
    const { user } = renderWithStore(<Controlled aria-label="amount" min={0} max={90} />);
    const input = screen.getByLabelText('amount');
    await user.type(input, '150');
    await user.tab();
    expect(input).toHaveValue('90');
  });
});

describe('ConfirmButton', () => {
  it('needs two presses, and says so between them', async () => {
    // A destructive action that fires on the first click is a mis-tap away
    // from deleting something.
    seed();
    const onConfirm = vi.fn();
    const { user } = renderWithStore(<ConfirmButton onConfirm={onConfirm} label="Delete" />);

    const button = screen.getByRole('button');
    await user.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(button).toHaveTextContent('Sure?');

    await user.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disarms itself after a few seconds', async () => {
    // fireEvent rather than userEvent here: userEvent schedules its own
    // timers, which under fake timers means waiting on a clock nothing is
    // advancing. A plain click needs no such machinery.
    seed();
    vi.useFakeTimers();
    const onConfirm = vi.fn();
    renderWithStore(<ConfirmButton onConfirm={onConfirm} label="Delete" />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(button).toHaveTextContent('Sure?');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500);
    });
    expect(button).toHaveTextContent('Delete');

    // And a click after it disarmed must arm again, not fire.
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('Toast', () => {
  it('announces itself politely', () => {
    // A confirmation nobody can perceive is not a confirmation.
    seed();
    renderWithStore(<Toast message="Saved" onDone={() => {}} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Saved');
  });
});

describe('Ring and Bar', () => {
  it('gives the ring a text equivalent', () => {
    seed();
    renderWithStore(<Ring value={30} max={100} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '30% of the limit used');
  });

  it('clamps the ring label at the limit', () => {
    seed();
    renderWithStore(<Ring value={150} max={100} />);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', '100% of the limit used');
  });

  it('exposes the bar as a progressbar with its real value', () => {
    seed();
    renderWithStore(<Bar value={25} target={100} label="Groceries" />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '25');
    expect(bar).toHaveAttribute('aria-label', 'Groceries');
  });
});

describe('Segmented', () => {
  it('marks the selected tab and reports changes', async () => {
    seed();
    const onChange = vi.fn();
    const { user } = renderWithStore(
      <Segmented
        value="b"
        onChange={onChange}
        options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]}
      />
    );
    const list = screen.getByRole('tablist');
    expect(within(list).getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(list).getByRole('tab', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith('a');
  });
});

describe('Button', () => {
  it('does not fire while disabled', async () => {
    seed();
    const onClick = vi.fn();
    renderWithStore(<Button disabled onClick={onClick}>Save</Button>);
    // userEvent refuses to click a disabled control at all, which tests the
    // library rather than the component; fireEvent dispatches regardless, so
    // this asserts the button itself does not respond.
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
