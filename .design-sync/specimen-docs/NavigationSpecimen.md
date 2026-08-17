---
category: Specimens
---

**A specimen gallery, not a component. Do not render `<NavigationSpecimen />` in a design.**
Copy the markup below.

### Breadcrumb

`aria-current="page"` is load-bearing — it is the only rule that mutes the current crumb.
The `__sep` lives inside the _preceding_ `<li>`, not between items.

```jsx
<nav aria-label="Breadcrumb" className="brutal-breadcrumb">
  <ol className="brutal-breadcrumb__list">
    <li className="brutal-breadcrumb__item">
      <a href="/">Home</a>
      <span className="brutal-breadcrumb__sep" aria-hidden="true">
        /
      </span>
    </li>
    <li className="brutal-breadcrumb__item">
      <span aria-current="page">Current Page</span>
    </li>
  </ol>
</nav>
```

### Tab strip with progress (`.brutal-tab`)

Opaque, sticky by default. `--active` is current, `--done` marks visited steps (primary
underline), `__badge` + `__badge--on` shows an attention dot. Children are `__label`
(required) and `__icon` (optional). Add `role="tablist"` / `aria-selected` yourself.
For frosted in-tool panel switching use `.tool-tab-bar` (ToolChromeSpecimen).

```jsx
<div className="brutal-tab-bar" role="tablist">
  <button className="brutal-tab brutal-tab--active" type="button" role="tab" aria-selected="true">
    <span className="brutal-tab__label">Active</span>
  </button>
  <button className="brutal-tab brutal-tab--done" type="button" role="tab" aria-selected="false">
    <span className="brutal-tab__label">Done</span>
  </button>
  <button className="brutal-tab" type="button" role="tab" aria-selected="false">
    <span className="brutal-tab__label">Needs input</span>
    <span className="brutal-tab__badge brutal-tab__badge--on" />
  </button>
</div>
```

### Search with results

`.brutal-search` is the input row (`__icon`, `__input` as `<input type="search">`,
`__clear` — toggle `hidden` on it). `.brutal-search__results` is a **sibling** of the
block inside a `position: relative` wrapper (it is absolutely positioned below the
input). `__result--active` marks the keyboard-highlighted row; `__category` takes one
of `--privacy` / `--ai` / `--industry` / `--cyber`; `__no-results` is the empty state.

```jsx
<div style={{ position: 'relative' }}>
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
    />
    <button className="brutal-search__clear" aria-label="Clear search" type="button" hidden>
      ×
    </button>
  </div>
  <div className="brutal-search__results" role="listbox" aria-label="Search results">
    <div
      className="brutal-search__result brutal-search__result--active"
      role="option"
      aria-selected="true"
    >
      <span className="brutal-search__result-name">GDPR</span>
      <span className="brutal-search__result-meta">
        <span className="brutal-search__category brutal-search__category--privacy">Privacy</span>
      </span>
    </div>
    <div className="brutal-search__no-results">No regulations found</div>
  </div>
</div>
```

### Detail panel

`.brutal-panel` is a bordered side/detail panel (3px primary top rule): `__header` holds
`__title`, an optional `__copy` icon button (`__copy--copied` for the 2s feedback state)
and `__count`. Height, stickiness and mobile sheet behaviour are the page's job.

```jsx
<aside className="brutal-panel" aria-live="polite">
  <div className="brutal-panel__header">
    <h2 className="brutal-panel__title">Germany</h2>
    <button className="brutal-panel__copy" aria-label="Copy link to this view" type="button">
      …icon…
    </button>
    <span className="brutal-panel__count">5 regulations</span>
  </div>
  …body…
</aside>
```
