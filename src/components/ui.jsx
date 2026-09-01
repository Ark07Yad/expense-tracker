/** Shared visual primitives. Everything is inline SVG or CSS — no icon deps. */

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCountUp, stagger } from '../lib/motion';
import { formatMoney, formatPercent } from '../lib/calc';
import { useStore } from '../lib/store';

export { stagger };

/* ────────────────────────────────  Icons  ──────────────────────────────── */

const P = ({ d }) => <path d={d} strokeLinecap="round" strokeLinejoin="round" />;

export const Icon = ({ name, className = 'size-5', ...rest }) => {
  const shapes = {
    /* chrome */
    home:      <><P d="M3 10.5 12 3l9 7.5" /><P d="M5.5 9.5V20a1 1 0 0 0 1 1H9.5v-5.5h5V21h3a1 1 0 0 0 1-1V9.5" /></>,
    ledger:    <><P d="M5 3.5h11a2 2 0 0 1 2 2v15a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 20V5a1.5 1.5 0 0 1 1.5-1.5z" /><P d="M8 8h7M8 12h7M8 16h4" /></>,
    chart:     <><P d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    pie:       <><P d="M12 3a9 9 0 1 0 9 9h-9V3z" /><P d="M15 3.6A9 9 0 0 1 20.4 9H15V3.6z" /></>,
    piggy:     <><P d="M3 12.5c0-3 2.8-5.5 6.5-5.5h3c3.7 0 6.5 2.5 6.5 5.5 0 1.7-.9 3.2-2.3 4.2V20h-3v-1.6a9.6 9.6 0 0 1-2.2.3H10V20H7v-2.6C4.6 16.4 3 14.6 3 12.5z" /><P d="M19 11.5h2M9 6.8 10 4l2.6 1.6" /><circle cx="7.8" cy="11.8" r=".8" /></>,
    compass:   <><circle cx="12" cy="12" r="9" /><P d="m15.5 8.5-2 5-5 2 2-5 5-2z" /></>,
    spark:     <><P d="M12 3v3M12 18v3M4.2 7.5l2.6 1.5M17.2 15l2.6 1.5M4.2 16.5l2.6-1.5M17.2 9l2.6-1.5" /><circle cx="12" cy="12" r="3.5" /></>,
    user:      <><circle cx="12" cy="8" r="4" /><P d="M4.5 21a7.5 7.5 0 0 1 15 0" /></>,
    settings:  <><circle cx="12" cy="12" r="3" /><P d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.9 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 13.9H4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5.1 7.2L5 7.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
    menu:      <P d="M4 7h16M4 12h16M4 17h16" />,
    moon:      <P d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
    sun:       <><circle cx="12" cy="12" r="4" /><P d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></>,

    /* actions */
    plus:      <P d="M12 5v14M5 12h14" />,
    minus:     <P d="M5 12h14" />,
    x:         <P d="M6 6l12 12M18 6L6 18" />,
    check:     <P d="M4.5 12.5l5 5 10-11" />,
    chevL:     <P d="M15 5l-7 7 7 7" />,
    chevR:     <P d="M9 5l7 7-7 7" />,
    chevD:     <P d="M5 9l7 7 7-7" />,
    chevU:     <P d="M19 15l-7-7-7 7" />,
    search:    <><circle cx="11" cy="11" r="6.5" /><P d="M16 16l4.5 4.5" /></>,
    trash:     <><P d="M4 7h16M9.5 7V5h5v2M6.5 7l1 13h9l1-13" /></>,
    edit:      <><P d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" /><P d="M14.5 6.5l3 3" /></>,
    download:  <><P d="M12 3v12M7.5 10.5 12 15l4.5-4.5" /><P d="M4 20h16" /></>,
    upload:    <><P d="M12 15V3M7.5 7.5 12 3l4.5 4.5" /><P d="M4 20h16" /></>,
    filter:    <P d="M3.5 5h17l-6.5 8v6l-4 2v-8L3.5 5z" />,
    dots:      <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
    undo:      <><P d="M4 9h11a5 5 0 0 1 0 10h-6" /><P d="M8 5 4 9l4 4" /></>,

    /* signals */
    trendUp:   <><P d="M3 17 9.5 10.5l4 4L21 7" /><P d="M15.5 7H21v5.5" /></>,
    trendDown: <><P d="M3 7 9.5 13.5l4-4L21 17" /><P d="M15.5 17H21v-5.5" /></>,
    alert:     <><P d="M12 4.5 2.8 20h18.4L12 4.5z" /><P d="M12 10v4.5" /><circle cx="12" cy="17.4" r=".9" fill="currentColor" stroke="none" /></>,
    info:      <><circle cx="12" cy="12" r="9" /><P d="M12 11v5.5" /><circle cx="12" cy="7.9" r=".9" fill="currentColor" stroke="none" /></>,
    clock:     <><circle cx="12" cy="12" r="9" /><P d="M12 7v5.4l3.4 2" /></>,
    calendar:  <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><P d="M3.5 10h17M8 3.5v3M16 3.5v3" /></>,
    flag:      <><P d="M5.5 21V3.5" /><P d="M5.5 4.5h11l-1.8 3.6 1.8 3.6h-11" /></>,
    target:    <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none" /></>,
    shield:    <><P d="M12 3 4.5 6v6c0 4.4 3.1 7.9 7.5 9 4.4-1.1 7.5-4.6 7.5-9V6L12 3z" /><P d="m8.8 12 2.2 2.2 4.2-4.4" /></>,
    scale:     <><P d="M12 4v16M7 20h10" /><P d="M12 7 5 9.5 8 15a3.2 3.2 0 0 0 6 0L12 7zM12 7l7 2.5L16 15a3.2 3.2 0 0 1-6 0" /></>,
    scissors:  <><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="6.5" cy="17.5" r="2.5" /><P d="M8.6 8.2 20 19M8.6 15.8 20 5" /></>,
    wave:      <P d="M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0" />,
    drop:      <P d="M12 3.5s6 6.4 6 10.4a6 6 0 0 1-12 0c0-4 6-10.4 6-10.4z" />,
    repeat:    <><P d="M4 9a5 5 0 0 1 5-5h9l-3-3M20 15a5 5 0 0 1-5 5H6l3 3" /></>,
    layers:    <><P d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3z" /><P d="m4.5 12.5 7.5 4 7.5-4M4.5 16.5l7.5 4 7.5-4" /></>,
    percent:   <><P d="M5 19 19 5" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></>,
    hourglass: <><P d="M6.5 3h11M6.5 21h11" /><P d="M7.5 3c0 4 4.5 5.5 4.5 9s-4.5 5-4.5 9M16.5 3c0 4-4.5 5.5-4.5 9s4.5 5 4.5 9" /></>,

    /* categories */
    wallet:    <><P d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v1" /><P d="M4 7.5V18a2.5 2.5 0 0 0 2.5 2.5H19a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.5" /><circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" /></>,
    basket:    <><P d="M4 9h16l-1.6 10.2a1.5 1.5 0 0 1-1.5 1.3H7.1a1.5 1.5 0 0 1-1.5-1.3L4 9z" /><P d="m8.5 9 2-5.5M15.5 9l-2-5.5M9.5 13v4M14.5 13v4" /></>,
    cup:       <><P d="M5 8h12v6.5a4.5 4.5 0 0 1-4.5 4.5h-3A4.5 4.5 0 0 1 5 14.5V8z" /><P d="M17 10h1.8a2.2 2.2 0 0 1 0 4.4H17" /><P d="M8 3.5c0 1-1 1.5-1 2.5M12 3c0 1-1 1.5-1 2.5" /></>,
    car:       <><P d="M5 16.5V19a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-2.5M19 16.5V19a1 1 0 0 0 1 1h.5a1 1 0 0 0 1-1v-2.5" /><P d="M3 16.5v-4l2-5a1.6 1.6 0 0 1 1.5-1h11a1.6 1.6 0 0 1 1.5 1l2 5v4H3z" /><P d="M5 12h14" /><circle cx="7" cy="14.5" r="1" fill="currentColor" stroke="none" /><circle cx="17" cy="14.5" r="1" fill="currentColor" stroke="none" /></>,
    bolt:      <P d="M13.5 3 5 13.5h5.5L10 21l8.5-10.5H13L13.5 3z" />,
    heart:     <P d="M12 20s-7.5-4.6-7.5-9.5A4.2 4.2 0 0 1 12 7.5a4.2 4.2 0 0 1 7.5 3C19.5 15.4 12 20 12 20z" />,
    bag:       <><P d="M5 8h14l-1 12.5H6L5 8z" /><P d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
    play:      <><circle cx="12" cy="12" r="9" /><P d="m10 8.5 6 3.5-6 3.5v-7z" /></>,
    book:      <><P d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15z" /><P d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" /></>,
    plane:     <P d="M10.5 20 12 15l7 1.5v-2L12 10l1-5.5A1.3 1.3 0 0 0 10.5 4L9 10l-6 2.5v2l6-1 1 5-2 1.5V21l2.5-1z" />,
    gift:      <><rect x="3.5" y="8.5" width="17" height="4" rx="1" /><P d="M5 12.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7M12 8.5V21" /><P d="M12 8.5S10.8 4 8.5 4a2.2 2.2 0 0 0 0 4.5zM12 8.5S13.2 4 15.5 4a2.2 2.2 0 0 1 0 4.5z" /></>,
    bank:      <><P d="M3.5 9.5 12 4l8.5 5.5" /><P d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20.5h18" /></>,
    laptop:    <><rect x="4" y="5" width="16" height="10.5" rx="1.5" /><P d="M2.5 19h19" /></>,
    store:     <><P d="M4 9.5V20h16V9.5" /><P d="M3 9.5 4.5 4h15L21 9.5a2.6 2.6 0 0 1-4.5 1.6A2.6 2.6 0 0 1 12 11a2.6 2.6 0 0 1-4.5.1A2.6 2.6 0 0 1 3 9.5z" /><P d="M9.5 20v-5.5h5V20" /></>,
    coins:     <><ellipse cx="12" cy="6.5" rx="7" ry="3" /><P d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /><P d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
    key:       <><circle cx="8" cy="14" r="4" /><P d="m11 11 8-8 2 2-2 2 2 2-2.5 2.5-2-2L14 12" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         className={className} aria-hidden="true" {...rest}>
      {shapes[name] || shapes.dots}
    </svg>
  );
};

