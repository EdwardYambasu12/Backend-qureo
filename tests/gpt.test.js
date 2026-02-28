const { generateOptions, checkRateLimit } = require('../routes/gpt');

describe('GPT route helpers', () => {
  describe('generateOptions', () => {
    it('returns severity options when question mentions severity', () => {
      const opts = generateOptions('How severe is your pain?');
      expect(opts).toEqual(['Mild', 'Moderate', 'Severe', 'Very Severe']);
    });

    it('returns fever ranges for temperature question', () => {
      const opts = generateOptions('What is your fever?');
      expect(opts).toContain('I don\'t know');
      expect(opts).toContain('Under 38°C (100.4°F)');
    });

    it('returns urination options when urine mentioned', () => {
      const opts = generateOptions('Any problems with urination?');
      expect(opts).toEqual([
        'Burning when urinating',
        'Frequent urination',
        'Blood in urine',
        'Flank pain (side or back)',
        'None of these',
      ]);
    });

    it('returns empty array for unrelated text', () => {
      const opts = generateOptions('Tell me a joke');
      expect(opts).toEqual([]);
    });
  });

  describe('rate limiter', () => {
    it('allows up to max requests in window then blocks', () => {
      const ip = '1.2.3.4';
      // clear map entry if exists
      const map = require('../routes/gpt').rateMap;
      map.delete(ip);
      for (let i = 0; i < 30; i++) {
        expect(checkRateLimit(ip)).toBe(true);
      }
      expect(checkRateLimit(ip)).toBe(false);
    });
  });
});
