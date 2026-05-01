import { describe, it, expect } from 'vitest';
import { vdrAuditPrompt } from '../../../src/prompts/vdr-audit';

describe('gst_vdr_audit', () => {
  it('uses the gst_ slash-menu prefix', () => {
    expect(vdrAuditPrompt.name).toMatch(/^gst_/);
  });

  it('argsSchema accepts a payload with vdrInventory', () => {
    expect(
      vdrAuditPrompt.argsSchema.safeParse({
        vdrInventory: '01-Corporate\n02-Legal\n03-Finance',
      }).success
    ).toBe(true);
  });

  it('argsSchema accepts an empty payload (interactive mode)', () => {
    expect(vdrAuditPrompt.argsSchema.safeParse({}).success).toBe(true);
  });

  it('build() returns at least one message in BOTH modes', () => {
    expect(
      vdrAuditPrompt.build({ vdrInventory: '01-Corporate' }).messages.length
    ).toBeGreaterThanOrEqual(1);
    expect(vdrAuditPrompt.build({}).messages.length).toBeGreaterThanOrEqual(1);
  });

  it('one-shot body embeds the supplied vdrInventory verbatim', () => {
    const inventory = '01-Corporate\n02-Legal-Unique-Marker-XYZ';
    const allText = vdrAuditPrompt
      .build({ vdrInventory: inventory })
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText).toContain('Unique-Marker-XYZ');
  });

  it('interactive body asks the user to paste their VDR list when args are empty', () => {
    const allText = vdrAuditPrompt
      .build({})
      .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
      .join('\n');
    expect(allText.toLowerCase()).toContain('paste');
  });

  it('embeds the canonical VDR Library article as a second message in both modes', () => {
    for (const args of [{ vdrInventory: '01-Corporate' }, {}]) {
      const result = vdrAuditPrompt.build(args);
      expect(result.messages.length).toBeGreaterThanOrEqual(2);
      const second = result.messages[1].content;
      expect(second.type).toBe('resource');
      if (second.type === 'resource') {
        expect(second.resource.uri).toBe('gst://library/vdr-structure');
        expect(second.resource.text).toBeTruthy();
      }
    }
  });

  it('both modes mention every orchestrates entry literally', () => {
    for (const args of [{ vdrInventory: 'something' }, {}]) {
      const allText = vdrAuditPrompt
        .build(args)
        .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');
      for (const ref of vdrAuditPrompt.orchestrates) {
        expect(allText).toContain(ref);
      }
    }
  });

  describe('Tier 1 — structured vdrFolders input', () => {
    const STRUCTURED_INPUT = [
      { name: '06_Tech_Stack_Inventory', files: ['stack-overview-v17.pdf', 'README_FINAL.docx'] },
      { name: '08_HR_and_Compensation' },
    ];

    it('argsSchema accepts a structured vdrFolders array', () => {
      const r = vdrAuditPrompt.argsSchema.safeParse({ vdrFolders: STRUCTURED_INPUT });
      expect(r.success).toBe(true);
    });

    it('argsSchema accepts vdrFolders as a JSON-encoded string (Claude Desktop wire shape)', () => {
      const r = vdrAuditPrompt.argsSchema.safeParse({
        vdrFolders: JSON.stringify(STRUCTURED_INPUT),
      });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.vdrFolders?.length).toBe(2);
    });

    it('argsSchema rejects a vdrFolders entry without a name', () => {
      const r = vdrAuditPrompt.argsSchema.safeParse({
        vdrFolders: [{ files: ['solo.pdf'] }],
      });
      expect(r.success).toBe(false);
    });

    it('body embeds folder names AND individual file names verbatim when supplied', () => {
      const allText = vdrAuditPrompt
        .build({ vdrFolders: STRUCTURED_INPUT })
        .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');
      expect(allText).toContain('06_Tech_Stack_Inventory');
      expect(allText).toContain('stack-overview-v17.pdf');
      expect(allText).toContain('README_FINAL.docx');
      expect(allText).toContain('08_HR_and_Compensation');
    });

    it('body adds Step 2b (file-level signal) only when at least one folder has files', () => {
      const withFiles = vdrAuditPrompt
        .build({ vdrFolders: STRUCTURED_INPUT })
        .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');
      expect(withFiles).toContain('File-level signal');
      expect(withFiles).toContain('Quality flag');

      const folderNamesOnly = vdrAuditPrompt
        .build({ vdrFolders: [{ name: '01_Corporate' }, { name: '02_Legal' }] })
        .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');
      expect(folderNamesOnly).not.toContain('File-level signal');
      expect(folderNamesOnly).not.toContain('Quality flag');
    });

    it('vdrFolders takes precedence over vdrInventory when both are supplied', () => {
      const allText = vdrAuditPrompt
        .build({
          vdrFolders: [{ name: 'STRUCTURED_MARKER' }],
          vdrInventory: 'FREE_TEXT_MARKER',
        })
        .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');
      expect(allText).toContain('STRUCTURED_MARKER');
      expect(allText).not.toContain('FREE_TEXT_MARKER');
    });

    it('falls back to interactive mode when both inventory inputs are empty', () => {
      const allText = vdrAuditPrompt
        .build({ vdrFolders: undefined, vdrInventory: undefined })
        .messages.map((m) => (m.content.type === 'text' ? m.content.text : ''))
        .join('\n');
      expect(allText.toLowerCase()).toContain('paste');
    });
  });
});