/* ────────────────────────────────  Colour  ─────────────────────────────── */

/**
 * Theme-aware colour helpers for inline styles.
 *
 * Tailwind cannot see a class name built at runtime — `text-${tone}` compiles
 * to nothing — and the semantic tones have to change between light and dark, so
 * they cannot be hardcoded hexes either. Reading the CSS variable directly and
 * blending it with `color-mix` gets both: one source of truth per theme, and
 * tinted backgrounds that follow it.
 */
export const toneColor = (tone) => `var(--tone-${tone})`;

/** A colour at `pct` opacity over whatever is behind it. Accepts hex or var(). */
export const mix = (color, pct) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/* ────────────────────────────────  Layout  ─────────────────────────────── */

export function Card({ className = '', children, glow = false, sheen = false, ...rest }) {
  return (
    <div className={`surface rounded-3xl relative overflow-hidden ${className}`} {...rest}>
      {glow && (
        <div className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full blur-3xl"
             style={{ background: 'radial-gradient(circle, rgb(142 107 255 / 0.28), transparent 70%)' }} />
      )}
      {sheen && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div className="absolute inset-y-0 w-1/3 -skew-x-12 opacity-[0.07]"
               style={{
                 background: 'linear-gradient(90deg, transparent, #fff, transparent)',
                 animation: 'sweep 7s ease-in-out infinite',
               }} />
        </div>
      )}
      {children}
    </div>
  );
}

