import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './lib/store';
import { formatMoney, shortDate, todayKey } from './lib/calc';
import { categoryById } from './lib/data';
import { SECTIONS } from './lib/insights';
import { useSlidingIndicator } from './lib/motion';
import { installSpotlight } from './lib/spotlight';
import { SHORTCUTS, useShortcuts } from './lib/useShortcuts';
import Onboarding from './components/Onboarding';
import Dashboard from './components/Dashboard';
import Ledger from './components/Ledger';

/*
 * Everything past the first two screens is loaded on demand.
 *
 * Home and Ledger are where every session starts and where most of it is
 * spent; the other four are visited occasionally and drag in the heaviest
 * dependency in the app between them. Splitting them keeps the first paint to
 * what is actually about to be shown, and each chunk is then cached separately
 * — a change to Settings no longer invalidates the bundle everyone downloads.
 */
const Analytics = lazy(() => import('./components/Analytics'));
const Investments = lazy(() => import('./components/Investments'));
const Advisor = lazy(() => import('./components/Advisor'));
const Settings = lazy(() => import('./components/Settings'));
import EntrySheet from './components/EntrySheet';
import CommandPalette from './components/CommandPalette';
import { Icon, IconButton, Sheet, ThemeToggle, Toast } from './components/ui';

/* Carries the AI provider code, so only when someone asks. */
const AiAdvisor = lazy(() => import('./components/AiAdvisor'));

const NAV = [
  { id: 'home',      label: 'Home',    icon: 'home' },
  { id: 'ledger',    label: 'Ledger',  icon: 'ledger' },
  { id: 'analytics', label: 'Trends',  icon: 'chart' },
  { id: 'invest',    label: 'Invest',  icon: 'coins' },
  { id: 'advisor',   label: 'Advice',  icon: 'compass' },
];

const EXTRA = [{ id: 'settings', label: 'Settings', icon: 'settings' }];

/** ⌘ on Apple keyboards, Ctrl everywhere else — shown next to the search box. */
const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
    ? '⌘'
    : 'Ctrl ';

const thumbStyle = (box) => ({
  width: box.w,
  height: box.h,
  transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
});

/**
 * True while any dialog is on screen, including the ones individual screens
 * open for themselves. The app shell cannot know about those by state, and
 * stacking a second modal on top of one is how focus gets lost.
 */
const dialogOnScreen = () => typeof document !== 'undefined' && !!document.querySelector('[role="dialog"]');

/**
 * Placeholder while a screen's chunk arrives.
 *
 * Shaped like the cards it replaces rather than a spinner: on a fast connection
 * this is on screen for a frame or two, and a shape that matches what follows
 * reads as loading rather than as a jolt.
 */
function ScreenSkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {[176, 260, 200].map((h, i) => (
        <div
          key={i}
          className="surface rounded-3xl animate-pulse"
          style={{ height: h, opacity: 0.6 - i * 0.15 }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState('home');
  const [date, setDate] = useState(todayKey());
  const [toastMsg, setToastMsg] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  /** Which advisor section to land on when a suggestion is followed. */
  const [advisorSection, setAdvisorSection] = useState('overall');
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** The button that opened the search box, so focus can go back to it. */
  const paletteTrigger = useRef(null);
  const openPalette = (event) => {
    paletteTrigger.current = event?.currentTarget || null;
    setPaletteOpen(true);
  };
  /** Which topic the AI sheet was opened on from the palette, if any. */
  const [aiTopic, setAiTopic] = useState(null);

  const toast = useCallback((m) => setToastMsg(m), []);

  /**
   * One navigation function for the whole app.
   *
   * Suggestions can target a screen *or* a specific advisor section via a
   * `section:<id>` target, so a card that says "dining is 41% of your spending"
   * can open the dining deep dive rather than dumping you on a generic page.
   */
  const navigate = useCallback((target) => {
    if (typeof target === 'string' && target.startsWith('section:')) {
      setAdvisorSection(target.slice(8));
      setTab('advisor');
    } else if (target === 'investments') {
      setTab('invest');
    } else if (target === 'compose') {
      setComposerOpen(true);
      return;
    } else {
      setTab(target);
    }
    setMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /*
   * Shortcuts are disabled while a dialog is open: the sheet owns the keyboard
   * then, and a stray "2" behind a modal navigating the page underneath would
   * be baffling.
   */
  const anyDialogOpen = composerOpen || moreOpen || helpOpen || paletteOpen || !!aiTopic;
  const nextTheme = { dark: 'light', light: 'system', system: 'dark' };

  const shortcuts = useMemo(
    () => ({
      1: () => navigate('home'),
      2: () => navigate('ledger'),
      3: () => navigate('analytics'),
      4: () => navigate('invest'),
      5: () => navigate('advisor'),
      6: () => navigate('settings'),
      n: () => setComposerOpen(true),
      t: () => {
        setDate(todayKey());
        navigate('ledger');
      },
      d: () => dispatch({ type: 'theme', theme: nextTheme[state.theme] || 'dark' }),
      '?': () => setHelpOpen(true),
      '/': () => {
        if (dialogOnScreen()) return;
        paletteTrigger.current = null;
        setPaletteOpen(true);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, state.theme]
  );

  useShortcuts(shortcuts, { enabled: state.onboarded && !anyDialogOpen });

  /*
   * ⌘K / Ctrl+K, handled apart from the single-key shortcuts: those are ignored
   * while typing, and this one is meant to work from inside a field too.
   */
  useEffect(() => {
    if (!state.onboarded) return undefined;
    const onKey = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (String(event.key).toLowerCase() !== 'k') return;
      event.preventDefault();
      paletteTrigger.current = null;
      setPaletteOpen((open) => (open ? false : !dialogOnScreen()));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.onboarded]);

  useEffect(() => installSpotlight(), []);

  // Re-measured once onboarding hands over to the app, when the nav first exists.
  const sideNav = useSlidingIndicator(tab, String(state.onboarded));
  const bottomNav = useSlidingIndicator(tab, String(state.onboarded));

  /** Everything the search box can reach, in the order it is listed. */
  const commands = useMemo(
    () => [
      ...[...NAV, ...EXTRA].map((item, i) => ({
        id: `go-${item.id}`,
        group: 'Go to',
        label: item.label,
        icon: item.icon,
        hint: String(i + 1),
        keywords: `open show screen ${item.id}`,
        run: () => navigate(item.id),
      })),
      {
        id: 'new-entry', group: 'Actions', label: 'New entry', icon: 'plus', hint: 'N',
        keywords: 'add log expense earning saving',
        run: () => setComposerOpen(true),
      },
      {
        id: 'today', group: 'Actions', label: 'Jump to today', icon: 'calendar', hint: 'T',
        keywords: 'ledger now',
        run: () => {
          setDate(todayKey());
          navigate('ledger');
        },
      },
      {
        id: 'theme', group: 'Actions', label: 'Switch theme', icon: 'moon', hint: 'D',
        keywords: 'dark light system appearance',
        run: () => dispatch({ type: 'theme', theme: nextTheme[state.theme] || 'dark' }),
      },
      {
        id: 'shortcuts', group: 'Actions', label: 'Keyboard shortcuts', icon: 'info', hint: '?',
        keywords: 'help keys',
        run: () => setHelpOpen(true),
      },
      ...[
        ['investing', 'Ask AI about investing'],
        ['spending', 'Ask AI about spending'],
        ['saving', 'Ask AI about saving'],
        ['budgets', 'Ask AI about budgets'],
        // Nothing to ask about until a debt is recorded.
        ...(state.debts?.length ? [['debt', 'Ask AI about what you owe']] : []),
      ].map(([topic, label]) => ({
        id: `ai-${topic}`,
        group: 'Ask AI',
        label,
        icon: 'spark',
        keywords: 'advice guidance model assistant',
        run: () => setAiTopic(topic),
      })),
      ...SECTIONS.map((section) => ({
        id: `tips-${section.id}`,
        group: 'Suggestions',
        label: `Suggestions: ${section.label}`,
        icon: section.icon,
        keywords: 'advice tips',
        run: () => navigate(`section:${section.id}`),
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, state.theme, state.debts?.length]
  );

  /** Ledger entries matching a query, newest first, as things the box can open. */
  const findEntries = useCallback(
    (query) =>
      state.entries
        .filter((e) =>
          `${e.title} ${e.note || ''} ${categoryById(e.category)?.label || ''}`.toLowerCase().includes(query)
        )
        .toSorted((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 6)
        .map((e) => ({
          id: `entry-${e.id}`,
          group: 'Entries',
          label: e.title,
          icon: categoryById(e.category)?.icon || 'ledger',
          hint: `${shortDate(e.date)} · ${formatMoney(e.amount, state.profile.currency)}`,
          run: () => {
            setDate(e.date);
            navigate('ledger');
          },
        })),
    [state.entries, state.profile.currency, navigate]
  );

  if (!state.onboarded) return <Onboarding />;

  const allNav = [...NAV, ...EXTRA];
  const inExtra = EXTRA.some((i) => i.id === tab);

  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="mx-auto max-w-[92rem] flex gap-6 px-4 sm:px-6">
        {/* ── Sidebar (desktop) ── */}
        <aside className="hidden lg:flex flex-col w-56 shrink-0 sticky top-0 h-dvh py-6">
          <button
            onClick={() => navigate('home')}
            className="flex items-center gap-2.5 px-2 mb-8 text-left transition-opacity hover:opacity-80"
          >
            <span className="size-9 rounded-xl grid place-items-center metal">
              <Icon name="chart" className="size-[18px]" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight display">CoinTrack</span>
          </button>

          <button
            onClick={openPalette}
            aria-haspopup="dialog"
            className="surface flex items-center gap-2.5 px-3 py-2 mb-3 rounded-2xl text-[13px] text-faint
                       transition-colors hover:text-[color:var(--text)] hover:[background:var(--surface-hover)]"
          >
            <Icon name="search" className="size-4 shrink-0" />
            <span>Search or jump…</span>
            <kbd className="ml-auto text-[10.5px] px-1.5 py-0.5 rounded surface">{MOD}K</kbd>
          </button>

          <nav ref={sideNav.ref} className="relative flex flex-col gap-1">
            {sideNav.box && (
              <span aria-hidden="true" className="thumb rounded-2xl [background:var(--surface-hover)]" style={thumbStyle(sideNav.box)} />
            )}
            {allNav.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
                data-active={tab === item.id}
                className={`relative z-[1] flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13.5px] font-medium transition-colors
                  ${tab === item.id
                    ? `text-[color:var(--text)] ${sideNav.box ? '' : '[background:var(--surface-hover)]'}`
                    : 'text-dim hover:[background:var(--surface)] hover:text-[color:var(--text)]'}`}
              >
                <Icon name={item.icon} className="size-[18px]" />
                {item.label}
                {tab === item.id && <span className="ml-auto size-1.5 rounded-full bg-brand-400" />}
              </button>
            ))}
          </nav>

          <button
            onClick={() => setComposerOpen(true)}
            className="metal mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl
                       text-[13.5px] font-medium transition-all hover:opacity-90 active:scale-[0.97]"
          >
            <Icon name="plus" className="size-4" />
            New entry
          </button>

          <div className="mt-auto space-y-1">
            <ThemeToggle theme={state.theme} onChange={(theme) => dispatch({ type: 'theme', theme })} />
            <button
              onClick={() => setHelpOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[13.5px] font-medium
                         text-dim transition-all hover:[background:var(--surface)] hover:text-[color:var(--text)]"
            >
              <Icon name="info" className="size-[18px] shrink-0" />
              <span>Shortcuts</span>
              <kbd className="ml-auto text-[11px] px-1.5 py-0.5 rounded surface text-faint">?</kbd>
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <main id="main" tabIndex={-1} className="flex-1 min-w-0 py-5 sm:py-6 pb-28 lg:pb-8 outline-none">
          {/* Mobile header */}
          <header className="lg:hidden flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <span className="size-9 rounded-xl grid place-items-center metal">
                <Icon name="chart" className="size-[18px]" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight display">CoinTrack</span>
            </div>
            <div className="flex items-center gap-1">
              <IconButton name="search" label="Search and jump" className="size-11" onClick={openPalette} />
              <ThemeToggle compact theme={state.theme} onChange={(theme) => dispatch({ type: 'theme', theme })} />
            </div>
          </header>

          <div key={tab} className="animate-rise">
            <Suspense fallback={<ScreenSkeleton />}>
              {tab === 'home' && <Dashboard onNavigate={navigate} />}
              {tab === 'ledger' && <Ledger date={date} setDate={setDate} toast={toast} />}
              {tab === 'analytics' && <Analytics onNavigate={navigate} />}
              {tab === 'invest' && <Investments toast={toast} onNavigate={navigate} />}
              {tab === 'advisor' && (
                <Advisor section={advisorSection} setSection={setAdvisorSection} onNavigate={navigate} toast={toast} />
              )}
              {tab === 'settings' && <Settings toast={toast} onNavigate={navigate} />}
            </Suspense>
          </div>
        </main>
      </div>

      {/* ── Add button (mobile) ── */}
      <button
        onClick={() => setComposerOpen(true)}
        aria-label="New entry"
        className="lg:hidden fixed right-4 bottom-24 z-40 size-14 rounded-2xl metal grid place-items-center
                   transition-all active:scale-90"
      >
        <Icon name="plus" className="size-6" />
      </button>

      {/* ── Bottom nav (mobile) ── */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pt-2"
        style={{ background: 'linear-gradient(to top, var(--bg) 62%, transparent)' }}
      >
        <div
          ref={bottomNav.ref}
          className="surface relative rounded-3xl flex justify-around p-1.5"
          style={{ background: 'var(--bg-elev)' }}
        >
          {bottomNav.box && (
            <span aria-hidden="true" className="thumb rounded-2xl [background:var(--surface-hover)]" style={thumbStyle(bottomNav.box)} />
          )}
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              data-active={tab === item.id}
              className={`relative z-[1] flex flex-col items-center gap-1 px-2 py-2 rounded-2xl transition-all active:scale-90
                ${tab === item.id ? 'text-[color:var(--text)]' : 'text-faint'}`}
            >
              <Icon name={item.icon} className="size-[19px]" />
              <span className="text-[9.5px] font-medium">{item.label}</span>
            </button>
          ))}
          <button
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            data-active={inExtra}
            className={`relative z-[1] flex flex-col items-center gap-1 px-2 py-2 rounded-2xl transition-all active:scale-90
              ${inExtra ? 'text-[color:var(--text)]' : 'text-faint'}`}
          >
            <span className="relative grid place-items-center size-[19px]">
              <Icon name="menu" className="size-[19px]" />
              {inExtra && <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-brand-400" />}
            </span>
            <span className="text-[9.5px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          commands={commands}
          findEntries={findEntries}
          returnFocusTo={paletteTrigger.current}
        />
      )}

      {aiTopic && (
        <Suspense fallback={null}>
          <AiAdvisor topic={aiTopic} onClose={() => setAiTopic(null)} />
        </Suspense>
      )}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More" size="sm">
        <div className="grid gap-1.5 pb-2">
          {EXTRA.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all active:scale-[0.99]
                ${tab === item.id ? 'bg-brand-500/14 text-brandy' : 'surface hover:[background:var(--surface-hover)]'}`}
            >
              <Icon name={item.icon} className="size-[18px] shrink-0" />
              <span className="text-[14px] font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </Sheet>

      <EntrySheet
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        defaultDate={tab === 'ledger' ? date : todayKey()}
        onSaved={toast}
      />

      <Sheet
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Keyboard shortcuts"
        subtitle="Single keys. They stay out of the way while you are typing."
        size="sm"
      >
        <div className="space-y-1">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center gap-3 py-2 border-b border-hair last:border-0">
              <span className="text-[13.5px] flex-1">{s.label}</span>
              {s.keys.map((k) => (
                <kbd
                  key={k}
                  className="text-[12px] font-medium px-2 py-1 rounded-lg surface tabular min-w-8 text-center"
                >
                  {k}
                </kbd>
              ))}
            </div>
          ))}
        </div>
      </Sheet>

      <Toast message={toastMsg} onDone={() => setToastMsg('')} />
    </div>
  );
}
