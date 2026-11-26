import { describe, it, expect } from 'vitest';
import { validateRuleset } from '../src/index.js';
import type { Rule } from '../src/types.js';

const makeRule = (
  id: number | string,
  rule_type: Rule['rule_type'],
  trigger_attribute: string,
  trigger_value: string,
  target_attribute: string,
  target_value: string,
  extra: Partial<Rule> = {}
): Rule => ({
  id,
  rule_type,
  trigger_attribute,
  trigger_value,
  target_attribute,
  target_value,
  ...extra,
});

describe('validateRuleset', () => {
  it('returns valid for an empty ruleset', () => {
    const result = validateRuleset([]);
    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it('returns valid for a well-formed ruleset covering all 5 rule types', () => {
    const rules: Rule[] = [
      makeRule(1, 'expansion', 'gender', 'non-binary', 'gender', 'enby, genderqueer'),
      makeRule(2, 'enrichment', 'orientation', 'gay', 'gender', 'man', {
        context_attribute: 'gender',
        context_value: 'cis man',
      }),
      makeRule(3, 'acceptance', 'orientation', 'bisexual', 'gender', 'man, woman'),
      makeRule(4, 'cross_match', 'relationship_style', 'polyamorous', 'relationship_style', 'enm'),
      makeRule(
        5,
        'exclusion',
        'relationship_style',
        'monogamous',
        'relationship_style',
        'polyamorous'
      ),
    ];

    const result = validateRuleset(rules);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  describe('malformed, empty, and incomplete rules', () => {
    it('flags non-array input as MALFORMED_RULE', () => {
      const result = validateRuleset(null as unknown as Rule[]);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MALFORMED_RULE');
    });

    it('flags null/primitive entries and invalid rule_type as MALFORMED_RULE', () => {
      const rules = [
        null as unknown as Rule,
        {
          id: 2,
          rule_type: 'unknown_type' as Rule['rule_type'],
          trigger_attribute: 'gender',
          trigger_value: 'man',
          target_attribute: 'gender',
          target_value: 'male',
        },
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.every((e) => e.code === 'MALFORMED_RULE')).toBe(true);
      expect(result.errors.map((e) => e.ruleIndices)).toEqual([[0], [1]]);
    });

    it('flags missing trigger or target attributes/values as EMPTY_RULE', () => {
      const rules: Rule[] = [
        makeRule(1, 'expansion', '', 'man', 'gender', 'male'),
        makeRule(2, 'expansion', 'gender', '  ,  ', 'gender', 'male'),
        makeRule(3, 'enrichment', 'gender', 'man', '', 'male'),
        makeRule(4, 'acceptance', 'gender', 'man', 'gender', ''),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(4);
      expect(result.errors.every((e) => e.code === 'EMPTY_RULE')).toBe(true);
    });

    it('flags incomplete context (attribute without value or value without attribute) as warning', () => {
      const rules: Rule[] = [
        makeRule(1, 'enrichment', 'orientation', 'gay', 'gender', 'man', {
          context_attribute: 'location',
          context_value: null,
        }),
        makeRule(2, 'acceptance', 'orientation', 'lesbian', 'gender', 'woman', {
          context_attribute: '',
          context_value: 'nyc',
        }),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.every((w) => w.code === 'INCOMPLETE_CONTEXT')).toBe(true);
    });

    it('flags cross-category expansion and cross_match rules as errors', () => {
      const rules: Rule[] = [
        makeRule(1, 'expansion', 'gender', 'man', 'orientation', 'straight'),
        makeRule(2, 'cross_match', 'gender', 'man', 'orientation', 'gay'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.code)).toEqual([
        'CROSS_CATEGORY_CROSS_MATCH',
        'CROSS_CATEGORY_EXPANSION',
      ]);
    });
  });

  describe('duplicate rules', () => {
    it('detects exact duplicates regardless of casing, whitespace, or token order', () => {
      const rules: Rule[] = [
        makeRule('a', 'acceptance', 'gender', 'man, woman', 'orientation', 'bi, pan'),
        makeRule('b', 'acceptance', ' GENDER ', 'WOMAN, man', 'Orientation', 'pan, bi'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('DUPLICATE_RULE');
      expect(result.warnings[0].ruleIds).toEqual(['a', 'b']);
      expect(result.warnings[0].ruleIndices).toEqual([0, 1]);
    });

    it('detects symmetric cross_match duplicates', () => {
      const rules: Rule[] = [
        makeRule(10, 'cross_match', 'relationship_style', 'enm', 'relationship_style', 'poly'),
        makeRule(11, 'cross_match', 'relationship_style', 'poly', 'relationship_style', 'enm'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('DUPLICATE_RULE');
      expect(result.warnings[0].ruleIds).toEqual([10, 11]);
    });
  });

  describe('expansion cycle and self-loop detection', () => {
    it('detects direct self-loops in expansion rules', () => {
      const rules: Rule[] = [makeRule(1, 'expansion', 'gender', 'man', 'gender', 'man, male')];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'EXPANSION_SELF_LOOP',
        attribute: 'gender',
        terms: ['man'],
        ruleIds: [1],
        ruleIndices: [0],
      });
    });

    it('detects 2-node and 3-node expansion cycles', () => {
      const rules: Rule[] = [
        makeRule(1, 'expansion', 'gender', 'a', 'gender', 'b'),
        makeRule(2, 'expansion', 'gender', 'b', 'gender', 'c'),
        makeRule(3, 'expansion', 'gender', 'c', 'gender', 'a'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('EXPANSION_CYCLE');
      expect(result.errors[0].ruleIds).toEqual([1, 2, 3]);
      expect(result.errors[0].terms).toEqual(['a', 'b', 'c']);
    });

    it('allows diamond DAGs in expansion rules without false positives', () => {
      const rules: Rule[] = [
        makeRule(1, 'expansion', 'gender', 'a', 'gender', 'b, c'),
        makeRule(2, 'expansion', 'gender', 'b', 'gender', 'd'),
        makeRule(3, 'expansion', 'gender', 'c', 'gender', 'd'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('isolates expansion graphs by attribute category', () => {
      const rules: Rule[] = [
        makeRule(1, 'expansion', 'gender', 'a', 'gender', 'b'),
        makeRule(2, 'expansion', 'orientation', 'b', 'orientation', 'a'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('exclusion contradictions', () => {
    it('detects exclusion self-contradiction', () => {
      const rules: Rule[] = [makeRule(1, 'exclusion', 'gender', 'man', 'gender', 'man, woman')];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'EXCLUSION_SELF_CONTRADICTION',
        attribute: 'gender',
        terms: ['man'],
        ruleIds: [1],
      });
    });

    it('detects exclusion vs cross_match contradiction (forward and reverse)', () => {
      const rules: Rule[] = [
        makeRule(1, 'exclusion', 'style', 'monogamous', 'style', 'polyamorous'),
        makeRule(2, 'cross_match', 'style', 'polyamorous', 'style', 'monogamous'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('EXCLUSION_CROSS_MATCH_CONTRADICTION');
      expect(result.errors[0].ruleIds).toEqual([1, 2]);
    });

    it('detects exclusion vs acceptance contradiction across categories', () => {
      const rules: Rule[] = [
        makeRule(1, 'exclusion', 'orientation', 'straight', 'gender', 'man'),
        makeRule(2, 'acceptance', 'orientation', 'straight', 'gender', 'man, woman'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('EXCLUSION_ACCEPTANCE_CONTRADICTION');
      expect(result.errors[0].ruleIds).toEqual([1, 2]);
      expect(result.errors[0].ruleIndices).toEqual([0, 1]);
    });

    it('detects exclusion vs enrichment contradiction (including reverse orientation)', () => {
      const rules: Rule[] = [
        makeRule(1, 'enrichment', 'orientation', 'gay', 'gender', 'man'),
        makeRule(2, 'exclusion', 'gender', 'man', 'orientation', 'gay'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('EXCLUSION_ENRICHMENT_CONTRADICTION');
      expect(result.errors[0].ruleIds).toEqual([1, 2]);
      expect(result.errors[0].ruleIndices).toEqual([0, 1]);
    });

    it('detects exclusion vs expansion contradiction', () => {
      const rules: Rule[] = [
        makeRule(1, 'expansion', 'gender', 'trans woman', 'gender', 'woman'),
        makeRule(2, 'exclusion', 'gender', 'trans woman', 'gender', 'woman'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('EXCLUSION_EXPANSION_CONTRADICTION');
      expect(result.errors[0].ruleIds).toEqual([1, 2]);
      expect(result.errors[0].ruleIndices).toEqual([0, 1]);
    });

    it('does NOT flag contradiction when attributes differ even if term values match', () => {
      const rules: Rule[] = [
        makeRule(1, 'exclusion', 'gender', 'a', 'style', 'b'),
        makeRule(2, 'enrichment', 'orientation', 'a', 'style', 'b'),
        makeRule(3, 'acceptance', 'gender', 'a', 'orientation', 'b'),
        makeRule(4, 'cross_match', 'other', 'a', 'other', 'b'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('does NOT flag contradiction when contexts have the same attribute and disjoint values', () => {
      const rules: Rule[] = [
        makeRule(1, 'exclusion', 'gender', 'man', 'gender', 'woman', {
          context_attribute: 'region',
          context_value: 'us',
        }),
        makeRule(2, 'cross_match', 'gender', 'man', 'gender', 'woman', {
          context_attribute: 'region',
          context_value: 'eu',
        }),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('DOES flag contradiction when contexts overlap, have different attributes, or one is unconditional', () => {
      const rules: Rule[] = [
        makeRule(1, 'exclusion', 'gender', 'man', 'gender', 'woman', {
          context_attribute: 'region',
          context_value: 'us, ca',
        }),
        makeRule(2, 'cross_match', 'gender', 'man', 'gender', 'woman', {
          context_attribute: 'region',
          context_value: 'ca, uk',
        }),
        makeRule(3, 'acceptance', 'gender', 'man', 'gender', 'woman', {
          context_attribute: 'age_group',
          context_value: 'adult',
        }),
        makeRule(4, 'enrichment', 'gender', 'man', 'gender', 'woman'),
      ];
      const result = validateRuleset(rules);
      expect(result.valid).toBe(false);
      expect(result.errors.map((e) => e.code)).toEqual([
        'EXCLUSION_ACCEPTANCE_CONTRADICTION',
        'EXCLUSION_CROSS_MATCH_CONTRADICTION',
        'EXCLUSION_ENRICHMENT_CONTRADICTION',
      ]);
    });
  });

  describe('orphan attribute and term references', () => {
    it('checks knownAttributes alone without knownTerms', () => {
      const rules: Rule[] = [
        {
          rule_type: 'enrichment',
          trigger_attribute: 'orientation',
          trigger_value: 'gay',
          target_attribute: 'unknown_attr',
          target_value: 'man',
        },
      ];
      const result = validateRuleset(rules, {
        knownAttributes: ['orientation', 'gender'],
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        code: 'ORPHAN_ATTRIBUTE',
        severity: 'warning',
        attribute: 'unknown_attr',
        ruleIds: [],
        ruleIndices: [0],
      });
    });

    it('checks knownTerms alone across trigger, target, and context values', () => {
      const rules: Rule[] = [
        makeRule(7, 'enrichment', 'orientation', 'gay, queer', 'gender', 'man, alien', {
          context_attribute: 'region',
          context_value: 'us, mars',
        }),
      ];
      const result = validateRuleset(rules, {
        knownTerms: {
          Orientation: ['GAY'],
          orientation: ['straight'], // mixed-case merging
          gender: ['man', 'woman'],
          region: ['us', 'ca'],
        },
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(3);
      expect(result.warnings.map((w) => ({ attr: w.attribute, terms: w.terms }))).toEqual([
        { attr: 'gender', terms: ['alien'] },
        { attr: 'orientation', terms: ['queer'] },
        { attr: 'region', terms: ['mars'] },
      ]);
      expect(result.warnings[0]).toMatchObject({
        code: 'ORPHAN_TERM',
        severity: 'warning',
        ruleIds: [7],
        ruleIndices: [0],
      });
    });

    it('warns on unknown attributes and unknown terms by default', () => {
      const rules: Rule[] = [
        makeRule(1, 'enrichment', 'orientation', 'gay, queer', 'unknown_attr', 'man', {
          context_attribute: 'ctx_attr',
          context_value: 'val',
        }),
      ];
      const result = validateRuleset(rules, {
        knownAttributes: ['orientation', 'gender'],
        knownTerms: {
          Orientation: ['GAY'],
          orientation: ['straight'],
        },
      });
      expect(result.valid).toBe(true);
      const attrWarnings = result.warnings.filter((w) => w.code === 'ORPHAN_ATTRIBUTE');
      const termWarnings = result.warnings.filter((w) => w.code === 'ORPHAN_TERM');
      expect(attrWarnings.map((w) => w.attribute)).toEqual(['ctx_attr', 'unknown_attr']);
      expect(attrWarnings[0]).toMatchObject({
        severity: 'warning',
        ruleIds: [1],
        ruleIndices: [0],
      });
      expect(termWarnings).toHaveLength(1);
      expect(termWarnings[0]).toMatchObject({
        severity: 'warning',
        attribute: 'orientation',
        terms: ['queer'],
        ruleIds: [1],
        ruleIndices: [0],
      });
    });

    it('elevates orphan issues to errors when strictOrphans is true', () => {
      const rules: Rule[] = [makeRule(1, 'expansion', 'gender', 'alien', 'gender', 'man')];
      const result = validateRuleset(rules, {
        knownAttributes: ['gender'],
        knownTerms: new Map([['gender', ['man', 'woman']]]),
        strictOrphans: true,
      });
      expect(result.valid).toBe(false);
      expect(result.warnings).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({
        code: 'ORPHAN_TERM',
        severity: 'error',
        attribute: 'gender',
        terms: ['alien'],
      });
    });
  });

  describe('determinism', () => {
    it('produces identical issue codes and messages regardless of input rule order', () => {
      const rulesA: Rule[] = [
        makeRule(1, 'expansion', 'gender', 'a', 'gender', 'b'),
        makeRule(2, 'expansion', 'gender', 'b', 'gender', 'a'),
        makeRule(3, 'exclusion', 'style', 'x', 'style', 'y'),
        makeRule(4, 'cross_match', 'style', 'x', 'style', 'y'),
        makeRule(5, 'acceptance', 'gender', 'man', 'orientation', 'bi', {
          context_attribute: 'region',
        }),
        makeRule(6, 'enrichment', 'gender', 'man', 'unknown_attr', 'x'),
      ];
      const rulesB = [...rulesA].reverse();

      const resA = validateRuleset(rulesA, {
        knownAttributes: ['gender', 'style', 'orientation', 'region'],
      });
      const resB = validateRuleset(rulesB, {
        knownAttributes: ['region', 'orientation', 'style', 'gender'],
      });

      expect(resA.valid).toBe(resB.valid);
      expect(
        resA.errors.map((e) => ({ code: e.code, message: e.message, ruleIds: e.ruleIds }))
      ).toEqual(resB.errors.map((e) => ({ code: e.code, message: e.message, ruleIds: e.ruleIds })));
      expect(
        resA.warnings.map((w) => ({ code: w.code, message: w.message, ruleIds: w.ruleIds }))
      ).toEqual(
        resB.warnings.map((w) => ({ code: w.code, message: w.message, ruleIds: w.ruleIds }))
      );
    });
  });
});
