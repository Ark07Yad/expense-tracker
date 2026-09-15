/**
 * The suggestion box, on the Invest screen itself.
 *
 * The advisor already had an investments section, but it lived a tab away from
 * the holdings it talks about — the place you would act on "three holdings have
 * not been revalued" is exactly the place it was not shown. Here, an action
 * opens the sheet on this screen instead of navigating to it.
 *
 * Same rules, same dismissals as the advisor: a card dismissed here is gone
 * there too. The summary and the empty-state cards are left out, because the
 * hero above already says both.
 */

import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { liveSuggestions } from '../lib/insights';
import { Button, Card, Icon, SectionTitle } from './ui';
import SuggestionCard from './SuggestionCard';

/** Said elsewhere on this screen, so not repeated as a card. */
const HIDDEN_HERE = new Set(['inv-summary', 'inv-empty', 'inv-disclaimer']);
const FIRST = 4;

export default function InvestTips({ onUpdate, onAdd, onNavigate }) {
  const { state, dispatch } = useStore();
  const [expanded, setExpanded] = useState(false);

  const { cards, hidden, disclaimer } = useMemo(() => {
    const live = liveSuggestions(state, 'investing');
    const shown = live.shown;
    return {
      cards: shown.filter((s) => !HIDDEN_HERE.has(s.id)),
      hidden: live.hidden,
      disclaimer: shown.find((s) => s.id === 'inv-disclaimer') || null,
    };
  }, [state]);

  if (!state.assets?.length) return null;

  const act = (action) => {
    if (action.intent === 'update') onUpdate?.();
    else if (action.intent === 'add') onAdd?.();
    else if (action.to && action.to !== 'investments') onNavigate?.(action.to);
  };

  const visible = expanded ? cards : cards.slice(0, FIRST);

  return (
    <section aria-label="Investment suggestions">
      <SectionTitle
        icon="compass"
        sub="Read from the holdings you recorded — observations, not advice"
        action={
          <div className="flex items-center gap-1.5">
            {hidden > 0 && (
              <Button size="sm" variant="subtle" onClick={() => dispatch({ type: 'restoreDismissed' })}>
                <Icon name="undo" className="size-3.5" />
                Restore {hidden}
              </Button>
            )}
            {onNavigate && (
              <Button size="sm" variant="subtle" onClick={() => onNavigate('section:investing')}>
                Notes
                <Icon name="chevR" className="size-3.5" />
              </Button>
            )}
          </div>
        }
      >
        Suggestion box
      </SectionTitle>

      {cards.length === 0 ? (
        <Card className="p-4">
          <div className="flex items-center gap-3 text-[13px] text-dim">
            <Icon name="check" className="size-4 text-good shrink-0" />
            {hidden > 0
              ? 'Everything here has been dismissed. Restore them if you want another look.'
              : 'Nothing to flag — values are current and nothing in the figures stands out.'}
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
          {cards.length > FIRST && (
            <div className="flex justify-center mt-3">
              <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                {expanded ? 'Show fewer' : `Show ${cards.length - FIRST} more`}
                <Icon name={expanded ? 'chevU' : 'chevD'} className="size-3.5" />
              </Button>
            </div>
          )}
        </>
      )}

      {disclaimer && (
        <p className="text-[11.5px] text-faint leading-relaxed mt-3 px-1">{disclaimer.body}</p>
      )}
    </section>
  );
}
