/**
 * Unit Tests for Error Handling Patterns
 *
 * Tests the error-handling logic used across the codebase:
 * - localStorage write failures (ThemeToggle, palette-manager)
 * - JSON parsing with fallback (Portfolio components)
 * - DOM element null guards (ProjectModal)
 * - Polymorphic data normalization (ProjectModal technologies)
 *
 * Since these patterns live inline in Astro <script> blocks, we replicate
 * them as pure functions here and test in isolation — following the same
 * approach as toc-component.test.ts and diligence-wizard-navigation.test.ts.
 */
import { describe, it, expect } from 'vitest';

// ─── Pattern 1: localStorage error handling ─────────────────────────────────
// Replicates: ThemeToggle.astro (toggleTheme's localStorage catch), palette-manager.ts (lines 281, 388, 418)

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function saveToStorage(storage: StorageLike, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

describe('localStorage error handling', () => {
  it('returns true when storage is available', () => {
    const store: Record<string, string> = {};
    const storage: StorageLike = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => {
        store[k] = v;
      },
    };
    expect(saveToStorage(storage, 'theme', 'dark')).toBe(true);
  });

  it('persists the value when storage is available', () => {
    const store: Record<string, string> = {};
    const storage: StorageLike = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => {
        store[k] = v;
      },
    };
    saveToStorage(storage, 'theme', 'dark');
    expect(storage.getItem('theme')).toBe('dark');
  });

  it('returns false when setItem throws (quota exceeded)', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError');
      },
    };
    expect(saveToStorage(storage, 'theme', 'dark')).toBe(false);
  });

  it('retains previously stored value when new write fails', () => {
    const store: Record<string, string> = { theme: 'light' };
    let shouldThrow = false;
    const storage: StorageLike = {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => {
        if (shouldThrow) throw new DOMException('QuotaExceededError');
        store[k] = v;
      },
    };
    saveToStorage(storage, 'theme', 'light');
    shouldThrow = true;
    saveToStorage(storage, 'theme', 'dark');
    expect(storage.getItem('theme')).toBe('light');
  });
});

// ─── Pattern 2: JSON parsing with fallback ──────────────────────────────────
// Replicates: PortfolioHeader.astro (~571), PortfolioGrid.astro (~338),
//             StickyControls.astro (~468)

function parseProjectsData(raw: string | null | undefined): Record<string, unknown>[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

describe('JSON parsing with fallback', () => {
  it('returns parsed array for valid JSON array', () => {
    const data = JSON.stringify([{ id: 1 }, { id: 2 }]);
    expect(parseProjectsData(data)).toHaveLength(2);
  });

  it('preserves all fields on valid project objects', () => {
    const projects = [{ codeName: 'Alpha', industry: 'SaaS', year: 2024 }];
    const result = parseProjectsData(JSON.stringify(projects));
    expect(result[0]).toEqual({ codeName: 'Alpha', industry: 'SaaS', year: 2024 });
  });

  it('returns empty array for malformed JSON', () => {
    expect(parseProjectsData('{not valid json')).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(parseProjectsData(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(parseProjectsData(undefined)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseProjectsData('')).toEqual([]);
  });

  it('returns empty array when JSON is valid object (not array)', () => {
    expect(parseProjectsData('{"key": "value"}')).toEqual([]);
  });

  it('returns empty array when JSON is a string', () => {
    expect(parseProjectsData('"hello"')).toEqual([]);
  });

  it('returns empty array when JSON is a number', () => {
    expect(parseProjectsData('42')).toEqual([]);
  });
});

// ─── Pattern 3: DOM element access safety ───────────────────────────────────
// Replicates: ProjectModal.astro (lines ~368-430)

function safeSetTextContent(element: { textContent: string } | null, text: string): boolean {
  if (!element) return false;
  element.textContent = text;
  return true;
}

function renderConditionalSection(
  section: { style: { display: string } } | null,
  contentEl: { textContent: string } | null,
  value: string | null | undefined
): 'shown' | 'hidden' | 'skipped' {
  if (!section || !contentEl) return 'skipped';
  if (value) {
    contentEl.textContent = value;
    section.style.display = 'block';
    return 'shown';
  }
  section.style.display = 'none';
  return 'hidden';
}

describe('DOM element access safety', () => {
  describe('safeSetTextContent', () => {
    it('returns true and sets text when element exists', () => {
      const el = { textContent: '' };
      expect(safeSetTextContent(el, 'hello')).toBe(true);
      expect(el.textContent).toBe('hello');
    });

    it('returns false when element is null', () => {
      expect(safeSetTextContent(null, 'hello')).toBe(false);
    });
  });

  describe('renderConditionalSection', () => {
    it('shows section when both elements exist and value is provided', () => {
      const section = { style: { display: 'none' } };
      const content = { textContent: '' };
      expect(renderConditionalSection(section, content, 'Test value')).toBe('shown');
      expect(section.style.display).toBe('block');
      expect(content.textContent).toBe('Test value');
    });

    it('hides section when both elements exist but value is null', () => {
      const section = { style: { display: 'block' } };
      const content = { textContent: '' };
      expect(renderConditionalSection(section, content, null)).toBe('hidden');
      expect(section.style.display).toBe('none');
    });

    it('hides section when value is undefined', () => {
      const section = { style: { display: 'block' } };
      const content = { textContent: '' };
      expect(renderConditionalSection(section, content, undefined)).toBe('hidden');
    });

    it('hides section when value is empty string', () => {
      const section = { style: { display: 'block' } };
      const content = { textContent: '' };
      expect(renderConditionalSection(section, content, '')).toBe('hidden');
    });

    it('returns skipped when section element is null', () => {
      const content = { textContent: '' };
      expect(renderConditionalSection(null, content, 'value')).toBe('skipped');
    });

    it('returns skipped when content element is null', () => {
      const section = { style: { display: '' } };
      expect(renderConditionalSection(section, null, 'value')).toBe('skipped');
    });

    it('returns skipped when both elements are null', () => {
      expect(renderConditionalSection(null, null, 'value')).toBe('skipped');
    });
  });
});

// ─── Pattern 4: Technology field normalization ──────────────────────────────
// Replicates: ProjectModal.astro (lines ~415-420)

function normalizeTechnologies(techs: unknown): string[] {
  if (Array.isArray(techs)) return techs;
  if (typeof techs === 'string') return techs.split(',').map((t) => t.trim());
  return [];
}

describe('technology field normalization', () => {
  it('returns array as-is when input is array', () => {
    expect(normalizeTechnologies(['React', 'Node'])).toEqual(['React', 'Node']);
  });

  it('splits comma-separated string into trimmed array', () => {
    expect(normalizeTechnologies('React, Node, TypeScript')).toEqual([
      'React',
      'Node',
      'TypeScript',
    ]);
  });

  it('handles single-item string (no comma)', () => {
    expect(normalizeTechnologies('React')).toEqual(['React']);
  });

  it('handles string with extra whitespace', () => {
    expect(normalizeTechnologies('  React ,  Node  ')).toEqual(['React', 'Node']);
  });

  it('returns empty array for undefined', () => {
    expect(normalizeTechnologies(undefined)).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(normalizeTechnologies(null)).toEqual([]);
  });

  it('returns empty array for number', () => {
    expect(normalizeTechnologies(42)).toEqual([]);
  });
});
