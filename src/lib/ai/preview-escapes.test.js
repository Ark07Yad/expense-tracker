/**
 * The live preview shows a half-written JSON string, so it has to decode
 * escapes itself. It used to print "Caf\u00e9" as "Cafu00e9".
 */

import { describe, expect, it } from 'vitest';
import { previewFromPartial } from './prompt';

describe('live preview escapes', () => {
  it('decodes unicode escapes rather than printing their digits', () => {
    expect(previewFromPartial('{"summary": "Caf\\u00e9 costs 300\\u20ac').summary).toBe('Café costs 300€');
  });

  it('stops cleanly on a half-arrived escape', () => {
    expect(previewFromPartial('{"summary": "Caf\\u00').summary).toBe('Caf');
    expect(previewFromPartial('{"summary": "Caf\\').summary).toBe('Caf');
  });

  it('keeps quotes and newlines readable', () => {
    expect(previewFromPartial('{"summary": "A \\"tight\\" month,\\nso far').summary).toBe('A "tight" month,\nso far');
  });
});