export function SectionTitle({ icon, children, action, sub }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-dim">
          {icon && <Icon name={icon} className="size-4" />}
          {children}
        </h2>
        {sub && <p className="text-[12px] text-faint mt-1">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ────────────────────────────────  Buttons  ────────────────────────────── */

const VARIANTS = {
  primary: 'metal hover:brightness-[1.08] font-semibold',
  ghost: 'surface hover:[background:var(--surface-hover)] text-[color:var(--text)]',
  subtle: 'bg-transparent hover:[background:var(--surface)] text-dim hover:text-[color:var(--text)]',
  danger: 'bg-rose-500/12 text-bad hover:bg-rose-500/20 border border-rose-500/25',
};

export function Button({ variant = 'ghost', className = '', size = 'md', children, ...rest }) {
  const sizes = {
    sm: 'px-3 py-1.5 text-[13px] rounded-xl',
    md: 'px-4 py-2.5 text-sm rounded-2xl',
    lg: 'px-6 py-3.5 text-[15px] rounded-2xl',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 transition-all duration-200
                  active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none
                  ${sizes[size]} ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({ name, label, className = '', ...rest }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`grid place-items-center size-9 rounded-xl text-dim transition-all
                  hover:[background:var(--surface-hover)] hover:text-[color:var(--text)]
                  active:scale-90 disabled:opacity-30 disabled:pointer-events-none ${className}`}
      {...rest}
    >
      <Icon name={name} className="size-[18px]" />
    </button>
  );
}

/* ────────────────────────────────  Inputs  ─────────────────────────────── */

export function Field({ label, hint, suffix, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-[12px] font-medium text-dim mb-1.5">{label}</span>}
      <div className="relative">
        {children}
        {suffix && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[12px] text-faint pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && <span className="block text-[11px] text-faint mt-1.5">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full px-3.5 py-2.5 rounded-2xl text-sm outline-none transition-all ' +
  'bg-[color:var(--surface)] border border-hair ' +
  'focus:border-brand-400/60 focus:ring-4 focus:ring-brand-400/10 placeholder:text-[color:var(--text-faint)]';

export const Input = ({ className = '', ...rest }) => (
  <input className={`${inputBase} ${className}`} {...rest} />
);

export const Textarea = ({ className = '', ...rest }) => (
  <textarea className={`${inputBase} resize-none ${className}`} {...rest} />
);

export function Select({ className = '', children, ...rest }) {
  return (
    <div className="relative">
      <select className={`${inputBase} appearance-none pr-9 ${className}`} {...rest}>{children}</select>
      <Icon name="chevD" className="size-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-faint" />
    </div>
  );
}

/**
 * A numeric field that behaves the way people expect.
 *
 * The obvious implementation — `value={number}` with `onChange={Number(...)}` —
 * is subtly broken: clearing the box produces `Number('') === 0`, React
 * re-renders it as "0", and typing 85 leaves you staring at "085". You also
 * cannot ever have an empty field, so correcting a value means selecting the
 * text first.
 *
 * The fix is to keep a *string* draft while the field has focus, so "", "-",
 * "8" and "8." are all legal intermediate states, and only reconcile to a
 * number on blur. The parent still gets live updates for every keystroke that
 * parses, so dependent figures keep moving as you type.
 */
export function NumberInput({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  fallback = 0,
  decimals = null,
  allowEmpty = false,
  unstyled = false,
  className = '',
  ...rest
}) {
  const [draft, setDraft] = useState(null);

  const shown =
    draft !== null ? draft : value === null || value === undefined || value === '' ? '' : String(value);

  const handleChange = (e) => {
    const raw = e.target.value;
    if (raw !== '' && raw !== '-' && !/^-?\d*\.?\d*$/.test(raw)) return;
    setDraft(raw);
    if (raw === '' || raw === '-' || raw.endsWith('.')) {
      if (raw === '' && allowEmpty) onChange(null);
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n)) onChange(n);
  };

  const handleBlur = () => {
    if (draft === null) return;
    if (draft === '' || draft === '-') {
      onChange(allowEmpty ? null : fallback);
      setDraft(null);
      return;
    }
    let n = Number(draft);
    if (Number.isNaN(n)) n = fallback;
    n = Math.min(max, Math.max(min, n));
    if (decimals !== null) n = Number(n.toFixed(decimals));
    onChange(n);
    setDraft(null);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={(e) => e.target.select()}
      className={unstyled ? className : `${inputBase} ${className}`}
      {...rest}
    />
  );
}

/**
 * The amount field, with the currency symbol built into the control.
 *
 * `currency` overrides the stored one. Onboarding needs that: the currency the
 * user picks on the first step lives in local state until the profile is
 * committed at the end, so a field reading the store would keep showing the
 * default rupee sign while the rest of that screen had already switched.
 *
 * The symbol is derived by formatting zero and stripping the digits rather than
 * being kept in a table, so it always matches what the same locale prints
 * everywhere else — including the currencies written after the amount, like the
 * euro in de-DE.
 *
 * `size` exists because this field appears in three quite different places. In
 * the composer and the investment sheets the amount *is* the screen, so it gets
 * the large treatment. In a settings form it sits in a grid beside ordinary
 * selects, and the large version would stand a head taller than its neighbours,
 * so 'md' matches the standard field metrics exactly. 'sm' is for the dense
 * budget column, where fourteen of these stack in a list.
 *
 * In that column the symbol pins left while the number stays right-aligned,
 * which is what keeps a list of amounts scannable — the digits line up in a
 * single column instead of drifting with the length of each number.
 */
const MONEY_SIZES = {
  sm: {
    symbol: 'left-2.5 text-[11.5px]',
    input: 'pl-7 pr-2.5 py-2 text-[13px] tabular',
  },
  md: {
    symbol: 'left-3.5 text-[13px]',
    // pl-8 clears the symbol. Tailwind emits padding-left after the padding
    // shorthand, so this wins over inputBase's px-3.5 regardless of class order.
    input: 'pl-8 tabular',
  },
  lg: {
    symbol: 'left-4 text-[15px]',
    input: 'pl-9 text-[17px] font-semibold tabular py-3',
  },
};

export function MoneyInput({
  value, onChange, currency, size = 'lg', className = '', inputClassName = '',
  autoFocus, ...rest
}) {
  const { state } = useStore();
  const code = currency || state.profile.currency;
  const symbol = formatMoney(0, code, { decimals: 0 }).replace(/[\d\s.,]/g, '') || '$';
  const metrics = MONEY_SIZES[size] || MONEY_SIZES.lg;

  return (
    <div className={`relative ${className}`}>
      <span
        className={`absolute top-1/2 -translate-y-1/2 text-dim font-medium pointer-events-none ${metrics.symbol}`}
      >
        {symbol}
      </span>
      <NumberInput
        value={value}
        onChange={onChange}
        min={0}
        allowEmpty
        autoFocus={autoFocus}
        placeholder="0"
        className={`${metrics.input} ${inputClassName}`}
        {...rest}
      />
    </div>
  );
}

export function Segmented({ options, value, onChange, className = '', size = 'md' }) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]';
  return (
    <div className={`inline-flex p-1 rounded-2xl surface gap-1 ${className}`} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`relative rounded-xl font-medium transition-all duration-200 whitespace-nowrap ${pad}
                        ${active ? 'metal' : 'text-dim hover:text-[color:var(--text)]'}`}
          >
            {o.icon && <Icon name={o.icon} className="size-3.5 inline -mt-px mr-1" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, color, children, className = '', ...rest }) {
  return (
    <button
      className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-all active:scale-95 border
                  ${active
                    ? 'text-[color:var(--text)]'
                    : 'surface border-hair text-dim hover:text-[color:var(--text)]'} ${className}`}
      style={active ? { background: `${color || '#8e6bff'}26`, borderColor: `${color || '#8e6bff'}66` } : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────  Numbers  ────────────────────────────── */

export function AnimatedNumber({ value, decimals = 0, duration = 550, format, className = '' }) {
  const shown = useCountUp(Number(value) || 0, { duration, decimals });
  return <span className={`tabular ${className}`}>{format ? format(shown) : shown.toFixed(decimals)}</span>;
}

/**
 * Money, tweened.
 *
 * Only used where the number is the point — a period total, net worth, a budget
 * remainder. Applying it to every figure would turn the app into a slot machine.
 */
export function Money({ value, compact = false, sign = false, animate = false, className = '' }) {
  const { state } = useStore();
  const cur = state.profile.currency;
  if (!animate) return <span className={`tabular ${className}`}>{formatMoney(value, cur, { compact, sign })}</span>;
  return (
    <AnimatedNumber
      value={value}
      className={className}
      format={(v) => formatMoney(v, cur, { compact, sign })}
    />
  );
}

/**
 * A change pill: arrow, percentage, and the right colour for context.
 *
 * By default *up is good* — income, savings, net worth. Pass `invert` for the
 * measures where up is bad, which is spending and only spending. Getting this
 * backwards is easy and completely silent, so the polarity lives here once
 * rather than being decided at each call site.
 */
export function Delta({ change, invert = false, className = '', suffix }) {
  if (!change) return null;
  if (change.kind === 'new') {
    return <span className={`text-[11.5px] text-faint ${className}`}>new{suffix ? ` ${suffix}` : ''}</span>;
  }
  const pct = change.pct ?? 0;
  if (Math.abs(pct) < 0.5) {
    return <span className={`text-[11.5px] text-faint ${className}`}>level{suffix ? ` ${suffix}` : ''}</span>;
  }
  const up = pct > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11.5px] font-medium tabular ${good ? 'text-good' : 'text-bad'} ${className}`}
    >
      <Icon name={up ? 'trendUp' : 'trendDown'} className="size-3" />
      {formatPercent(Math.abs(pct), Math.abs(pct) < 10 ? 1 : 0)}
      {suffix && <span className="text-faint font-normal ml-0.5">{suffix}</span>}
    </span>
  );
}

const TONE_TEXT = {
  default: 'text-[color:var(--text)]',
  earn: 'text-earn',
  spend: 'text-spend',
  save: 'text-save',
  invest: 'text-invest',
  brand: 'text-brandy',
  good: 'text-good',
  warn: 'text-warn',
  bad: 'text-bad',
};

export function Stat({ label, value, icon, tone = 'default', sub, delta, invertDelta, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`surface rounded-2xl p-3.5 text-left w-full ${
        onClick ? 'transition-all hover:[background:var(--surface-hover)] active:scale-[0.98]' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-faint mb-1.5">
        {icon && <Icon name={icon} className="size-3.5" />}
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-[21px] font-semibold display leading-none ${TONE_TEXT[tone]}`}>{value}</div>
      <div className="flex items-center gap-2 mt-1.5 min-h-[16px]">
        {delta && <Delta change={delta} invert={invertDelta} />}
        {sub && <span className="text-[11px] text-faint truncate">{sub}</span>}
      </div>
    </Tag>
  );
}

