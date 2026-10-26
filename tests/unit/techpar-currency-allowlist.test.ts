/**
 * TechPar's display currency and historical-year labels are read from the URL
 * (and replayed from saved state) and painted into the page with innerHTML.
 * Before 2026-10-24 both were taken verbatim, so a crafted link such as
 * `?u=<img src=x onerror=…>` or `?y1l="><img onerror=…>` injected markup, and
 * the site's CSP allows inline handlers. These tests pin the two boundaries:
 * the currency allowlist (src/i18n/currency.ts) and the escaped label sink.
 */

// @vitest-environment jsdom

import {
  CURRENCIES,
  CURRENCY_SYMBOL,
  DEFAULT_CURRENCY,
  isCurrency,
  parseCurrencyParam,
} from '../../src/i18n/currency';
import { hydrateFromUrl, renderHistRows, syncUrlState } from '../../src/scripts/techpar/dom';
import { tp } from '../../src/scripts/techpar/state';

const PAYLOAD = '<img src=x onerror="window.__pwned=1">';

describe('currency allowlist', () => {
  it('accepts every supported code', () => {
    for (const c of CURRENCIES) expect(parseCurrencyParam(c)).toBe(c);
  });

  it('maps the pre-codes legacy symbols', () => {
    expect(parseCurrencyParam('$')).toBe('USD');
    expect(parseCurrencyParam('€')).toBe('EUR');
    expect(parseCurrencyParam('£')).toBe('GBP');
    expect(parseCurrencyParam('C$')).toBe('CAD');
    expect(parseCurrencyParam('A$')).toBe('AUD');
  });

  it('turns anything else into the default', () => {
    for (const raw of [PAYLOAD, 'usd', 'JPY', '', null, undefined, '$$']) {
      expect(parseCurrencyParam(raw)).toBe(DEFAULT_CURRENCY);
    }
    expect(DEFAULT_CURRENCY).toBe('USD');
    expect(isCurrency(PAYLOAD)).toBe(false);
  });

  it('has a symbol for every code', () => {
    for (const c of CURRENCIES) expect(CURRENCY_SYMBOL[c]).toMatch(/\S/);
  });
});

describe('TechPar hydration paints nothing it was not allowed to', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span class="brutal-field__prefix">$</span>
      <button data-currency="USD" class="tp-seg__btn tp-seg__btn--active"></button>
      <button data-currency="EUR" class="tp-seg__btn"></button>
      <div data-hist-rows></div>
      <button data-hist-add></button>`;
    tp.currency = 'USD';
    tp.historicalPoints = [];
    tp.stageKey = null;
  });

  function load(query: string) {
    window.history.replaceState(null, '', `/hub/tools/techpar/?${query}`);
    hydrateFromUrl();
  }

  it('a malicious ?u= falls back to USD and injects no element', () => {
    load(`s=series_bc&a=10000000&u=${encodeURIComponent(PAYLOAD)}`);
    expect(tp.currency).toBe('USD');
    renderHistRows(() => {});
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('.brutal-field__prefix')?.textContent).toBe('$');
  });

  it('a legacy ?u=€ link still opens in EUR', () => {
    load('s=series_bc&a=10000000&u=%E2%82%AC');
    expect(tp.currency).toBe('EUR');
    expect(document.querySelector('.brutal-field__prefix')?.textContent).toBe('€');
    expect(
      document.querySelector('[data-currency="EUR"]')?.classList.contains('tp-seg__btn--active')
    ).toBe(true);
  });

  it('a missing ?u= means USD', () => {
    tp.currency = 'EUR';
    load('s=series_bc&a=10000000');
    expect(tp.currency).toBe('USD');
  });

  it('a malicious historical-year label is escaped, not parsed', () => {
    const label = `"><img src=x onerror="window.__pwned=1">`;
    load(`s=series_bc&a=10000000&y1a=5000000&y1t=900000&y1l=${encodeURIComponent(label)}`);
    expect(tp.historicalPoints.length).toBe(1);
    renderHistRows(() => {});
    expect(document.querySelector('img')).toBeNull();
    const input = document.querySelector<HTMLInputElement>('[data-hist-label="0"]');
    expect(input?.value).toBe(label);
  });

  it('serializes the currency as a code even when it is the default', () => {
    tp.stageKey = 'series_bc';
    tp.currency = 'USD';
    document.body.insertAdjacentHTML('beforeend', '<input data-input="arr" value="10000000">');
    syncUrlState();
    expect(new URLSearchParams(window.location.search).get('u')).toBe('USD');
  });
});
