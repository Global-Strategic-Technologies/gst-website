import { tp, MAX_HISTORICAL, MAX_SCENARIOS, LS_KEY, VISITED_KEY } from '@/utils/techpar/state';

describe('techpar/state', () => {
  describe('constants', () => {
    it('MAX_HISTORICAL is 2', () => {
      expect(MAX_HISTORICAL).toBe(2);
    });

    it('MAX_SCENARIOS is 3', () => {
      expect(MAX_SCENARIOS).toBe(3);
    });

    it('LS_KEY is techpar-state', () => {
      expect(LS_KEY).toBe('techpar-state');
    });

    it('VISITED_KEY is techpar-visited', () => {
      expect(VISITED_KEY).toBe('techpar-visited');
    });
  });

  describe('tp initial state', () => {
    it('has expected default values', () => {
      expect(tp.mode).toBe('quick');
      expect(tp.currencySymbol).toBe('$');
      expect(tp.infraPeriod).toBe('monthly');
      expect(tp.industry).toBe('saas');
      expect(tp.historicalPoints).toEqual([]);
      expect(tp.scenarios).toEqual([]);
    });

    it('nullable fields start as null', () => {
      expect(tp.stageKey).toBeNull();
      expect(tp.growthRate).toBeNull();
      expect(tp.trajChart).toBeNull();
      expect(tp.baselineResult).toBeNull();
      expect(tp.baselineInputs).toBeNull();
      expect(tp.resetTimeout).toBeNull();
      expect(tp.saveTimeout).toBeNull();
    });
  });
});