/* ────────────────────────────────  Progress  ───────────────────────────── */

/**
 * The headline dial. `pace` draws a thin marker at "where you should be by
 * now", which is what makes a half-full ring readable on the 5th and on the
 * 25th.
 */
export function Ring({ value, max, size = 190, stroke = 13, children, tone = 'brand', pace = null }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const raw = max > 0 ? value / max : 0;
  const clamped = Math.min(1, Math.max(0, raw));
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(clamped));
    return () => cancelAnimationFrame(id);
  }, [clamped]);

  const gid = `ring-${tone}-${size}`;
  const stops = {
    brand: ['var(--ring-a)', 'var(--ring-b)', 'var(--ring-c)'],
    over: ['#fbbf24', '#fb7185', '#f43f5e'],
    earn: ['#6ee7b7', '#34d399', '#059669'],
    save: ['#7dd3fc', '#38bdf8', '#0284c7'],
  }[tone] || ['var(--ring-a)', 'var(--ring-b)', 'var(--ring-c)'];

  const paceAngle = pace !== null ? Math.min(1, Math.max(0, pace)) * 360 - 90 : null;

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(clamped * 100)}% of the limit used`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={stops[0]} />
            <stop offset="55%" stopColor={stops[1]} />
            <stop offset="100%" stopColor={stops[2]} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - shown)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      {paceAngle !== null && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ transform: `rotate(${paceAngle + 90}deg)` }}
        >
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full"
            style={{
              top: (size - stroke) / 2 - r + stroke / 2 - 1,
              width: 2,
              height: stroke + 6,
              background: 'var(--text-faint)',
              transform: `translateY(${-stroke / 2 - 3}px)`,
              opacity: 0.75,
            }}
          />
        </div>
      )}
      <div className="absolute inset-0 grid place-items-center text-center px-6">{children}</div>
    </div>
  );
}

/**
 * Horizontal bar with a pace marker.
 *
 * `overTone` decides what passing the target means. For a budget it is bad and
 * the fill turns amber-to-red; for a savings rate, beating the target is the
 * whole point, so the bar has to be told rather than assuming.
 */
export function Bar({
  value, target, label, sub, color = '#8e6bff', pace = null, right,
  compact = false, overTone = 'bad',
}) {
  const p = target > 0 ? (value / target) * 100 : 0;
  const width = Math.min(100, Math.max(0, p));
  const over = p > 100 && overTone !== 'none';

  return (
    <div className={compact ? '' : 'py-0.5'}>
      {(label || right) && (
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <span className="text-[13px] font-medium truncate">{label}</span>
          <span className="text-[12px] text-dim tabular shrink-0">{right}</span>
        </div>
      )}
      <div
        className="relative h-2 rounded-full overflow-hidden"
        style={{ background: 'var(--border)' }}
        role="progressbar"
        aria-valuenow={Math.round(p)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: over
              ? overTone === 'good'
                ? 'linear-gradient(90deg,#34d399,#10b981)'
                : 'linear-gradient(90deg,#fb923c,#f43f5e)'
              : color,
            transition: 'width 700ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />
        {pace !== null && pace > 0 && pace < 1 && (
          <div
            className="absolute top-0 bottom-0 w-px"
            style={{ left: `${pace * 100}%`, background: 'var(--text)', opacity: 0.45 }}
            title="Where you should be by now"
          />
        )}
      </div>
      {sub && <div className="text-[11px] text-faint mt-1.5">{sub}</div>}
    </div>
  );
}

/* ─────────────────────────────  Sheet / modal  ─────────────────────────── */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const panel = useRef(null);
  const restoreTo = useRef(null);
  const titleId = useId();

  /**
   * Focus management.
   *
   * A dialog that does not hold focus is a dialog only for people using a
   * mouse: Tab walks straight out of it into the page behind, which is still
   * there and still interactive as far as the keyboard is concerned. Trapping
   * Tab and returning focus to whatever opened the sheet is what makes the
   * whole app usable without a pointer.
   */
  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = [...(panel.current?.querySelectorAll(FOCUSABLE) || [])].filter(
        (el) => el.offsetParent !== null
      );
      if (!items.length) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, and pull focus back in if it has escaped entirely.
      if (e.shiftKey && (active === first || !panel.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    // Move focus into the sheet, preferring a field the user is meant to fill.
    const id = requestAnimationFrame(() => {
      const auto = panel.current?.querySelector('[autofocus]');
      const first = panel.current?.querySelector(FOCUSABLE);
      (auto || first)?.focus();
    });

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      // Back where they were, so closing a sheet does not dump focus at the
      // top of the document.
      if (restoreTo.current instanceof HTMLElement) restoreTo.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-4xl' };

  // Portalled to <body>: any ancestor with a transform — our page-transition
  // animation, for one — would otherwise become the containing block for
  // `position: fixed` and the overlay would no longer cover the viewport.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-[pop_0.2s_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-full ${widths[size]} max-h-[92dvh] sm:max-h-[86dvh] flex flex-col
                    rounded-t-3xl sm:rounded-3xl surface animate-rise sm:mx-4`}
        style={{ background: 'var(--bg-elev)' }}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4 border-b border-hair shrink-0">
          <div className="min-w-0">
            <h3 id={titleId} className="text-lg font-semibold truncate">{title}</h3>
            {subtitle && <p className="text-[12.5px] text-dim mt-0.5">{subtitle}</p>}
          </div>
          <IconButton name="x" label="Close" onClick={onClose} />
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-4 flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-hair shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmButton({ onConfirm, label = 'Delete', confirmLabel = 'Sure?', ...rest }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  // A destructive action that fires on the first click is a bug waiting for a
  // mis-tap; a modal for deleting one row is heavy. Arming for three seconds is
  // the middle ground, and it disarms itself so nothing stays hot.
  const click = () => {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 3000);
      return;
    }
    clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  };

  return (
    <Button variant={armed ? 'danger' : 'subtle'} size="sm" onClick={click} {...rest}>
      <Icon name="trash" className="size-3.5" />
      {armed ? confirmLabel : label}
    </Button>
  );
}

