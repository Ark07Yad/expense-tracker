/**
 * A suggestion box for one advisor section, placed on the screen that section
 * is about — investments on Invest, spending on Trends, budgets in Settings.
 *
 * The advisor tab still has every section; this puts the relevant one where
 * you would act on it. Same rules and the same dismissals, so a card dismissed
 * here is gone from the advisor too.
 *
 * Actions resolve in order: an `intent` this screen can handle in place (open a
 * sheet, scroll to an editor), otherwise navigate — unless `to` is the screen
 * you are already on, where navigating would do nothing visible.
 *
 * Pass `sections` to make one box switchable between related sections — Trends
 * carries spending, income and savings in one box rather than three stacked.
 * Each entry may override `label`, `sub` and `quiet`.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { liveSuggestions } from '../lib/insights';
import { Button, Card, Icon, SectionTitle, Segmented } from './ui';
import SuggestionCard from './SuggestionCard';

export default function SectionTips({
  section: initial,
  sections = null,
  label,
  sub,
  hide = [],
  footnoteId = null,
  intents = {},
  here = null,
  onNavigate,
  first = 4,
  quiet = 'Nothing to flag here right now.',
}) {
  const { state, dispatch } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(initial);
  const current = sections?.find((x) => x.value === active) || {};
  const section = active;
  const boxLabel = current.label || label;
  const boxSub = current.sub || sub;
  const boxQuiet = current.quiet || quiet;

  const pick = (value) => {
    setActive(value);
    setExpanded(false);
  };
  const hideKey = hide.join('|');

  const { cards, hiddenCount, footnote } = useMemo(() => {
    const live = liveSuggestions(state, section);
    const skip = new Set(hideKey ? hideKey.split('|') : []);
    if (footnoteId) skip.add(footnoteId);
    return {
      cards: live.shown.filter((s) => !skip.has(s.id)),
      hiddenCount: live.hidden,
      footnote: footnoteId ? live.shown.find((s) => s.id === footnoteId) || null : null,
    };
  }, [state, section, hideKey, footnoteId]);

  const act = (action) => {
    const handler = action.intent && intents[action.intent];
    if (handler) handler(action);
    else if (action.to && action.to !== here) onNavigate?.(action.to);
  };

  const visible = expanded ? cards : cards.slice(0, first);

  return (
    <section aria-label={boxLabel}>
      <SectionTitle
        icon="compass"
        sub={boxSub}
        action={
          <div className="flex items-center gap-1.5">
            {hiddenCount > 0 && (
              <Button size="sm" variant="subtle" onClick={() => dispatch({ type: 'restoreDismissed' })}>
                <Icon name="undo" className="size-3.5" />
                Restore {hiddenCount}
              </Button>
            )}
            {onNavigate && (
              <Button size="sm" variant="subtle" onClick={() => onNavigate(`section:${section}`)}>
                Notes
                <Icon name="chevR" className="size-3.5" />
              </Button>
            )}
          </div>
        }
      >
        Suggestion box
      </SectionTitle>

      {sections && (
        <Segmented
          size="sm"
          className="mb-3"
          value={active}
          onChange={pick}
          options={sections.map(({ value, label: l, icon }) => ({ value, label: l.replace(/ suggestions$/, ''), icon }))}
        />
      )}

      {cards.length === 0 ? (
        <Card className="p-4">
          <div className="flex items-center gap-3 text-[13px] text-dim">
            <Icon name="check" className="size-4 text-good shrink-0" />
            {hiddenCount > 0 ? 'Everything here has been dismissed. Restore them if you want another look.' : boxQuiet}
          </div>
        </Card>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            {visible.map((s, i) => (
              <SuggestionCard
                key={s.id}
                s={s}
                index={i}
                onAction={act}
                onDismiss={(id) => dispatch({ type: 'dismiss', id })}
              />
            ))}
          </div>
          {cards.length > first && (
            <div className="flex justify-center mt-3">
              <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                {expanded ? 'Show fewer' : `Show ${cards.length - first} more`}
                <Icon name={expanded ? 'chevU' : 'chevD'} className="size-3.5" />
              </Button>
            </div>
          )}
        </>
      )}

      {footnote && <p className="text-[11.5px] text-faint leading-relaxed mt-3 px-1">{footnote.body}</p>}
    </section>
  );
}
