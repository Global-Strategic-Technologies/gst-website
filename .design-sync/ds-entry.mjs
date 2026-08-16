// design-sync bundle entry — deliberately exports nothing.
//
// GST is a *tokens-only* design system as far as claude.ai/design is concerned:
// the site's components are `.astro` files, which have no React runtime the
// Design agent could import. What ships is the CSS design system (tokens,
// typography, palettes, component stylesheets) plus the styling guidelines.
//
// The converter treats a zero-export entry + a `cssEntry` as the documented
// tokens-only shape (lib/source-kit.mjs: "no component exports — treating as
// tokens-only DS") and emits an empty-bodied `_ds_bundle.js`.
export {};
