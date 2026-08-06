import { Rule, UserProfile, Wish, Conflict } from './types.js';

export interface RuleIndex {
  expansion: Map<string, Rule[]>;
  enrichment: Map<string, Rule[]>;
  acceptance: Map<string, Rule[]>;
  exclusion: Rule[];
  cross_match: Map<string, Rule[]>;
}

const ruleIndexCache = new WeakMap<Rule[], RuleIndex>();

export const getRuleIndex = (rules: Rule[]): RuleIndex => {
  let index = ruleIndexCache.get(rules);
  if (!index) {
    index = {
      expansion: new Map(),
      enrichment: new Map(),
      acceptance: new Map(),
      exclusion: [],
      cross_match: new Map(),
    };
    for (const r of rules) {
      if (r.rule_type === 'exclusion') {
        index.exclusion.push(r);
      } else if (r.rule_type === 'enrichment') {
        if (!index.enrichment.has(r.target_attribute)) {
          index.enrichment.set(r.target_attribute, []);
        }
        index.enrichment.get(r.target_attribute)!.push(r);
      } else if (r.rule_type === 'acceptance') {
        if (!index.acceptance.has(r.target_attribute)) {
          index.acceptance.set(r.target_attribute, []);
        }
        index.acceptance.get(r.target_attribute)!.push(r);
      } else if (r.rule_type === 'expansion' && r.trigger_attribute === r.target_attribute) {
        if (!index.expansion.has(r.trigger_attribute)) {
          index.expansion.set(r.trigger_attribute, []);
        }
        index.expansion.get(r.trigger_attribute)!.push(r);
      } else if (r.rule_type === 'cross_match' && r.trigger_attribute === r.target_attribute) {
        if (!index.cross_match.has(r.trigger_attribute)) {
          index.cross_match.set(r.trigger_attribute, []);
        }
        index.cross_match.get(r.trigger_attribute)!.push(r);
      }
    }
    ruleIndexCache.set(rules, index);
  }
  return index;
};

export const normalizeToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

export const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

// Cache compiled RegExp to prevent recompilation in high-frequency loops
const tokenRegExpCache = new Map<string, RegExp>();
const MAX_CACHE_SIZE = 10000;

export const hasToken = (str: unknown, token: string): boolean => {
  let regex = tokenRegExpCache.get(token);
  if (!regex) {
    if (tokenRegExpCache.size >= MAX_CACHE_SIZE) {
      // Prevent unbounded memory growth by clearing cache when it gets too large
      tokenRegExpCache.clear();
    }
    const escapedToken = escapeRegExp(token);
    regex = new RegExp(String.raw`\b${escapedToken}\b`, 'i');
    tokenRegExpCache.set(token, regex);
  }
  return regex.test(normalizeToken(str));
};

export const parseJsonSafe = (str: unknown): Record<string, unknown> => {
  if (!str) return {};
  if (typeof str !== 'string') return (str as Record<string, unknown>) || {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
};

export const normalizeArrayInput = (value: unknown): string[] => {
  if (!value) {
    return [];
  }
  const array = Array.isArray(value) ? value : [value];
  return array
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);
};

export const parseAttributesInput = (rawAttrs: unknown): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  if (!rawAttrs) return result;

  let parsed = rawAttrs;
  if (typeof rawAttrs === 'string') {
    parsed = parseJsonSafe(rawAttrs);
  }

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const key of Object.keys(parsed as Record<string, unknown>)) {
      result[key] = normalizeArrayInput((parsed as Record<string, unknown>)[key]);
    }
  }
  return result;
};

export const matchesContext = (
  rule: Rule,
  contextProfile: Record<string, string[]> | undefined,
  rules: Rule[] = []
): boolean => {
  if (!rule.context_attribute || !rule.context_value) return true;
  if (!contextProfile) return false;

  const ctxVals = contextProfile[rule.context_attribute] || [];
  const expandedCtxVals = getExpandedDesired(ctxVals, rule.context_attribute, rules, undefined);
  return expandedCtxVals.some((v) => hasToken(v, rule.context_value!));
};

export const getExpandedDesired = (
  desiredVals: string[],
  category: string,
  rules: Rule[] = [],
  contextProfile: Record<string, string[]> | undefined = undefined
): string[] => {
  const result = new Set(desiredVals.map(normalizeToken));
  const expandRules = getRuleIndex(rules).expansion.get(category) || [];

  for (const val of desiredVals) {
    for (const rule of expandRules) {
      if (hasToken(val, rule.trigger_value)) {
        if (contextProfile !== undefined && !matchesContext(rule, contextProfile, rules)) {
          continue;
        }
        const targets = rule.target_value.split(',').map((t) => t.trim().toLowerCase());
        targets.forEach((t) => result.add(t));
      }
    }
  }
  return Array.from(result);
};

