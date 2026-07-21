/**
 * Type sidecar for radar-mock-data.mjs (same pattern as
 * scripts/extract-irl-markdown.d.mts) so TS test files import the fixture
 * with full typing while the implementation stays plain-Node loadable for
 * the `radar:seed` seeder.
 */
import type { InoreaderStreamResponse } from '../../../src/lib/inoreader/types';

/** Mock response for fetchAnnotatedItems(30) — FYI tier, 7 annotated items, all 4 categories. */
export declare function createMockAnnotatedResponse(): InoreaderStreamResponse;

/** Mock merged response for fetchAllStreams('GST-', 15) — Wire tier, 13 items, all 4 categories, sorted newest-first. */
export declare function createMockAllStreamsResponse(): InoreaderStreamResponse;