/* ─────────────────────────────────  Misc  ──────────────────────────────── */

export function ThemeToggle({ theme, onChange, compact = false, className = '' }) {
  const order = ['dark', 'light', 'system'];
  const meta = {
    dark: { icon: 'moon', label: 'Dark' },
    light: { icon: 'sun', label: 'Bright' },
    system: { icon: 'settings', label: 'Auto' },
  };
  const next = order[(order.indexOf(theme) + 1) % order.length];
  const current = meta[theme] || meta.dark;

  return (
    <button
      onClick={() => onChange(next)}
      aria-label={`Theme: ${current.label}. Switch to ${meta[next].label}`}
      title={`${current.label} — tap for ${meta[next].label}`}
      className={`${
        compact
          ? 'size-9 rounded-xl grid place-items-center text-dim transition-all hover:[background:var(--surface)] hover:text-[color:var(--text)] active:scale-90'
          : 'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13.5px] font-medium text-dim transition-all hover:[background:var(--surface)] hover:text-[color:var(--text)]'
      } ${className}`}
    >
      <Icon name={current.icon} className="size-[18px] shrink-0" />
      {!compact && (
        <>
          <span>{current.label}</span>
          <span className="ml-auto text-[11px] text-faint">Tap to switch</span>
        </>
      )}
    </button>
  );
}