export const getExclusionConflicts = (
  attributes: Record<string, string[]>,
  rules: Rule[] = []
): Conflict[] => {
  const conflicts: Conflict[] = [];
  const expandedAttrs: Record<string, string[]> = {};
  for (const key of Object.keys(attributes)) {
    const vals = attributes[key] || [];
    expandedAttrs[key] = getExpandedDesired(vals, key, rules, attributes);
  }

  const exclusionRules = getRuleIndex(rules).exclusion;

  for (const rule of exclusionRules) {
    const triggerTokens = rule.trigger_value
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    const targetTokens = rule.target_value
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const hasTrigger = triggerTokens.some((token) =>
      expandedAttrs[rule.trigger_attribute]?.some((attrVal) => hasToken(attrVal, token))
    );

    let hasContext = true;
    if (rule.context_attribute && rule.context_value) {
      const ctxAttr = rule.context_attribute;
      const contextTokens = rule.context_value
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      hasContext = contextTokens.some((token) =>
        expandedAttrs[ctxAttr]?.some((attrVal: string) => hasToken(attrVal, token))
      );
    }

    const hasTarget = targetTokens.some((token) =>
      expandedAttrs[rule.target_attribute]?.some((attrVal: string) => hasToken(attrVal, token))
    );

    if (hasTrigger && hasContext && hasTarget) {
      conflicts.push({
        rule_id: rule.id,
        trigger_attribute: rule.trigger_attribute,
        trigger_value: rule.trigger_value,
        context_attribute: rule.context_attribute || null,
        context_value: rule.context_value || null,
        target_attribute: rule.target_attribute,
        target_value: rule.target_value,
        message: `"${rule.trigger_value}" and "${rule.target_value}" are mutually exclusive.`,
      });
    }
  }

  return conflicts;
};

export const evaluateRuleConditions = (
  rule: Rule,
  userAttributes: Record<string, string[]>,
  rules: Rule[] = []
): boolean => {
  const triggerVals = userAttributes[rule.trigger_attribute] || [];
  const triggerMatch = triggerVals.some((v) => hasToken(v, rule.trigger_value));
  if (!triggerMatch) return false;

  let contextMatch = true;
  if (rule.context_attribute && rule.context_value) {
    const ctxVal = rule.context_value;
    const ctxVals = userAttributes[rule.context_attribute] || [];
    const expandedCtxVals = getExpandedDesired(ctxVals, rule.context_attribute, rules);
    contextMatch = expandedCtxVals.some((v) => hasToken(v, ctxVal));
  }

  return triggerMatch && contextMatch;
};

export const enrichAttributes = (
  userAttributes: Record<string, string[]>,
  targetCategory: string,
  rules: Rule[] = []
): string[] => {
  const enriched = new Set((userAttributes[targetCategory] || []).map(normalizeToken));
  const enrichmentRules = getRuleIndex(rules).enrichment.get(targetCategory) || [];

  for (const rule of enrichmentRules) {
    if (evaluateRuleConditions(rule, userAttributes, rules)) {
      enriched.add(rule.target_value.toLowerCase());
    }
  }
  return Array.from(enriched);
};

export const buildAcceptedSet = (
  userAttributes: Record<string, string[]>,
  targetCategory: string,
  rules: Rule[] = []
): Set<string> => {
  const accepted = new Set<string>();
  const acceptanceRules = getRuleIndex(rules).acceptance.get(targetCategory) || [];

  for (const rule of acceptanceRules) {
    if (evaluateRuleConditions(rule, userAttributes, rules)) {
      const targets = rule.target_value.split(',').map((t) => t.trim().toLowerCase());
      targets.forEach((t) => accepted.add(t));
    }
  }
  return accepted;
};

export const applyCrossRule = (
  val: string,
  rule: Rule,
  contextProfile: Record<string, string[]> | undefined,
  rules: Rule[],
  result: Set<string>
): void => {
  if (contextProfile !== undefined && !matchesContext(rule, contextProfile, rules)) return;
  if (hasToken(val, rule.trigger_value)) {
    const targets = rule.target_value.split(',').map((t) => t.trim().toLowerCase());
    targets.forEach((t) => result.add(t));
  }
  if (rule.target_value.split(',').some((t) => hasToken(val, t.trim().toLowerCase()))) {
    result.add(rule.trigger_value.toLowerCase());
  }
};

export const getCrossMatchedDesired = (
  desiredVals: string[],
  category: string,
  rules: Rule[] = [],
  contextProfile: Record<string, string[]> | undefined = undefined
): string[] => {
  const result = new Set<string>();
  const crossRules = getRuleIndex(rules).cross_match.get(category) || [];

  for (const val of desiredVals) {
    for (const rule of crossRules) {
      applyCrossRule(val, rule, contextProfile, rules, result);
    }
  }
  return Array.from(result);
};

