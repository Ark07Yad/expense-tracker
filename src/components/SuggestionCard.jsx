/**
 * One suggestion, as the advisor and the Invest screen both show it.
 *
 * Shared so a rule reads the same wherever it surfaces — same tone label, same
 * dismiss, same action button — and so dismissing it in one place is visibly
 * the same act as dismissing it in the other.
 */

import { Badge, Button, Card, Icon, IconButton, stagger } from './ui';

export const TONE_LABEL = {
  bad: 'Needs attention',
  warn: 'Heads up',
  info: 'Worth knowing',
  good: 'Going well',
};

export default function SuggestionCard({ s, index = 0, onAction, onDismiss }) {
  return (
    <Card className="p-4 animate-rise" style={stagger(index)}>
      <div className="flex items-start gap-3">
        <span
          className="size-9 rounded-xl grid place-items-center shrink-0"
          style={{
            background: `color-mix(in srgb, var(--tone-${s.tone}) 15%, transparent)`,
            color: `var(--tone-${s.tone})`,
          }}
        >
          <Icon name={s.icon} className="size-[17px]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone={s.tone === 'bad' ? 'bad' : s.tone === 'warn' ? 'warn' : s.tone === 'good' ? 'good' : 'info'}>
              {TONE_LABEL[s.tone]}
            </Badge>
          </div>
          <h3 className="text-[14px] font-semibold leading-snug">{s.title}</h3>
          <p className="text-[12.5px] text-dim mt-1.5 leading-relaxed">{s.body}</p>

          {s.action && onAction && (
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => onAction(s.action)}>
              {s.action.label}
              <Icon name="chevR" className="size-3.5" />
            </Button>
          )}
        </div>

        {onDismiss && (
          <IconButton
            name="x"
            label="Dismiss"
            className="size-7 shrink-0 -mt-1 -mr-1"
            onClick={() => onDismiss(s.id)}
          />
        )}
      </div>
    </Card>
  );
}
