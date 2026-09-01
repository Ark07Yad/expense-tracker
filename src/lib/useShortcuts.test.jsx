/**
 * @vitest-environment jsdom
 */

/**
 * Keyboard shortcuts.
 *
 * Almost all of this file is about the guard. Single-key bindings are only
 * tolerable because they vanish the moment focus is in a field; without that,
 * typing "n" into a description opens a dialog and loses the entry, which is a
 * data-loss bug wearing a convenience feature's clothes.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SHORTCUTS, useShortcuts } from './useShortcuts';

function Harness({ handlers, enabled = true, extra = null }) {
  useShortcuts(handlers, { enabled });
  return (
    <div>
      <button>a button</button>
      <input aria-label="text field" />
      <textarea aria-label="notes" />
      <select aria-label="picker">
        <option>one</option>
      </select>
      <div contentEditable aria-label="rich" suppressContentEditableWarning />
      {extra}
    </div>
  );
}

describe('firing', () => {
  it('runs the handler for a bound key', async () => {
    const n = vi.fn();
    const user = userEvent.setup();
    render(<Harness handlers={{ n }} />);
    await user.keyboard('n');
    expect(n).toHaveBeenCalledTimes(1);
  });

  it('ignores keys with no binding', async () => {
    const n = vi.fn();
    const user = userEvent.setup();
    render(<Harness handlers={{ n }} />);
    await user.keyboard('q');
    expect(n).not.toHaveBeenCalled();
  });

  it('leaves modifier combinations to the browser', async () => {
    // Cmd-N is a new window, Ctrl-N likewise. Claiming them would be rude and
    // would break the platform.
    const n = vi.fn();
    const user = userEvent.setup();
    render(<Harness handlers={{ n }} />);
    await user.keyboard('{Meta>}n{/Meta}');
    await user.keyboard('{Control>}n{/Control}');
    await user.keyboard('{Alt>}n{/Alt}');
    expect(n).not.toHaveBeenCalled();
  });

  it('does nothing at all when disabled', async () => {
    // Which is how a dialog takes the keyboard for itself.
    const n = vi.fn();
    const user = userEvent.setup();
    render(<Harness handlers={{ n }} enabled={false} />);
    await user.keyboard('n');
    expect(n).not.toHaveBeenCalled();
  });
});

describe('the typing guard', () => {
  const cases = [
    ['text field', 'input'],
    ['notes', 'textarea'],
    ['rich', 'contenteditable'],
  ];

  for (const [label, kind] of cases) {
    it(`stays silent while typing in a ${kind}`, async () => {
      const handlers = { n: vi.fn(), 1: vi.fn(), '?': vi.fn(), d: vi.fn(), t: vi.fn() };
      const user = userEvent.setup();
      render(<Harness handlers={handlers} />);

      await user.click(screen.getByLabelText(label));
      await user.keyboard('n1?dt');

      for (const [key, fn] of Object.entries(handlers)) {
        expect(fn, `"${key}" fired while typing`).not.toHaveBeenCalled();
      }
    });
  }

  it('stays silent while a select has focus', async () => {
    const handlers = { n: vi.fn() };
    const user = userEvent.setup();
    render(<Harness handlers={handlers} />);
    screen.getByLabelText('picker').focus();
    await user.keyboard('n');
    expect(handlers.n).not.toHaveBeenCalled();
  });

  it('fires again once focus leaves the field', async () => {
    const n = vi.fn();
    const user = userEvent.setup();
    render(<Harness handlers={{ n }} />);

    const field = screen.getByLabelText('text field');
    await user.click(field);
    await user.keyboard('n');
    expect(n).not.toHaveBeenCalled();

    field.blur();
    await user.keyboard('n');
    expect(n).toHaveBeenCalledTimes(1);
  });

  it('still lets a button take a key press', async () => {
    // A focused button is not a text field; shortcuts should keep working.
    const n = vi.fn();
    const user = userEvent.setup();
    render(<Harness handlers={{ n }} />);
    screen.getByRole('button').focus();
    await user.keyboard('n');
    expect(n).toHaveBeenCalledTimes(1);
  });
});

describe('the documented list', () => {
  it('matches what is actually bound in the app', () => {
    // The help sheet reads from this list, so a binding added without a row
    // here is a binding nobody can discover.
    const labels = SHORTCUTS.map((s) => s.label);
    expect(labels).toEqual(
      expect.arrayContaining(['Home', 'Ledger', 'Trends', 'Invest', 'Advice', 'Settings', 'New entry'])
    );
    for (const s of SHORTCUTS) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.label).toBeTruthy();
    }
  });
});

describe('cleanup', () => {
  it('stops listening once unmounted', async () => {
    const n = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(<Harness handlers={{ n }} />);
    await user.keyboard('n');
    expect(n).toHaveBeenCalledTimes(1);

    unmount();
    await user.keyboard('n');
    expect(n).toHaveBeenCalledTimes(1);
  });
});
