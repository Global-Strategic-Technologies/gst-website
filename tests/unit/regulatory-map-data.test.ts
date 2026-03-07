import fs from 'fs';
import path from 'path';
import { getRegulationsByRegion } from '@/utils/fetchRegulations';
import { alpha3ToName } from '@/utils/countryCodeMap';
import { stateCodeToName } from '@/utils/fipsToStateCode';
import { provinceCodeToName } from '@/utils/canadianProvinceMap';
import type { Regulation } from '@/types/regulatory-map';

const DATA_DIR = path.join(process.cwd(), 'src/data/regulatory-map');
const REGION_CODE_REGEX = /^[A-Z]{3}$|^US-[A-Z]{2}$|^CA-[A-Z]{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

let regulations: Regulation[];
let filenames: string[];

describe('Regulatory Map Data Validation', () => {
  beforeAll(() => {
    filenames = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    regulations = filenames.map(f => {
      const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf-8');
      return JSON.parse(raw) as Regulation;
    });
  });

  describe('Data Loading', () => {
    it('should load all regulation JSON files successfully', () => {
      expect(regulations).toBeDefined();
      expect(Array.isArray(regulations)).toBe(true);
    });

    it('should have exactly 72 regulation files', () => {
      expect(filenames.length).toBe(72);
    });
  });

  describe('Schema Validation', () => {
    it('should have all required fields on each regulation', () => {
      regulations.forEach((reg, i) => {
        expect(reg, `File: ${filenames[i]}`).toHaveProperty('id');
        expect(reg, `File: ${filenames[i]}`).toHaveProperty('name');
        expect(reg, `File: ${filenames[i]}`).toHaveProperty('regions');
        expect(reg, `File: ${filenames[i]}`).toHaveProperty('effectiveDate');
        expect(reg, `File: ${filenames[i]}`).toHaveProperty('summary');
      });
    });

    it('should have non-empty id strings', () => {
      regulations.forEach((reg, i) => {
        expect(typeof reg.id, `File: ${filenames[i]}`).toBe('string');
        expect(reg.id.length, `File: ${filenames[i]}`).toBeGreaterThan(0);
      });
    });

    it('should have non-empty name strings', () => {
      regulations.forEach((reg, i) => {
        expect(typeof reg.name, `File: ${filenames[i]}`).toBe('string');
        expect(reg.name.length, `File: ${filenames[i]}`).toBeGreaterThan(0);
      });
    });

    it('should have non-empty regions arrays', () => {
      regulations.forEach((reg, i) => {
        expect(Array.isArray(reg.regions), `File: ${filenames[i]}`).toBe(true);
        expect(reg.regions.length, `File: ${filenames[i]}`).toBeGreaterThan(0);
      });
    });

    it('should have valid region code formats', () => {
      regulations.forEach((reg, i) => {
        reg.regions.forEach(code => {
          expect(code, `File: ${filenames[i]}, code: ${code}`).toMatch(REGION_CODE_REGEX);
        });
      });
    });

    it('should have valid effectiveDate format (YYYY-MM-DD)', () => {
      regulations.forEach((reg, i) => {
        expect(reg.effectiveDate, `File: ${filenames[i]}`).toMatch(DATE_REGEX);
      });
    });

    it('should have non-empty summary strings', () => {
      regulations.forEach((reg, i) => {
        expect(typeof reg.summary, `File: ${filenames[i]}`).toBe('string');
        expect(reg.summary.length, `File: ${filenames[i]}`).toBeGreaterThan(10);
      });
    });

    it('should have valid keyRequirements when present', () => {
      regulations.forEach((reg, i) => {
        if (reg.keyRequirements !== undefined) {
          expect(Array.isArray(reg.keyRequirements), `File: ${filenames[i]}`).toBe(true);
          expect(reg.keyRequirements.length, `File: ${filenames[i]}`).toBeGreaterThan(0);
          reg.keyRequirements.forEach(req => {
            expect(typeof req).toBe('string');
            expect(req.length).toBeGreaterThan(0);
          });
        }
      });
    });

    it('should have valid penalties when present', () => {
      regulations.forEach((reg, i) => {
        if (reg.penalties !== undefined) {
          expect(typeof reg.penalties, `File: ${filenames[i]}`).toBe('string');
          expect(reg.penalties.length, `File: ${filenames[i]}`).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Uniqueness Constraints', () => {
    it('should have unique regulation IDs', () => {
      const ids = regulations.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have no duplicate region codes within a single regulation', () => {
      regulations.forEach((reg, i) => {
        const uniqueCodes = new Set(reg.regions);
        expect(uniqueCodes.size, `File: ${filenames[i]} has duplicate region codes`).toBe(reg.regions.length);
      });
    });
  });

  describe('Region Code Integrity', () => {
    it('should have all alpha-3 country codes in countryCodeMap (except known absent countries)', () => {
      // BHR (Bahrain) and SRB (Serbia) are intentionally included for data completeness
      // but are not in the world-atlas 110m TopoJSON and thus absent from alpha3ToName
      const knownAbsent = new Set(['BHR', 'SRB']);

      regulations.forEach((reg, i) => {
        reg.regions.forEach(code => {
          if (/^[A-Z]{3}$/.test(code) && !knownAbsent.has(code)) {
            expect(alpha3ToName, `File: ${filenames[i]}, unknown alpha-3: ${code}`).toHaveProperty(code);
          }
        });
      });
    });

    it('should have all US-XX codes in stateCodeToName', () => {
      regulations.forEach((reg, i) => {
        reg.regions.forEach(code => {
          if (/^US-[A-Z]{2}$/.test(code)) {
            expect(stateCodeToName, `File: ${filenames[i]}, unknown state: ${code}`).toHaveProperty(code);
          }
        });
      });
    });

    it('should have all CA-XX codes in provinceCodeToName', () => {
      regulations.forEach((reg, i) => {
        reg.regions.forEach(code => {
          if (/^CA-[A-Z]{2}$/.test(code)) {
            expect(provinceCodeToName, `File: ${filenames[i]}, unknown province: ${code}`).toHaveProperty(code);
          }
        });
      });
    });
  });

  describe('getRegulationsByRegion()', () => {
    it('should return empty object for empty input', () => {
      expect(getRegulationsByRegion([])).toEqual({});
    });

    it('should map a single regulation to all its region codes', () => {
      const reg: Regulation = {
        id: 'test',
        name: 'Test',
        regions: ['DEU', 'FRA'],
        effectiveDate: '2024-01-01',
        summary: 'Test regulation',
      };
      const result = getRegulationsByRegion([reg]);
      expect(result['DEU']).toEqual([reg]);
      expect(result['FRA']).toEqual([reg]);
    });

    it('should group multiple regulations sharing a region code', () => {
      const reg1: Regulation = {
        id: 'a', name: 'A', regions: ['DEU'], effectiveDate: '2024-01-01', summary: 'A',
      };
      const reg2: Regulation = {
        id: 'b', name: 'B', regions: ['DEU'], effectiveDate: '2024-06-01', summary: 'B',
      };
      const result = getRegulationsByRegion([reg1, reg2]);
      expect(result['DEU']).toHaveLength(2);
      expect(result['DEU']).toContain(reg1);
      expect(result['DEU']).toContain(reg2);
    });

    it('should map EU GDPR to all 27 member state codes', () => {
      const gdprFile = path.join(DATA_DIR, 'EU-GDPR.json');
      const gdpr: Regulation = JSON.parse(fs.readFileSync(gdprFile, 'utf-8'));
      const result = getRegulationsByRegion([gdpr]);

      expect(gdpr.regions).toHaveLength(27);
      gdpr.regions.forEach(code => {
        expect(result[code]).toContainEqual(gdpr);
      });
    });
  });
});
