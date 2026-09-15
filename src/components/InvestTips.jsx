/**
 * The Invest screen's suggestion box.
 *
 * The summary and empty-state cards are left out because the hero above
 * already says both; the disclaimer becomes a footnote rather than a card.
 */

import { useStore } from '../lib/store';
import SectionTips from './SectionTips';

export default function InvestTips({ onUpdate, onAdd, onNavigate }) {
  const { state } = useStore();
  if (!state.assets?.length) return null;

  return (
    <SectionTips
      section="investing"
      label="Investment suggestions"
      sub="Read from the holdings you recorded — observations, not advice"
      hide={['inv-summary', 'inv-empty']}
      footnoteId="inv-disclaimer"
      intents={{ update: onUpdate, add: onAdd }}
      here="investments"
      onNavigate={onNavigate}
      quiet="Nothing to flag — values are current and nothing in the figures stands out."
    />
  );
}
