// Specimen gallery — GST navigation and wayfinding classes
// (src/styles/components/breadcrumb.css, form.css § brutal-tab, filter.css §
// brutal-search, map.css § brutal-panel). Ported from BrandUILibrary.astro,
// BrandComponents.astro and the regulatory-map page.
import * as React from 'react';
import { Stack, Row } from './_kit';

export const NavigationSpecimen = () => (
  <Stack>
    <Row label="Breadcrumb">
      {/* BrandUILibrary.astro § Breadcrumb — aria-current="page" is
          load-bearing (it is the only rule that mutes the current crumb);
          the __sep sits INSIDE the preceding <li>. */}
      <nav aria-label="Breadcrumb" className="brutal-breadcrumb">
        <ol className="brutal-breadcrumb__list">
          <li className="brutal-breadcrumb__item">
            <a href="#">Home</a>
            <span className="brutal-breadcrumb__sep" aria-hidden="true">
              /
            </span>
          </li>
          <li className="brutal-breadcrumb__item">
            <a href="#">Hub</a>
            <span className="brutal-breadcrumb__sep" aria-hidden="true">
              /
            </span>
          </li>
          <li className="brutal-breadcrumb__item">
            <span aria-current="page">Current Page</span>
          </li>
        </ol>
      </nav>
    </Row>

    <Row label="Tab strip with progress (brutal-tab)">
      {/* BrandComponents.astro § Tabs — the opaque, wizard-ish strip: --done
          marks visited steps, __badge--on shows an attention dot. Sticky by
          default (position overridden here for the gallery). For frosted
          in-tool panel switching use .tool-tab-bar instead (ToolChromeSpecimen). */}
      <div className="brutal-tab-bar" role="tablist" style={{ position: 'static', width: '100%' }}>
        <button
          className="brutal-tab brutal-tab--active"
          type="button"
          role="tab"
          aria-selected="true"
        >
          <span className="brutal-tab__label">Active</span>
        </button>
        <button
          className="brutal-tab brutal-tab--done"
          type="button"
          role="tab"
          aria-selected="false"
        >
          <span className="brutal-tab__label">Done</span>
        </button>
        <button className="brutal-tab" type="button" role="tab" aria-selected="false">
          <span className="brutal-tab__label">Needs input</span>
          <span className="brutal-tab__badge brutal-tab__badge--on" />
        </button>
        <button className="brutal-tab" type="button" role="tab" aria-selected="false">
          <span className="brutal-tab__label">Inactive</span>
        </button>
      </div>
    </Row>

    <Row label="Search with results">
      {/* regulatory-map/index.astro § search — the results list is a SIBLING
          of .brutal-search inside a position:relative wrapper; --active marks
          the keyboard-highlighted result; __category takes a data-domain modifier. */}
      <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
        <div className="brutal-search">
          <svg
            className="brutal-search__icon"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M10.5 10.5L14.5 14.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="search"
            className="brutal-search__input"
            placeholder="Search regulations..."
            aria-label="Search regulations"
            autoComplete="off"
            defaultValue="GD"
          />
          <button className="brutal-search__clear" aria-label="Clear search" type="button">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M3 3l8 8M11 3l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div
          className="brutal-search__results"
          role="listbox"
          aria-label="Search results"
          style={{ position: 'static' }}
        >
          <div
            className="brutal-search__result brutal-search__result--active"
            role="option"
            aria-selected="true"
          >
            <span className="brutal-search__result-name">GDPR</span>
            <span className="brutal-search__result-meta">
              <span className="brutal-search__category brutal-search__category--privacy">
                Privacy
              </span>
            </span>
          </div>
          <div className="brutal-search__result" role="option" aria-selected="false">
            <span className="brutal-search__result-name">EU AI Act</span>
            <span className="brutal-search__result-meta">
              <span className="brutal-search__category brutal-search__category--ai">AI</span>
            </span>
          </div>
        </div>
      </div>
    </Row>

    <Row label="Detail panel with copy-link">
      {/* CompliancePanel.astro — bordered side panel: __header holds __title +
          __copy (icon button, __copy--copied for the 2s feedback state) +
          __count. Height/stickiness are the page's job. */}
      <aside className="brutal-panel" style={{ width: '100%', maxWidth: '360px' }}>
        <div className="brutal-panel__header">
          <h2 className="brutal-panel__title">Germany</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <button
              className="brutal-panel__copy"
              aria-label="Copy link to this view"
              type="button"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M6.5 9.5l3-3M5.5 7L4 8.5a2.12 2.12 0 003 3L8.5 10m-1-3.5L9 5l1.5-1.5a2.12 2.12 0 013 3L12 8"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <span className="brutal-panel__count">5 regulations</span>
          </div>
        </div>
        <p className="brutal-text-small" style={{ padding: 'var(--spacing-md)' }}>
          Panel body — cards, lists, or text.
        </p>
      </aside>
    </Row>
  </Stack>
);
