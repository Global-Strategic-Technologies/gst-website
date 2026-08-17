// GST specimen galleries — merged onto window.GST via cfg.extraEntries.
//
// These are DOCUMENTATION, not UI components. Each renders a gallery of the
// design system's CSS classes, the same way src/pages/brand.astro does. To
// build with GST, copy the markup a specimen shows and use the classes
// directly — never import a *Specimen into a design.
//
// _kit.tsx is deliberately NOT re-exported: its Row/Stack helpers are card
// scaffolding, not part of the design system.
export * from './ButtonSpecimen';
export * from './TypographySpecimen';
export * from './CardSpecimen';
export * from './DataSpecimen';
export * from './FormSpecimen';
export * from './FrostedSpecimen';
export * from './ToolShellSpecimen';
export * from './ColorSpecimen';
export * from './ToolChromeSpecimen';
export * from './NavigationSpecimen';
