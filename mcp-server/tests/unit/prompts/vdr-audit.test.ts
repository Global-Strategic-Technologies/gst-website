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
});
