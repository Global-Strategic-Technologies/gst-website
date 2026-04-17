import { z } from 'zod';
import { validateDataSource } from '@/utils/validateData';

describe('validateDataSource', () => {
  const schema = z.object({
    name: z.string(),
    value: z.number(),
  });

  it('should return parsed data when schema matches', () => {
    const data = { name: 'test', value: 42 };
    const result = validateDataSource(schema, data, 'test-source');
    expect(result).toEqual(data);
  });

  it('should return strongly typed data', () => {
    const data = { name: 'typed', value: 99 };
    const result = validateDataSource(schema, data, 'test-source');
    // TypeScript infers result as { name: string; value: number }
    expect(result.name).toBe('typed');
    expect(result.value).toBe(99);
  });

  it('should throw on schema violation with label in error message', () => {
    const invalid = { name: 123, value: 'not a number' };
    expect(() => validateDataSource(schema, invalid, 'my-data-file.json')).toThrow(
      'Invalid data in my-data-file.json'
    );
  });

  it('should include field path in error message', () => {
    const invalid = { name: 'ok', value: 'not a number' };
    expect(() => validateDataSource(schema, invalid, 'test')).toThrow('at value:');
  });

  it('should report (root) for top-level schema violations', () => {
    const stringSchema = z.string();
    expect(() => validateDataSource(stringSchema, 42, 'test')).toThrow('(root)');
  });

  it('should validate arrays with item-level errors', () => {
    const arraySchema = z.array(schema);
    const invalid = [
      { name: 'ok', value: 1 },
      { name: 'bad', value: 'nope' },
    ];
    expect(() => validateDataSource(arraySchema, invalid, 'array-source')).toThrow('1.value');
  });

  it('should pass through extra fields via passthrough-like behavior', () => {
    // Zod strips extra fields by default
    const data = { name: 'test', value: 1, extra: 'ignored' };
    const result = validateDataSource(schema, data, 'test');
    expect(result).toEqual({ name: 'test', value: 1 });
  });
});
