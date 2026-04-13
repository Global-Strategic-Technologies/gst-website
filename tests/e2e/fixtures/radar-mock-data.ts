/**
 * Mock Inoreader API responses for Radar E2E tests.
 *
 * Produces deterministic data that exercises all 4 categories across
 * both FYI (annotated) and Wire (folder stream) tiers.
 *
 * Factory patterns based on tests/integration/radar-data-flow.test.ts.
 */

import type { InoreaderItem, InoreaderStreamResponse } from '../../../src/lib/inoreader/types';

// ---------------------------------------------------------------------------
// Category → folder mapping (mirrors src/lib/inoreader/transform.ts)
// ---------------------------------------------------------------------------

const FOLDER_MAP: Record<string, string> = {
  'pe-ma': 'GST-PE-MA',
  'enterprise-tech': 'GST-Enterprise-Tech',
  'ai-automation': 'GST-AI-Automation',
  security: 'GST-Security',
};

// ---------------------------------------------------------------------------
// Item factories
// ---------------------------------------------------------------------------

let counter = 0;

function makeItem(overrides: Partial<InoreaderItem> & { folder?: string } = {}): InoreaderItem {
  const id = overrides.id ?? `mock-item-${++counter}`;
  const folder = overrides.folder;
  const categories = overrides.categories ?? (folder ? [`user/1234/label/${folder}`] : []);

  // Remove non-standard 'folder' key before spreading
  const { folder: _f, ...rest } = overrides;

  return {
    id,
    title: `Test Article ${id}`,
    published: 1708000000 - counter * 3600, // each item 1 hour apart
    canonical: [{ href: `https://example.com/articles/${id}` }],
    origin: {
      streamId: `feed/https://example.com/feed-${counter}`,
      title: `Example Source ${counter}`,
      htmlUrl: 'https://example.com',
    },
    summary: { content: `<p>Summary of article ${id}.</p>` },
    categories,
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// FYI (annotated) response
// ---------------------------------------------------------------------------

/** Creates a mock response for fetchAnnotatedItems(30). */
export function createMockAnnotatedResponse(): InoreaderStreamResponse {
  const items: InoreaderItem[] = [
    // --- Highlight + Comment (both sections render) ---
    makeItem({
      id: 'fyi-pe-ma-1',
      title: 'PE Deal Activity Surges in Q4 Amid M&A Recovery',
      folder: FOLDER_MAP['pe-ma'],
      annotations: [
        {
          id: 1,
          start: 0,
          end: 50,
          added_on: 1708100000,
          text: 'Deal volume increased 35% quarter-over-quarter.',
          note: 'Classic late-cycle pattern. PE firms deploying dry powder before rates shift. Watch for quality degradation in deal pipelines.',
        },
      ],
    }),
    makeItem({
      id: 'fyi-ai-1',
      title: 'AI Automation Transforms Back-Office Operations',
      folder: FOLDER_MAP['ai-automation'],
      annotations: [
        {
          id: 3,
          start: 0,
          end: 40,
          added_on: 1708300000,
          text: 'Enterprises report 40% cost reduction in manual processes.',
          note: 'The real ROI is in boring use cases: invoice processing, data reconciliation. Not chatbots.',
        },
      ],
    }),

    // --- Highlight only (no comment / GST Take) ---
    makeItem({
      id: 'fyi-enterprise-tech-1',
      title: 'Enterprise SaaS Consolidation Wave Accelerates',
      folder: FOLDER_MAP['enterprise-tech'],
      annotations: [
        {
          id: 2,
          start: 0,
          end: 60,
          added_on: 1708200000,
          text: 'Mid-market SaaS companies increasingly targeted by platform players seeking vertical integration.',
          note: '',
        },
      ],
    }),
    makeItem({
      id: 'fyi-security-2',
      title: 'Supply Chain Attacks Double Year-Over-Year',
      folder: FOLDER_MAP['security'],
      annotations: [
        {
          id: 7,
          start: 0,
          end: 55,
          added_on: 1708650000,
          text: 'Third-party dependency compromises now account for 62% of initial access vectors in enterprise breaches.',
          note: '',
        },
      ],
    }),

    // --- Comment only (no highlighted text) ---
    makeItem({
      id: 'fyi-security-1',
      title: 'Critical Vulnerability in Enterprise Identity Platforms',
      folder: FOLDER_MAP['security'],
      annotations: [
        {
          id: 4,
          start: 0,
          end: 0,
          added_on: 1708400000,
          text: '',
          note: 'Identity is the new perimeter. Every portfolio company should have MFA and SSO on the diligence checklist.',
        },
      ],
    }),
    makeItem({
      id: 'fyi-pe-ma-2',
      title: 'GP-Led Secondaries Market Hits Record Volume',
      folder: FOLDER_MAP['pe-ma'],
      annotations: [
        {
          id: 8,
          start: 0,
          end: 0,
          added_on: 1708700000,
          text: '',
          note: 'Continuation vehicles are the new exit. LPs need to scrutinize valuation marks carefully — conflicts of interest are structural.',
        },
      ],
    }),

    // --- Highlight + Comment ---
    makeItem({
      id: 'fyi-enterprise-tech-2',
      title: 'Cloud Cost Optimization Becomes Board-Level Priority',
      folder: FOLDER_MAP['enterprise-tech'],
      annotations: [
        {
          id: 6,
          start: 0,
          end: 50,
          added_on: 1708600000,
          text: 'Average enterprise overspends by 30% on cloud infrastructure.',
          note: 'FinOps is no longer optional. This directly impacts EBITDA and should be part of every tech diligence.',
        },
      ],
    }),
  ];

  return {
    direction: 'ltr',
    id: 'user/1234/state/com.google/annotated',
    updated: Date.now() / 1000,
    items,
  };
}

// ---------------------------------------------------------------------------
// Wire (all streams merged) response
// ---------------------------------------------------------------------------

/**
 * Creates a mock merged response for fetchAllStreams('GST-', 15).
 * This is the deduplicated, sorted result — matching what fetchAllStreams returns.
 */
export function createMockAllStreamsResponse(): InoreaderStreamResponse {
  const items: InoreaderItem[] = [
    // PE & M&A items
    makeItem({
      id: 'wire-pe-1',
      title: 'Buyout Fund Raises $2B for Technology Acquisitions',
      folder: FOLDER_MAP['pe-ma'],
    }),
    makeItem({
      id: 'wire-pe-2',
      title: 'Mid-Market M&A Advisory Fees Under Pressure',
      folder: FOLDER_MAP['pe-ma'],
    }),
    makeItem({
      id: 'wire-pe-3',
      title: 'PE Portfolio Company Operating Metrics Dashboard',
      folder: FOLDER_MAP['pe-ma'],
    }),

    // Enterprise Tech items
    makeItem({
      id: 'wire-et-1',
      title: 'Kubernetes Adoption Reaches 80% in Enterprise IT',
      folder: FOLDER_MAP['enterprise-tech'],
    }),
    makeItem({
      id: 'wire-et-2',
      title: 'API-First Architecture Becomes Standard for Integration',
      folder: FOLDER_MAP['enterprise-tech'],
    }),
    makeItem({
      id: 'wire-et-3',
      title: 'Low-Code Platforms Challenge Traditional Development',
      folder: FOLDER_MAP['enterprise-tech'],
    }),
    makeItem({
      id: 'wire-et-4',
      title: 'Enterprise Data Mesh Adoption Accelerates',
      folder: FOLDER_MAP['enterprise-tech'],
    }),

    // AI & Automation items
    makeItem({
      id: 'wire-ai-1',
      title: 'LLM Fine-Tuning Costs Drop 90% Year Over Year',
      folder: FOLDER_MAP['ai-automation'],
    }),
    makeItem({
      id: 'wire-ai-2',
      title: 'Agentic AI Frameworks Gain Enterprise Traction',
      folder: FOLDER_MAP['ai-automation'],
    }),
    makeItem({
      id: 'wire-ai-3',
      title: 'MLOps Pipeline Standardization Matures',
      folder: FOLDER_MAP['ai-automation'],
    }),

    // Security items
    makeItem({
      id: 'wire-sec-1',
      title: 'Zero Trust Architecture Mandated by New Regulations',
      folder: FOLDER_MAP['security'],
    }),
    makeItem({
      id: 'wire-sec-2',
      title: 'Supply Chain Security Becomes Top CISO Priority',
      folder: FOLDER_MAP['security'],
    }),
    makeItem({
      id: 'wire-sec-3',
      title: 'SOC Automation Reduces Mean Time to Respond by 60%',
      folder: FOLDER_MAP['security'],
    }),
  ];

  // Sort by published timestamp (newest first), matching fetchAllStreams behavior
  items.sort((a, b) => b.published - a.published);

  return {
    direction: 'ltr',
    id: 'gst-radar-merged',
    updated: Date.now() / 1000,
    items,
  };
}
