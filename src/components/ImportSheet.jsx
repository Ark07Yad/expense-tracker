/**
 * CSV import.
 *
 * Three steps: pick a file, confirm how to read it, review what will be
 * written. The middle step exists because bank exports agree on nothing, and
 * the two things most likely to be silently wrong — date order and which sign
 * means money leaving — are both surfaced as controls rather than assumed.
 *
 * Nothing is written until the last step, and the preview shows real rows, not
 * a count.
 */

import { useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { categoryById } from '../lib/data';
import { dayLabel, formatMoney } from '../lib/calc';
import {
  buildRows, detectDateOrder, guessMapping, parseCsv, summariseRows,
} from '../lib/csv';
import {
  Badge, Button, CategoryDot, Empty, Field, Icon, Money, Segmented, Select, Sheet, stagger,
} from './ui';

const ORDERS = [
  { value: 'DMY', label: 'Day first' },
  { value: 'MDY', label: 'Month first' },
  { value: 'YMD', label: 'Year first' },
];

export default function ImportSheet({ open, onClose, onSaved }) {
  const { state, dispatch } = useStore();
  const cur = state.profile.currency;
  const fileRef = useRef(null);

  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState(null);
  const [dateOrder, setDateOrder] = useState('DMY');
  const [dateGuess, setDateGuess] = useState(null);
  const [flipSign, setFlipSign] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [error, setError] = useState('');

  // Reset on the open transition, so a previous file never leaks into the next.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setParsed(null); setFileName(''); setMapping(null);
      setDateOrder('DMY'); setDateGuess(null); setFlipSign(false); setError('');
    }
  }

  const readFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = parseCsv(String(reader.result));
        if (!next.headers.length || !next.rows.length) throw new Error('empty');

        const map = guessMapping(next.headers);
        if (map.date === -1) throw new Error('no date column');

        const guess = detectDateOrder(next.rows.slice(0, 200).map((r) => r[map.date]));
        setParsed(next);
        setFileName(file.name);
        setMapping(map);
        setDateOrder(guess.order);
        setDateGuess(guess);
        setError('');
      } catch {
        setError('That does not look like a statement export. It needs a header row with at least a date and an amount.');
        setParsed(null);
      }
    };
    reader.readAsText(file);
  };

  const rows = useMemo(
    () => (parsed && mapping ? buildRows(parsed, mapping, { dateOrder, flipSign, existing: state.entries }) : []),
    [parsed, mapping, dateOrder, flipSign, state.entries]
  );
  const summary = useMemo(() => summariseRows(rows), [rows]);

  const toImport = rows.filter((r) => r.ok && (!skipDuplicates || !r.duplicate));

  const confirm = () => {
    if (!toImport.length) return;
    dispatch({ type: 'importEntries', entries: toImport });
    onSaved?.(`Imported ${toImport.length} ${toImport.length === 1 ? 'entry' : 'entries'}`);
    onClose();
  };

  const setColumn = (field, index) => setMapping((m) => ({ ...m, [field]: index }));
  const columnOptions = (parsed?.headers || []).map((h, i) => (
    <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
  ));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Import a statement"
      subtitle={parsed ? fileName : 'A CSV export from your bank'}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center gap-3">
          {parsed && (
            <div className="text-[12px] text-dim min-w-0">
              <span className="font-semibold text-[color:var(--text)]">{toImport.length}</span> to import
              {summary.duplicates > 0 && <> · {summary.duplicates} already logged</>}
              {summary.failed > 0 && <> · {summary.failed} unreadable</>}
            </div>
          )}
          <Button variant="subtle" onClick={onClose} className="ml-auto">Cancel</Button>
          <Button variant="primary" onClick={confirm} disabled={!toImport.length}>
            <Icon name="check" className="size-4" />
            Import {toImport.length || ''}
          </Button>
        </div>
      }
    >
      <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={readFile} />

      {!parsed ? (
        <div className="space-y-4">
          <Empty
            icon="upload"
            title="Choose a CSV file"
            body="Most banks offer a CSV export of a statement. CoinTrack reads it entirely on this device — the file is never uploaded anywhere."
            action={<Button variant="primary" onClick={() => fileRef.current?.click()}>Choose file</Button>}
          />
          {error && <p className="text-[12.5px] text-bad text-center leading-relaxed">{error}</p>}
        </div>
      ) : (
        <div className="space-y-5">
          {/* ── How to read it ── */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-dim">How to read it</span>
              <button
                onClick={() => fileRef.current?.click()}
                className="text-[12px] text-dim hover:text-[color:var(--text)] transition-colors"
              >
                Choose a different file
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Date column">
                <Select value={mapping.date} onChange={(e) => setColumn('date', Number(e.target.value))}>
                  {columnOptions}
                </Select>
              </Field>
              <Field label="Description column">
                <Select value={mapping.description} onChange={(e) => setColumn('description', Number(e.target.value))}>
                  <option value={-1}>None</option>
                  {columnOptions}
                </Select>
              </Field>

              {mapping.debit > -1 || mapping.credit > -1 ? (
                <>
                  <Field label="Money out column">
                    <Select value={mapping.debit} onChange={(e) => setColumn('debit', Number(e.target.value))}>
                      <option value={-1}>None</option>
                      {columnOptions}
                    </Select>
                  </Field>
                  <Field label="Money in column">
                    <Select value={mapping.credit} onChange={(e) => setColumn('credit', Number(e.target.value))}>
                      <option value={-1}>None</option>
                      {columnOptions}
                    </Select>
                  </Field>
                </>
              ) : (
                <Field label="Amount column">
                  <Select value={mapping.amount} onChange={(e) => setColumn('amount', Number(e.target.value))}>
                    <option value={-1}>None</option>
                    {columnOptions}
                  </Select>
                </Field>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <div>
                <span className="block text-[12px] font-medium text-dim mb-1.5">Date order</span>
                <Segmented size="sm" value={dateOrder} onChange={setDateOrder} options={ORDERS} />
                <p className="text-[11px] mt-1.5 leading-relaxed text-faint">
                  {dateGuess?.confident ? (
                    <>Read from the file — one of the dates could only be this way round.</>
                  ) : (
                    <span className="text-warn">
                      Every date in this file works both ways round. Check the preview below before importing.
                    </span>
                  )}
                </p>
              </div>

              {mapping.debit === -1 && mapping.credit === -1 && (
                <div>
                  <span className="block text-[12px] font-medium text-dim mb-1.5">Which sign is spending</span>
                  <Segmented
                    size="sm"
                    value={flipSign ? 'positive' : 'negative'}
                    onChange={(v) => setFlipSign(v === 'positive')}
                    options={[
                      { value: 'negative', label: 'Negative is out' },
                      { value: 'positive', label: 'Positive is out' },
                    ]}
                  />
                  <p className="text-[11px] text-faint mt-1.5 leading-relaxed">
                    Getting this backwards turns spending into income.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Summary ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[
              ['Rows', summary.total],
              ['To import', summary.usable],
              ['Spending', <Money key="s" value={summary.expense} compact />],
              ['Income', <Money key="i" value={summary.earning} compact />],
            ].map(([label, value]) => (
              <div key={label} className="surface rounded-2xl p-3">
                <div className="text-[10.5px] uppercase tracking-wider text-faint">{label}</div>
                <div className="text-[17px] font-semibold display mt-1">{value}</div>
              </div>
            ))}
          </div>

          {summary.usable > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <Badge tone="neutral">
                {dayLabel(summary.from)} → {dayLabel(summary.to)}
              </Badge>
              {summary.duplicates > 0 && (
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={skipDuplicates}
                    onChange={(e) => setSkipDuplicates(e.target.checked)}
                    className="accent-[color:var(--color-brand-500)]"
                  />
                  <span className="text-dim">Skip {summary.duplicates} already in your ledger</span>
                </label>
              )}
            </div>
          )}

          {/* ── Preview ── */}
          <div>
            <span className="block text-[12px] font-semibold uppercase tracking-wider text-dim mb-2">
              Preview · first {Math.min(12, rows.length)} rows
            </span>
            <div className="space-y-1.5">
              {rows.slice(0, 12).map((r, i) => {
                if (!r.ok) {
                  return (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-2xl surface opacity-60" style={stagger(i)}>
                      <span className="size-7 rounded-lg grid place-items-center shrink-0 text-bad"
                            style={{ background: 'color-mix(in srgb, var(--tone-bad) 14%, transparent)' }}>
                        <Icon name="alert" className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1 text-[12.5px] text-dim truncate">
                        {r.raw.slice(0, 4).join(' · ') || 'blank row'}
                      </div>
                      <Badge tone="bad">{r.reason}</Badge>
                    </div>
                  );
                }
                const cat = categoryById(r.category);
                const dim = r.duplicate && skipDuplicates;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-2.5 rounded-2xl surface animate-rise ${dim ? 'opacity-45' : ''}`}
                    style={stagger(i)}
                  >
                    <CategoryDot size="sm" color={cat.color} icon={cat.icon} />
                    <div className="min-w-0 flex-1">
                      <div className={`text-[13px] font-medium truncate ${dim ? 'line-through' : ''}`}>{r.title}</div>
                      <div className="text-[11px] text-faint truncate">{dayLabel(r.date)} · {cat.label}</div>
                    </div>
                    {r.duplicate && <Badge tone="warn">already logged</Badge>}
                    <div className={`text-[13px] font-semibold tabular shrink-0 ${r.kind === 'earning' ? 'text-earn' : 'text-spend'}`}>
                      {r.kind === 'earning' ? '+' : '−'}
                      {formatMoney(r.amount, cur)}
                    </div>
                  </div>
                );
              })}
            </div>
            {rows.length > 12 && (
              <p className="text-[11.5px] text-faint mt-2">
                and {rows.length - 12} more rows read the same way.
              </p>
            )}
          </div>

          <p className="text-[11.5px] text-faint leading-relaxed">
            Categories are guessed from the description and are only a starting point — every entry stays
            editable in the ledger afterwards. Nothing is uploaded; the file is read on this device.
          </p>
        </div>
      )}
    </Sheet>
  );
}
