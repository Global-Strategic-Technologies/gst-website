import { numericToAlpha3, alpha3ToName } from '@/utils/countryCodeMap';
import { fipsToStateCode, stateCodeToName } from '@/utils/fipsToStateCode';
import { provinceCodeToName } from '@/utils/canadianProvinceMap';

describe('Country Code Maps', () => {
  describe('numericToAlpha3', () => {
    it('should contain at least 170 entries', () => {
      expect(Object.keys(numericToAlpha3).length).toBeGreaterThanOrEqual(170);
    });

    it('should map known numeric codes to correct alpha-3 codes', () => {
      expect(numericToAlpha3['840']).toBe('USA');
      expect(numericToAlpha3['276']).toBe('DEU');
      expect(numericToAlpha3['076']).toBe('BRA');
      expect(numericToAlpha3['826']).toBe('GBR');
      expect(numericToAlpha3['392']).toBe('JPN');
      expect(numericToAlpha3['156']).toBe('CHN');
      expect(numericToAlpha3['356']).toBe('IND');
      expect(numericToAlpha3['036']).toBe('AUS');
    });

    it('should have all values as 3-character uppercase strings', () => {
      Object.values(numericToAlpha3).forEach(code => {
        expect(code).toMatch(/^[A-Z]{3}$/);
      });
    });
  });

  describe('alpha3ToName', () => {
    it('should map known alpha-3 codes to correct country names', () => {
      expect(alpha3ToName['USA']).toBe('United States');
      expect(alpha3ToName['DEU']).toBe('Germany');
      expect(alpha3ToName['BRA']).toBe('Brazil');
      expect(alpha3ToName['GBR']).toBe('United Kingdom');
      expect(alpha3ToName['JPN']).toBe('Japan');
      expect(alpha3ToName['CHN']).toBe('China');
      expect(alpha3ToName['IND']).toBe('India');
      expect(alpha3ToName['AUS']).toBe('Australia');
    });

    it('should have all keys as 3-character uppercase strings', () => {
      Object.keys(alpha3ToName).forEach(key => {
        expect(key).toMatch(/^[A-Z]{3}$/);
      });
    });

    it('should have every numericToAlpha3 value present as a key', () => {
      Object.values(numericToAlpha3).forEach(alpha3 => {
        expect(alpha3ToName).toHaveProperty(alpha3);
      });
    });
  });
});

describe('US State Code Maps', () => {
  describe('fipsToStateCode', () => {
    it('should map known FIPS codes to correct state codes', () => {
      expect(fipsToStateCode['06']).toBe('US-CA');
      expect(fipsToStateCode['48']).toBe('US-TX');
      expect(fipsToStateCode['36']).toBe('US-NY');
      expect(fipsToStateCode['12']).toBe('US-FL');
      expect(fipsToStateCode['51']).toBe('US-VA');
    });

    it('should have all values matching US-XX format', () => {
      Object.values(fipsToStateCode).forEach(code => {
        expect(code).toMatch(/^US-[A-Z]{2}$/);
      });
    });
  });

  describe('stateCodeToName', () => {
    it('should map known state codes to correct names', () => {
      expect(stateCodeToName['US-CA']).toBe('California');
      expect(stateCodeToName['US-TX']).toBe('Texas');
      expect(stateCodeToName['US-NY']).toBe('New York');
      expect(stateCodeToName['US-FL']).toBe('Florida');
      expect(stateCodeToName['US-VA']).toBe('Virginia');
    });

    it('should have every fipsToStateCode value present as a key', () => {
      Object.values(fipsToStateCode).forEach(stateCode => {
        expect(stateCodeToName).toHaveProperty(stateCode);
      });
    });
  });
});

describe('Canadian Province Code Map', () => {
  describe('provinceCodeToName', () => {
    it('should contain 13 provinces and territories', () => {
      expect(Object.keys(provinceCodeToName)).toHaveLength(13);
    });

    it('should map known province codes to correct names', () => {
      expect(provinceCodeToName['CA-QC']).toBe('Quebec');
      expect(provinceCodeToName['CA-ON']).toBe('Ontario');
      expect(provinceCodeToName['CA-BC']).toBe('British Columbia');
      expect(provinceCodeToName['CA-AB']).toBe('Alberta');
    });

    it('should have all keys matching CA-XX format', () => {
      Object.keys(provinceCodeToName).forEach(key => {
        expect(key).toMatch(/^CA-[A-Z]{2}$/);
      });
    });
  });
});