export function Empty({ icon = 'ledger', title, body, action }) {
  return (
    <div className="text-center py-10 px-6">
      <div className="mx-auto size-14 rounded-2xl grid place-items-center surface mb-3.5">
        <Icon name={icon} className="size-6 text-faint" />
      </div>
      <p className="font-medium text-[15px]">{title}</p>
      {body && <p className="text-[13px] text-dim mt-1.5 max-w-sm mx-auto leading-relaxed">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className = '' }) {
  const tones = {
    neutral: '[background:var(--border)] text-dim border-hair',
    good: 'bg-emerald-500/14 text-good border-emerald-400/25',
    warn: 'bg-amber-500/14 text-warn border-amber-400/25',
    bad: 'bg-rose-500/14 text-bad border-rose-400/25',
    info: 'bg-sky-500/14 text-info border-sky-400/25',
    brand: 'bg-brand-500/16 text-brandy border-brand-400/30',
    earn: 'bg-emerald-500/14 text-earn border-emerald-400/25',
    spend: 'bg-rose-500/14 text-spend border-rose-400/25',
    save: 'bg-sky-500/14 text-save border-sky-400/25',
    invest: 'bg-amber-500/14 text-invest border-amber-400/25',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [message, onDone]);

  if (!message) return null;
  return createPortal(
    /* Announced rather than merely shown: a confirmation nobody can perceive is
       not a confirmation. `polite` so it waits for a pause instead of cutting
       across whatever is being read. */
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 bottom-24 sm:bottom-8 z-[60] animate-rise"
    >
      <div className="surface rounded-2xl px-4 py-2.5 flex items-center gap-2.5 text-sm shadow-xl"
           style={{ background: 'var(--bg-elev)' }}>
        <span className="grid place-items-center size-5 rounded-full bg-brand-500/25 text-brandy">
          <Icon name="check" className="size-3.5" />
        </span>
        {message}
      </div>
    </div>,
    document.body
  );
}

/** A round category badge — the one visual that identifies a row at a glance. */
export function CategoryDot({ color, icon, size = 'md', className = '' }) {
  const dims = { sm: 'size-7', md: 'size-9', lg: 'size-11' };
  const inner = { sm: 'size-3.5', md: 'size-[17px]', lg: 'size-5' };
  return (
    <span
      className={`${dims[size]} rounded-xl grid place-items-center shrink-0 ${className}`}
      style={{ background: `${color}1f`, color, boxShadow: `inset 0 0 0 1px ${color}33` }}
    >
      <Icon name={icon} className={inner[size]} />
    </span>
  );
}

/** Tooltip styling shared by every recharts surface in the app. */
export const tooltipStyle = {
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 14,
  fontSize: 12,
  padding: '8px 10px',
  boxShadow: 'var(--shadow-card)',
};