export const matchesAttribute = (
  searcherVals: string[],
  desiredVals: string[],
  category: string,
  rules: Rule[] = [],
  contextProfile: Record<string, string[]> | undefined = undefined
): boolean => {
  if (!desiredVals || desiredVals.length === 0) return true;
  if (!searcherVals || searcherVals.length === 0) return false;

  const normalizedSearcher = new Set(searcherVals.map(normalizeToken));
  const expandedDesired = getExpandedDesired(desiredVals, category, rules, contextProfile);
  const crossMatchedDesired = getCrossMatchedDesired(desiredVals, category, rules, contextProfile);
  const expandedCrossMatched = getExpandedDesired(
    Array.from(crossMatchedDesired),
    category,
    rules,
    contextProfile
  );

  const allAcceptable = new Set([
    ...expandedDesired,
    ...crossMatchedDesired,
    ...expandedCrossMatched,
  ]);

  return Array.from(allAcceptable).some((desired) => normalizedSearcher.has(desired));
};

export const matchesImplicitPreference = (
  searcherAttributes: Record<string, string[]>,
  desiredValues: string[] = [],
  targetCategory: string,
  rules: Rule[] = []
): boolean => {
  if (!desiredValues || desiredValues.length === 0) return true;

  const acceptanceRules = getRuleIndex(rules).acceptance.get(targetCategory) || [];
  if (acceptanceRules.length === 0) return true;

  const accepted = buildAcceptedSet(searcherAttributes, targetCategory, rules);
  if (accepted.size === 0) return false;

  return matchesAttribute(Array.from(accepted), desiredValues, targetCategory, rules);
};

/**
 * Evaluates bidirectional identity compatibility between a wish and a searcher profile.
 *
 * @param wish The wish object containing creator_attributes and desired_attributes.
 * @param searcher The user profile searching or viewing wishes.
 * @param rules Dynamic matching rules array (expansion, enrichment, acceptance, exclusion, cross_match).
 * @returns True if creator and searcher are mutually compatible under the rule set.
 */
export const isCompatible = (wish: Wish, searcher: UserProfile, rules: Rule[] = []): boolean => {
  const creatorProfileRaw =
    typeof wish.creator_attributes === 'string'
      ? parseJsonSafe(wish.creator_attributes)
      : wish.creator_attributes || {};

  const desiredProfileRaw =
    typeof wish.desired_attributes === 'string'
      ? parseJsonSafe(wish.desired_attributes)
      : wish.desired_attributes || {};

  const searcherProfileRaw =
    typeof searcher.identity_attributes === 'string'
      ? parseJsonSafe(searcher.identity_attributes)
      : searcher.identity_attributes || {};

  const creatorParsed: Record<string, string[]> = {};
  for (const key of Object.keys(creatorProfileRaw)) {
    creatorParsed[key] = normalizeArrayInput(creatorProfileRaw[key]);
  }

  const desiredParsed: Record<string, string[]> = {};
  for (const key of Object.keys(desiredProfileRaw)) {
    desiredParsed[key] = normalizeArrayInput(desiredProfileRaw[key]);
  }

  const searcherParsed: Record<string, string[]> = {};
  for (const key of Object.keys(searcherProfileRaw)) {
    searcherParsed[key] = normalizeArrayInput(searcherProfileRaw[key]);
  }

  const creatorProfile: Record<string, string[]> = {};
  for (const key of Object.keys(creatorParsed)) {
    creatorProfile[key] = enrichAttributes(creatorParsed, key, rules);
  }

  const searcherProfile: Record<string, string[]> = {};
  for (const key of Object.keys(searcherParsed)) {
    searcherProfile[key] = enrichAttributes(searcherParsed, key, rules);
  }

  const allCategories = new Set<string>([
    ...Object.keys(creatorProfile),
    ...Object.keys(desiredParsed),
    ...Object.keys(searcherProfile),
    ...rules.map((r) => r.target_attribute).filter(Boolean),
  ]);

  for (const cat of allCategories) {
    // 1. Does searcher accept creator's attributes for category `cat`?
    const creatorVals = creatorProfile[cat] || [];
    if (!matchesImplicitPreference(searcherProfile, creatorVals, cat, rules)) {
      return false;
    }

    // 2. Does creator accept searcher's attributes for category `cat`?
    const desiredVals = desiredParsed[cat] || [];
    if (desiredVals.length > 0) {
      if (!matchesAttribute(searcherProfile[cat] || [], desiredVals, cat, rules, searcherProfile)) {
        return false;
      }
    } else {
      const searcherVals = searcherProfile[cat] || [];
      if (!matchesImplicitPreference(creatorProfile, searcherVals, cat, rules)) {
        return false;
      }
    }
  }

  return true;
};
