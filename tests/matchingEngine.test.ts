import { describe, it, expect } from 'vitest';
import {
  normalizeToken,
  escapeRegExp,
  hasToken,
  parseJsonSafe,
  normalizeArrayInput,
  parseAttributesInput,
  matchesContext,
  getExpandedDesired,
  getExclusionConflicts,
  evaluateRuleConditions,
  enrichAttributes,
  buildAcceptedSet,
  applyCrossRule,
  getCrossMatchedDesired,
  matchesAttribute,
  matchesImplicitPreference,
  isCompatible,
  getRuleIndex,
} from '../src/index.js';
import { Rule, Wish, UserProfile } from '../src/types.js';

const createRule = (
  id: string,
  rule_type: Rule['rule_type'],
  trigger_attribute: string,
  target_attribute: string,
  trigger_value: string,
  target_value: string,
  extra: Partial<Rule> = {}
): Rule => ({
  id,
  rule_type,
  trigger_attribute,
  target_attribute,
  trigger_value,
  target_value,
  ...extra,
});

describe('matchingEngine', () => {
  describe('normalizeToken', () => {
    it('trims and lowercases string values', () => {
      expect(normalizeToken('  MAN  ')).toBe('man');
      expect(normalizeToken(null)).toBe('');
      expect(normalizeToken(undefined)).toBe('');
    });
  });

  describe('escapeRegExp', () => {
    it('escapes regex special characters', () => {
      expect(escapeRegExp('a.b*c?')).toBe('a\\.b\\*c\\?');
    });
  });

  describe('hasToken', () => {
    it('matches whole word tokens', () => {
      expect(hasToken('gay man', 'man')).toBe(true);
      expect(hasToken('human', 'man')).toBe(false);
    });

    it('is case-insensitive regardless of token or input casing', () => {
      expect(hasToken('GAY MAN', 'man')).toBe(true);
      expect(hasToken('gay man', 'MAN')).toBe(true);
      expect(hasToken('GAY MAN', 'MAN')).toBe(true);
    });

    it('matches tokens separated by commas without spaces', () => {
      expect(hasToken('man,woman', 'man')).toBe(true);
      expect(hasToken('man,woman', 'woman')).toBe(true);
    });

    it('returns false for empty or non-string inputs', () => {
      expect(hasToken('', 'man')).toBe(false);
      expect(hasToken(null, 'man')).toBe(false);
      expect(hasToken('man', '')).toBe(false);
    });

    it('evicts cache when exceeding MAX_CACHE_SIZE', () => {
      for (let i = 0; i < 1005; i++) {
        hasToken('token' + i, 'token' + i);
      }
      expect(hasToken('token1004', 'token1004')).toBe(true);
    });
  });

  describe('normalizeArrayInput', () => {
    it('returns empty array for falsy values', () => {
      expect(normalizeArrayInput(null)).toEqual([]);
      expect(normalizeArrayInput(undefined)).toEqual([]);
      expect(normalizeArrayInput('')).toEqual([]);
    });

    it('returns array for single string input', () => {
      expect(normalizeArrayInput('man')).toEqual(['man']);
    });

    it('splits comma-separated strings', () => {
      expect(normalizeArrayInput('man,woman')).toEqual(['man', 'woman']);
    });

    it('trims whitespace and removes empty items', () => {
      expect(normalizeArrayInput(' man , , woman ')).toEqual(['man', 'woman']);
    });

    it('handles arrays of strings', () => {
      expect(normalizeArrayInput(['man', 'woman'])).toEqual(['man', 'woman']);
    });

    it('handles arrays containing comma-separated strings', () => {
      expect(normalizeArrayInput(['man,woman', 'non-binary'])).toEqual([
        'man',
        'woman',
        'non-binary',
      ]);
    });

    it('filters out falsy values in arrays', () => {
      expect(normalizeArrayInput(['man', '', null, 'woman'])).toEqual(['man', 'woman']);
    });

    it('handles numeric and boolean values safely', () => {
      expect(normalizeArrayInput(123)).toEqual(['123']);
      expect(normalizeArrayInput(true)).toEqual(['true']);
    });
  });

  describe('parseJsonSafe', () => {
    it('parses valid json string', () => {
      expect(parseJsonSafe('{"a":1}')).toEqual({ a: 1 });
    });

    it('returns original object if passed non-string', () => {
      const obj = { a: 1 };
      expect(parseJsonSafe(obj)).toBe(obj);
    });

    it('returns empty object on invalid json', () => {
      expect(parseJsonSafe('invalid json')).toEqual({});
      expect(parseJsonSafe(null)).toEqual({});
    });
  });

  describe('parseAttributesInput', () => {
    it('parses JSON string or object into normalized array attributes', () => {
      const raw = JSON.stringify({ gender: ['man'], orientation: 'gay' });
      const parsed = parseAttributesInput(raw);
      expect(parsed.gender).toEqual(['man']);
      expect(parsed.orientation).toEqual(['gay']);
    });

    it('returns empty object for empty input', () => {
      expect(parseAttributesInput(null)).toEqual({});
      expect(parseAttributesInput(undefined)).toEqual({});
      expect(parseAttributesInput('')).toEqual({});
    });

    it('returns empty object for non-object, non-string, or array inputs', () => {
      expect(parseAttributesInput(123)).toEqual({});
      expect(parseAttributesInput(true)).toEqual({});
      expect(parseAttributesInput(['array'])).toEqual({});
      expect(parseAttributesInput('invalid json {')).toEqual({});
    });
  });

  describe('matchesContext', () => {
    const rules: Rule[] = [
      {
        id: 'r1',
        rule_type: 'expansion',
        trigger_attribute: 'orientation',
        target_attribute: 'orientation',
        trigger_value: 'homosexual',
        target_value: 'gay',
      },
    ];

    it('returns true when rule has no context requirement', () => {
      const rule: Rule = {
        rule_type: 'enrichment',
        trigger_attribute: 'gender',
        trigger_value: 'man',
        target_attribute: 'gender',
        target_value: 'man',
      };
      expect(matchesContext(rule, {})).toBe(true);
    });

    it('returns false when contextProfile is missing', () => {
      const rule: Rule = {
        rule_type: 'enrichment',
        trigger_attribute: 'orientation',
        trigger_value: 'gay',
        target_attribute: 'gender',
        target_value: 'man',
        context_attribute: 'orientation',
        context_value: 'gay',
      };
      expect(matchesContext(rule, undefined)).toBe(false);
    });

    it('evaluates context against expanded values', () => {
      const rule: Rule = {
        rule_type: 'enrichment',
        trigger_attribute: 'orientation',
        trigger_value: 'gay',
        target_attribute: 'gender',
        target_value: 'man',
        context_attribute: 'orientation',
        context_value: 'gay',
      };
      const contextProfile = { orientation: ['homosexual'] };
      expect(matchesContext(rule, contextProfile, rules)).toBe(true);
    });

    it('returns false when context profile does not have the context attribute', () => {
      const rule: Rule = {
        rule_type: 'enrichment',
        trigger_attribute: 'orientation',
        trigger_value: 'gay',
        target_attribute: 'gender',
        target_value: 'man',
        context_attribute: 'orientation',
        context_value: 'gay',
      };
      const contextProfile = { gender: ['man'] };
      expect(matchesContext(rule, contextProfile)).toBe(false);
    });

    it('returns false when context profile has the context attribute but no values match', () => {
      const rule: Rule = {
        rule_type: 'enrichment',
        trigger_attribute: 'orientation',
        trigger_value: 'gay',
        target_attribute: 'gender',
        target_value: 'man',
        context_attribute: 'orientation',
        context_value: 'gay',
      };
      const contextProfile = { orientation: ['straight'] };
      expect(matchesContext(rule, contextProfile)).toBe(false);
    });
  });

  describe('getExpandedDesired', () => {
    const rules: Rule[] = [
      {
        id: 'r1',
        rule_type: 'expansion',
        trigger_attribute: 'role',
        target_attribute: 'role',
        trigger_value: 'dom',
        target_value: 'top, master',
      },
    ];

    it('expands trigger values based on expansion rules', () => {
      const expanded = getExpandedDesired(['dom'], 'role', rules);
      expect(expanded).toContain('dom');
      expect(expanded).toContain('top');
      expect(expanded).toContain('master');
    });
  });

  describe('getExclusionConflicts', () => {
    const rules: Rule[] = [
      {
        id: 'ex1',
        rule_type: 'exclusion',
        trigger_attribute: 'role',
        trigger_value: 'top',
        target_attribute: 'role',
        target_value: 'bottom',
      },
      {
        id: 'ex2',
        rule_type: 'exclusion',
        trigger_attribute: 'toy',
        trigger_value: 'rope',
        target_attribute: 'toy',
        target_value: 'knife',
        context_attribute: 'play_style',
        context_value: 'soft',
      },
    ];

    it('detects mutually exclusive attribute combinations', () => {
      const attributes = { role: ['top', 'bottom'] };
      const conflicts = getExclusionConflicts(attributes, rules);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].rule_id).toBe('ex1');
    });

    it('returns empty array when no conflicts exist', () => {
      const attributes = { role: ['top', 'switch'] };
      const conflicts = getExclusionConflicts(attributes, rules);
      expect(conflicts).toEqual([]);
    });

    it('detects conflicts when context condition is met', () => {
      const attributes = { toy: ['rope', 'knife'], play_style: ['soft'] };
      const conflicts = getExclusionConflicts(attributes, rules);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].rule_id).toBe('ex2');
    });

    it('returns empty array when context condition is not met', () => {
      const attributes = { toy: ['rope', 'knife'], play_style: ['hard'] };
      const conflicts = getExclusionConflicts(attributes, rules);
      expect(conflicts).toEqual([]);
    });

    it('returns empty array when context attribute is missing entirely', () => {
      const attributes = { toy: ['rope', 'knife'] };
      const conflicts = getExclusionConflicts(attributes, rules);
      expect(conflicts).toEqual([]);
    });

    it('detects conflict with multi-token comma-separated trigger and target values', () => {
      const multiTokenRules: Rule[] = [
        {
          id: 'ex_multi',
          rule_type: 'exclusion',
          trigger_attribute: 'role',
          trigger_value: 'dom,master',
          target_attribute: 'role',
          target_value: 'sub,slave',
        },
      ];
      // Only 'dom' and 'sub' are present; 'master' and 'slave' are absent
      const conflicts = getExclusionConflicts({ role: ['dom', 'sub'] }, multiTokenRules);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].message).toBe('"dom,master" and "sub,slave" are mutually exclusive.');
      expect(conflicts[0].context_attribute).toBeNull();
      expect(conflicts[0].context_value).toBeNull();
    });

    it('handles context condition with multi-token comma-separated values', () => {
      const multiCtxRule: Rule[] = [
        {
          id: 'ex_ctx_multi',
          rule_type: 'exclusion',
          trigger_attribute: 'toy',
          trigger_value: 'rope',
          target_attribute: 'toy',
          target_value: 'knife',
          context_attribute: 'play_style',
          context_value: 'soft,gentle',
        },
      ];
      // Play style only has 'gentle' (one of the context tokens)
      const conflicts = getExclusionConflicts(
        { toy: ['rope', 'knife'], play_style: ['gentle'] },
        multiCtxRule
      );
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].context_attribute).toBe('play_style');
      expect(conflicts[0].context_value).toBe('soft,gentle');
    });

    it('ignores context check when rule has context_attribute without context_value', () => {
      const partialCtxRule: Rule[] = [
        {
          id: 'ex_partial_ctx',
          rule_type: 'exclusion',
          trigger_attribute: 'role',
          trigger_value: 'top',
          target_attribute: 'role',
          target_value: 'bottom',
          context_attribute: 'mood',
          context_value: '',
        },
      ];
      const conflicts = getExclusionConflicts({ role: ['top', 'bottom'] }, partialCtxRule);
      expect(conflicts).toHaveLength(1);
    });
  });

  describe('enrichAttributes & buildAcceptedSet', () => {
    const rules: Rule[] = [
      {
        id: 'en1',
        rule_type: 'enrichment',
        trigger_attribute: 'orientation',
        trigger_value: 'lesbian',
        target_attribute: 'gender',
        target_value: 'woman',
      },
      {
        id: 'ac1',
        rule_type: 'acceptance',
        trigger_attribute: 'orientation',
        trigger_value: 'straight',
        context_attribute: 'gender',
        context_value: 'man',
        target_attribute: 'gender',
        target_value: 'woman, female',
      },
    ];

    it('enriches user attributes based on trigger conditions', () => {
      const enriched = enrichAttributes({ orientation: ['lesbian'] }, 'gender', rules);
      expect(enriched).toContain('woman');
    });

    it('builds accepted set based on acceptance rules and context', () => {
      const userAttrs = { orientation: ['straight'], gender: ['man'] };
      const accepted = buildAcceptedSet(userAttrs, 'gender', rules);
      expect(Array.from(accepted)).toContain('woman');
      expect(Array.from(accepted)).toContain('female');
    });
  });

  describe('getCrossMatchedDesired', () => {
    const rules: Rule[] = [
      {
        id: 'cr1',
        rule_type: 'cross_match',
        trigger_attribute: 'role',
        target_attribute: 'role',
        trigger_value: 'top',
        target_value: 'bottom',
      },
    ];

    it('returns complementary target values for trigger values', () => {
      const cross = getCrossMatchedDesired(['top'], 'role', rules);
      expect(cross).toContain('bottom');
    });

    it('returns complementary trigger values for target values', () => {
      const cross = getCrossMatchedDesired(['bottom'], 'role', rules);
      expect(cross).toContain('top');
    });
  });

  describe('evaluateRuleConditions', () => {
    it('evaluates rule trigger and context conditions', () => {
      const rule: Rule = {
        rule_type: 'enrichment',
        trigger_attribute: 'orientation',
        trigger_value: 'gay',
        target_attribute: 'gender',
        target_value: 'man',
        context_attribute: 'gender',
        context_value: 'man',
      };
      expect(evaluateRuleConditions(rule, { orientation: ['gay'], gender: ['man'] })).toBe(true);
      expect(evaluateRuleConditions(rule, { orientation: ['straight'], gender: ['man'] })).toBe(
        false
      );
    });
  });

  describe('applyCrossRule', () => {
    it('populates result set with complementary target or trigger values', () => {
      const rule: Rule = {
        rule_type: 'cross_match',
        trigger_attribute: 'role',
        target_attribute: 'role',
        trigger_value: 'top',
        target_value: 'bottom',
      };
      const result = new Set<string>();
      applyCrossRule('top', rule, undefined, [], result);
      expect(Array.from(result)).toContain('bottom');

      const result2 = new Set<string>();
      applyCrossRule('bottom', rule, undefined, [], result2);
      expect(Array.from(result2)).toContain('top');
    });

    it('respects context conditions on cross_match rules in applyCrossRule', () => {
      const rule: Rule = {
        rule_type: 'cross_match',
        trigger_attribute: 'role',
        target_attribute: 'role',
        trigger_value: 'top',
        target_value: 'bottom',
        context_attribute: 'mood',
        context_value: 'playful',
      };
      const result1 = new Set<string>();
      applyCrossRule('top', rule, { mood: ['playful'] }, [], result1);
      expect(Array.from(result1)).toContain('bottom');

      const result2 = new Set<string>();
      applyCrossRule('top', rule, { mood: ['serious'] }, [], result2);
      expect(Array.from(result2)).toHaveLength(0);
    });
  });

  describe('getRuleIndex', () => {
    it('indexes rules by category and type', () => {
      const rules: Rule[] = [
        createRule('exp1', 'expansion', 'role', 'role', 'dom', 'top'),
        createRule('cross1', 'cross_match', 'role', 'role', 'top', 'bottom'),
        createRule('acc1', 'acceptance', 'orientation', 'gender', 'pan', 'all'),
        createRule('ex1', 'exclusion', 'diet', 'diet', 'vegan', 'carnivore'),
        createRule('en1', 'enrichment', 'orientation', 'gender', 'lesbian', 'woman'),
      ];

      const index = getRuleIndex(rules);
      expect(index.expansionByCategory.get('role')).toHaveLength(1);
      expect(index.acceptanceByTarget.get('gender')).toHaveLength(1);
      expect(index.enrichmentByTarget.get('gender')).toHaveLength(1);
      expect(index.exclusion).toHaveLength(1);
      expect(index.crossMatchByCategory.get('role')).toHaveLength(1);

      // Cached index lookup on same array
      expect(getRuleIndex(rules)).toBe(index);
    });
  });

  describe('matchesAttribute', () => {
    it('returns true when desired attributes are empty', () => {
      expect(matchesAttribute(['man'], [], 'gender')).toBe(true);
      expect(matchesAttribute(['man'], null as unknown as string[], 'gender')).toBe(true);
      expect(matchesAttribute(['man'], undefined as unknown as string[], 'gender')).toBe(true);
    });

    it('returns false when searcher attributes are empty and desired attributes exist', () => {
      expect(matchesAttribute([], ['man'], 'gender')).toBe(false);
      expect(matchesAttribute(null as unknown as string[], ['man'], 'gender')).toBe(false);
      expect(matchesAttribute(undefined as unknown as string[], ['man'], 'gender')).toBe(false);
    });

    it('matches exact attribute values directly', () => {
      expect(matchesAttribute(['man'], ['man'], 'gender')).toBe(true);
      expect(matchesAttribute(['woman'], ['man'], 'gender')).toBe(false);
    });

    it('matches expanded attributes via expansion rules on desired values', () => {
      const rules: Rule[] = [createRule('exp1', 'expansion', 'role', 'role', 'dom', 'top,master')];
      expect(matchesAttribute(['top'], ['dom'], 'role', rules)).toBe(true);
      expect(matchesAttribute(['bottom'], ['dom'], 'role', rules)).toBe(false);
    });

    it('respects context on expansion rules in matchesAttribute', () => {
      const rules: Rule[] = [
        createRule('exp_ctx', 'expansion', 'role', 'role', 'lead', 'top', {
          context_attribute: 'scene',
          context_value: 'dance',
        }),
      ];
      // Context satisfied
      expect(matchesAttribute(['top'], ['lead'], 'role', rules, { scene: ['dance'] })).toBe(true);
      // Context not satisfied
      expect(matchesAttribute(['top'], ['lead'], 'role', rules, { scene: ['combat'] })).toBe(false);
    });

    it('matches attributes via cross_match rules and chains cross_match with expansion', () => {
      const rules: Rule[] = [
        createRule('cross1', 'cross_match', 'role', 'role', 'top', 'bottom'),
        createRule('exp_chain', 'expansion', 'role', 'role', 'bottom', 'sub,slave'),
      ];
      // Direct cross-match: desired 'top' -> cross-matches 'bottom'
      expect(matchesAttribute(['bottom'], ['top'], 'role', rules)).toBe(true);
      // Chained expansion of cross-match: desired 'top' -> 'bottom' -> 'sub'
      expect(matchesAttribute(['sub'], ['top'], 'role', rules)).toBe(true);
      expect(matchesAttribute(['switch'], ['top'], 'role', rules)).toBe(false);
    });

    it('respects context on chained expansion of cross-match', () => {
      const rules: Rule[] = [
        createRule('cross_ctx', 'cross_match', 'role', 'role', 'top', 'bottom'),
        createRule('exp_ctx_chain', 'expansion', 'role', 'role', 'bottom', 'sub', {
          context_attribute: 'experience',
          context_value: 'advanced',
        }),
      ];
      // With matching context
      expect(matchesAttribute(['sub'], ['top'], 'role', rules, { experience: ['advanced'] })).toBe(
        true
      );
      // With non-matching context
      expect(matchesAttribute(['sub'], ['top'], 'role', rules, { experience: ['novice'] })).toBe(
        false
      );
    });
  });

  describe('matchesImplicitPreference', () => {
    it('returns true when desired values are empty', () => {
      expect(matchesImplicitPreference({}, [], 'gender')).toBe(true);
    });

    it('returns true when no acceptance rules exist for target category', () => {
      expect(matchesImplicitPreference({ diet: ['herbivore'] }, ['rabbit'], 'species')).toBe(true);
    });

    it('returns false when acceptance rules exist but searcher does not match acceptance trigger', () => {
      const rules: Rule[] = [
        createRule('ac_diet', 'acceptance', 'diet', 'species', 'herbivore', 'rabbit,deer'),
      ];
      expect(matchesImplicitPreference({ diet: ['carnivore'] }, ['rabbit'], 'species', rules)).toBe(
        false
      );
    });
  });

  describe('isCompatible', () => {
    const rules: Rule[] = [
      {
        id: 'en1',
        rule_type: 'enrichment',
        trigger_attribute: 'orientation',
        trigger_value: 'gay',
        target_attribute: 'gender',
        target_value: 'man',
      },
      {
        id: 'ac1',
        rule_type: 'acceptance',
        trigger_attribute: 'orientation',
        trigger_value: 'gay',
        context_attribute: 'gender',
        context_value: 'man',
        target_attribute: 'gender',
        target_value: 'man',
      },
      {
        id: 'cr1',
        rule_type: 'cross_match',
        trigger_attribute: 'role',
        target_attribute: 'role',
        trigger_value: 'top',
        target_value: 'bottom',
      },
    ];

    it('evaluates compatibility between a wish and a searcher', () => {
      const wish: Wish = {
        creator_attributes: { gender: ['man'], orientation: ['gay'], role: ['top'] },
        desired_attributes: { gender: ['man'], role: ['bottom'] },
      };
      const searcher: UserProfile = {
        identity_attributes: { gender: ['man'], orientation: ['gay'], role: ['bottom'] },
      };

      expect(isCompatible(wish, searcher, rules)).toBe(true);
    });

    it('returns false when role criteria do not match', () => {
      const wish: Wish = {
        creator_attributes: { gender: ['man'], orientation: ['gay'], role: ['top'] },
        desired_attributes: { gender: ['man'], role: ['master'] },
      };
      const searcher: UserProfile = {
        identity_attributes: { gender: ['man'], orientation: ['gay'], role: ['bottom'] },
      };

      expect(isCompatible(wish, searcher, rules)).toBe(false);
    });

    it('evaluates custom domain categories (species, diet, alignment) without gender/orientation', () => {
      const customRules: Rule[] = [
        {
          id: 'ac_custom',
          rule_type: 'acceptance',
          trigger_attribute: 'diet',
          trigger_value: 'herbivore',
          target_attribute: 'species',
          target_value: 'rabbit,deer',
        },
        {
          id: 'cr_custom',
          rule_type: 'cross_match',
          trigger_attribute: 'alignment',
          target_attribute: 'alignment',
          trigger_value: 'order',
          target_value: 'chaos',
        },
      ];

      const wish: Wish = {
        creator_attributes: { diet: ['herbivore'], alignment: ['order'] },
        desired_attributes: { alignment: ['chaos'] },
      };
      const searcher: UserProfile = {
        identity_attributes: { species: ['deer'], alignment: ['chaos'], diet: ['herbivore'] },
      };

      expect(isCompatible(wish, searcher, customRules)).toBe(true);
    });

    it('evaluates compatibility when wish or searcher attributes are serialized JSON strings', () => {
      const wish: Wish = {
        creator_attributes: JSON.stringify({
          gender: ['man'],
          orientation: ['gay'],
          role: ['top'],
        }),
        desired_attributes: JSON.stringify({ gender: ['man'], role: ['bottom'] }),
      };
      const searcher: UserProfile = {
        identity_attributes: JSON.stringify({
          gender: ['man'],
          orientation: ['gay'],
          role: ['bottom'],
        }),
      };

      expect(isCompatible(wish, searcher, rules)).toBe(true);
    });

    it('uses default rules argument when omitted', () => {
      const wish: Wish = {
        creator_attributes: { gender: ['man'] },
        desired_attributes: { gender: ['man'] },
      };
      const searcher: UserProfile = {
        identity_attributes: { gender: ['man'] },
      };
      expect(isCompatible(wish, searcher)).toBe(true);
    });

    const lesbianRejectionRules: Rule[] = [
      createRule('ac_lesbian', 'acceptance', 'orientation', 'gender', 'lesbian', 'woman'),
    ];

    it('returns false when creator has implicit acceptance preference rejecting searcher', () => {
      // Creator is lesbian with no explicit desired gender specified
      const wish: Wish = {
        creator_attributes: { orientation: ['lesbian'] },
        desired_attributes: {},
      };
      // Searcher is a man
      const searcher: UserProfile = {
        identity_attributes: { gender: ['man'] },
      };
      expect(isCompatible(wish, searcher, lesbianRejectionRules)).toBe(false);
    });

    it('returns false when searcher has implicit preference rejecting creator', () => {
      // Searcher is lesbian who only accepts women
      const searcher: UserProfile = {
        identity_attributes: { orientation: ['lesbian'] },
      };
      // Creator is a man
      const wish: Wish = {
        creator_attributes: { gender: ['man'] },
        desired_attributes: {},
      };
      expect(isCompatible(wish, searcher, lesbianRejectionRules)).toBe(false);
    });

    it('handles null or undefined wish and searcher attributes safely', () => {
      const wish: Wish = { creator_attributes: undefined, desired_attributes: undefined };
      const searcher: UserProfile = { identity_attributes: undefined };
      expect(isCompatible(wish, searcher)).toBe(true);
    });
  });
});
