import { Rule, UserProfile, Wish, Conflict } from './types.js';

export const normalizeToken = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase();

export const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
};

const MAX_CACHE_SIZE = 1000;
const tokenRegExpCache = new Map<string, RegExp>();

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
  if (!value) return [];

  const array = Array.isArray(value) ? value : [value];
  const result: string[] = [];

  // Use a simple loop to avoid multiple intermediate array allocations from flatMap, map, and filter
  for (const rawItem of array) {
    const item = typeof rawItem === 'string' ? rawItem : String(rawItem ?? '');
    if (item.includes(',')) {
      const parts = item.split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) result.push(trimmed);
      }
    } else {
      const trimmed = item.trim();
      if (trimmed) result.push(trimmed);
    }
  }

  return result;
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

type RuleIndex = {
  byType: Map<string, Rule[]>;
  byTarget: Map<string, Rule[]>;
  byTriggerTarget: Map<string, Rule[]>;
};
const ruleIndexCache = new WeakMap<Rule[], RuleIndex>();

const getRuleIndex = (rules: Rule[]): RuleIndex => {
  let index = ruleIndexCache.get(rules);
  if (index) return index;

  index = {
    byType: new Map(),
    byTarget: new Map(),
    byTriggerTarget: new Map(),
  };

  for (const r of rules) {
    const byType = index.byType.get(r.rule_type) || [];
    byType.push(r);
    index.byType.set(r.rule_type, byType);

    if (r.target_attribute != null) {
      const byTargetKey = `${r.rule_type}:${r.target_attribute}`;
      const byTarget = index.byTarget.get(byTargetKey) || [];
      byTarget.push(r);
      index.byTarget.set(byTargetKey, byTarget);
    }

    if (r.trigger_attribute != null && r.target_attribute != null) {
      const byTriggerTargetKey = `${r.rule_type}:${r.trigger_attribute}:${r.target_attribute}`;
      const byTriggerTarget = index.byTriggerTarget.get(byTriggerTargetKey) || [];
      byTriggerTarget.push(r);
      index.byTriggerTarget.set(byTriggerTargetKey, byTriggerTarget);
    }
  }
  ruleIndexCache.set(rules, index);
  return index;
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
  const index = getRuleIndex(rules);
  const expandRules = index.byTriggerTarget.get(`expansion:${category}:${category}`) || [];

  const parsedTargets = expandRules.map((rule) =>
    rule.target_value.split(',').map((t) => t.trim().toLowerCase())
  );

  for (const val of desiredVals) {
    for (const [i, rule] of expandRules.entries()) {
      if (!hasToken(val, rule.trigger_value)) continue;
      if (contextProfile !== undefined && !matchesContext(rule, contextProfile, rules)) continue;

      const targets = parsedTargets[i];
      for (const target of targets) {
        if (target) result.add(target);
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

  const index = getRuleIndex(rules);
  const exclusionRules = index.byType.get('exclusion') || [];

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
  const index = getRuleIndex(rules);
  const enrichmentRules = index.byTarget.get(`enrichment:${targetCategory}`) || [];

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
  const index = getRuleIndex(rules);
  const acceptanceRules = index.byTarget.get(`acceptance:${targetCategory}`) || [];

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
  const index = getRuleIndex(rules);
  const crossRules = index.byTriggerTarget.get(`cross_match:${category}:${category}`) || [];

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
  const index = getRuleIndex(rules);
  const expandRules = index.byTriggerTarget.get(`expansion:${category}:${category}`) || [];
  const crossRules = index.byTriggerTarget.get(`cross_match:${category}:${category}`) || [];

  const crossMatchedDesired = new Set<string>();
  const seenTargets = new Set<string>();

  // Layer 0: Original desired values
  for (const val of desiredVals) {
    const normalizedVal = normalizeToken(val);
    if (normalizedSearcher.has(normalizedVal)) return true;
    seenTargets.add(normalizedVal);
  }

  // Evaluate inlined expansion rules
  for (const val of desiredVals) {
    for (const rule of expandRules) {
      if (hasToken(val, rule.trigger_value)) {
        if (contextProfile !== undefined && !matchesContext(rule, contextProfile, rules)) {
          continue;
        }
        const targets = rule.target_value.split(',').map((t) => t.trim().toLowerCase());
        for (const t of targets) {
          if (normalizedSearcher.has(t)) return true;
          seenTargets.add(t);
        }
      }
    }

    for (const rule of crossRules) {
      applyCrossRule(val, rule, contextProfile, rules, crossMatchedDesired);
    }
  }

  for (const val of crossMatchedDesired) {
    if (normalizedSearcher.has(val)) return true;
    seenTargets.add(val);

    for (const rule of expandRules) {
      if (hasToken(val, rule.trigger_value)) {
        if (contextProfile !== undefined && !matchesContext(rule, contextProfile, rules)) {
          continue;
        }
        const targets = rule.target_value.split(',').map((t) => t.trim().toLowerCase());
        for (const t of targets) {
          if (normalizedSearcher.has(t)) return true;
          seenTargets.add(t);
        }
      }
    }
  }

  return false;
};

export const matchesImplicitPreference = (
  searcherAttributes: Record<string, string[]>,
  desiredValues: string[] = [],
  targetCategory: string,
  rules: Rule[] = []
): boolean => {
  if (!desiredValues || desiredValues.length === 0) return true;

  const index = getRuleIndex(rules);
  const acceptanceRules = index.byTarget.get(`acceptance:${targetCategory}`) || [];
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
