import {
  Rule,
  RuleType,
  ValidateRulesetOptions,
  ValidationIssue,
  ValidationIssueCode,
  ValidationResult,
  ValidationSeverity,
} from './types.js';

const VALID_RULE_TYPES = new Set<RuleType>([
  'expansion',
  'enrichment',
  'acceptance',
  'exclusion',
  'cross_match',
]);

interface NormalizedRule {
  index: number;
  id: number | string | undefined;
  ruleType: RuleType;
  triggerAttr: string;
  targetAttr: string;
  triggerTokens: string[];
  targetTokens: string[];
  triggerSet: Set<string>;
  targetSet: Set<string>;
  contextAttr: string;
  contextTokens: string[];
  contextSet: Set<string>;
  hasCompleteContext: boolean;
}

const normalizeAttr = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const parseTokens = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of value.split(',')) {
    const token = part.trim().toLowerCase();
    if (token && !seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }
  return result;
};

const setsIntersect = (a: Set<string>, b: Set<string>): boolean => {
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) return true;
  }
  return false;
};

const contextsAreCompatible = (a: NormalizedRule, b: NormalizedRule): boolean => {
  if (!a.hasCompleteContext || !b.hasCompleteContext) return true;
  if (a.contextAttr !== b.contextAttr) return true;
  return setsIntersect(a.contextSet, b.contextSet);
};

const sortIds = (ids: Iterable<number | string>): (number | string)[] => {
  const unique = Array.from(new Set(ids));
  return unique.sort((a, b) => {
    const sa = String(a);
    const sb = String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  });
};

const sortIndices = (indices: Iterable<number>): number[] =>
  Array.from(new Set(indices)).sort((a, b) => a - b);

const compareNumberArrays = (a: number[], b: number[]): number => {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
};

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const sortIssues = (issues: ValidationIssue[]): ValidationIssue[] =>
  issues.sort((a, b) => {
    const codeCmp = compareStrings(a.code, b.code);
    if (codeCmp !== 0) return codeCmp;
    const idxCmp = compareNumberArrays(a.ruleIndices, b.ruleIndices);
    if (idxCmp !== 0) return idxCmp;
    const attrCmp = compareStrings(a.attribute ?? '', b.attribute ?? '');
    if (attrCmp !== 0) return attrCmp;
    return compareStrings(a.message, b.message);
  });

const buildCanonicalCycle = (cycle: string[]): string[] => {
  if (cycle.length <= 1) return cycle;
  let minIdx = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (compareStrings(cycle[i], cycle[minIdx]) < 0) {
      minIdx = i;
    }
  }
  return [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
};

const buildKnownTermsMap = (
  knownTerms: ValidateRulesetOptions['knownTerms']
): Map<string, Set<string>> | null => {
  if (!knownTerms) return null;
  const map = new Map<string, Set<string>>();
  const entries: Iterable<[string, Iterable<string>]> =
    knownTerms instanceof Map ? knownTerms.entries() : Object.entries(knownTerms);

  for (const [rawAttr, rawTerms] of entries) {
    const attr = normalizeAttr(rawAttr);
    if (!attr) continue;
    let termSet = map.get(attr);
    if (!termSet) {
      termSet = new Set<string>();
      map.set(attr, termSet);
    }
    if (rawTerms) {
      for (const rawTerm of rawTerms) {
        if (typeof rawTerm === 'string') {
          const token = rawTerm.trim().toLowerCase();
          if (token) termSet.add(token);
        }
      }
    }
  }
  return map;
};

const buildKnownAttributesSet = (
  knownAttributes: ValidateRulesetOptions['knownAttributes']
): Set<string> | null => {
  if (!knownAttributes) return null;
  const set = new Set<string>();
  for (const rawAttr of knownAttributes) {
    const attr = normalizeAttr(rawAttr);
    if (attr) set.add(attr);
  }
  return set;
};

const formatRuleRef = (rule: NormalizedRule): string =>
  rule.id !== undefined ? `#${String(rule.id)}` : `[index ${rule.index}]`;

/**
 * Pure, synchronous, deterministic rule-graph linter for `@wishboards/matching-engine`.
 *
 * Detects expansion cycles/self-loops, exclusion contradictions across all rule types,
 * empty/malformed/duplicate rules, and orphan attribute/term references.
 */
export const validateRuleset = (
  rules: Rule[],
  options: ValidateRulesetOptions = {}
): ValidationResult => {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const pushIssue = (issue: ValidationIssue): void => {
    if (issue.severity === 'error') {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  };

  if (!Array.isArray(rules)) {
    pushIssue({
      code: 'MALFORMED_RULE',
      severity: 'error',
      message: 'Ruleset must be an array.',
      ruleIds: [],
      ruleIndices: [],
    });
    return { valid: false, errors, warnings };
  }

  const normalizedRules: NormalizedRule[] = [];
  const ruleByIndex = new Map<number, NormalizedRule>();

  // 1. Structural & per-rule validation
  for (let i = 0; i < rules.length; i++) {
    const raw = rules[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      pushIssue({
        code: 'MALFORMED_RULE',
        severity: 'error',
        message: `Rule at index ${i} is not a valid object.`,
        ruleIds: [],
        ruleIndices: [i],
      });
      continue;
    }

    const ruleId = raw.id !== undefined && raw.id !== null ? raw.id : undefined;
    const ruleIds = ruleId !== undefined ? [ruleId] : [];

    if (!VALID_RULE_TYPES.has(raw.rule_type)) {
      pushIssue({
        code: 'MALFORMED_RULE',
        severity: 'error',
        message: `Rule ${ruleId !== undefined ? `#${String(ruleId)}` : `at index ${i}`} has invalid rule_type "${String(raw.rule_type)}".`,
        ruleIds,
        ruleIndices: [i],
      });
      continue;
    }

    const triggerAttr = normalizeAttr(raw.trigger_attribute);
    const targetAttr = normalizeAttr(raw.target_attribute);
    const triggerTokens = parseTokens(raw.trigger_value);
    const targetTokens = parseTokens(raw.target_value);
    const contextAttr = normalizeAttr(raw.context_attribute);
    const contextTokens = parseTokens(raw.context_value);

    const hasContextAttr = contextAttr.length > 0;
    const hasContextVal = contextTokens.length > 0;
    const hasCompleteContext = hasContextAttr && hasContextVal;

    if (hasContextAttr !== hasContextVal) {
      pushIssue({
        code: 'INCOMPLETE_CONTEXT',
        severity: 'warning',
        message: `Rule ${ruleId !== undefined ? `#${String(ruleId)}` : `at index ${i}`} has an incomplete context (both context_attribute and context_value are required).`,
        ruleIds,
        ruleIndices: [i],
      });
    }

    if (!triggerAttr || !targetAttr || triggerTokens.length === 0 || targetTokens.length === 0) {
      pushIssue({
        code: 'EMPTY_RULE',
        severity: 'error',
        message: `Rule ${ruleId !== undefined ? `#${String(ruleId)}` : `at index ${i}`} is missing required trigger or target attribute/value.`,
        ruleIds,
        ruleIndices: [i],
      });
      continue;
    }

    if (raw.rule_type === 'expansion' && triggerAttr !== targetAttr) {
      pushIssue({
        code: 'CROSS_CATEGORY_EXPANSION',
        severity: 'error',
        message: `Expansion rule ${ruleId !== undefined ? `#${String(ruleId)}` : `at index ${i}`} has mismatched attributes ("${triggerAttr}" -> "${targetAttr}"); expansion rules must share the same attribute.`,
        ruleIds,
        ruleIndices: [i],
      });
    }

    if (raw.rule_type === 'cross_match' && triggerAttr !== targetAttr) {
      pushIssue({
        code: 'CROSS_CATEGORY_CROSS_MATCH',
        severity: 'error',
        message: `Cross-match rule ${ruleId !== undefined ? `#${String(ruleId)}` : `at index ${i}`} has mismatched attributes ("${triggerAttr}" <-> "${targetAttr}"); cross_match rules must share the same attribute.`,
        ruleIds,
        ruleIndices: [i],
      });
    }

    const norm: NormalizedRule = {
      index: i,
      id: ruleId,
      ruleType: raw.rule_type,
      triggerAttr,
      targetAttr,
      triggerTokens,
      targetTokens,
      triggerSet: new Set(triggerTokens),
      targetSet: new Set(targetTokens),
      contextAttr: hasCompleteContext ? contextAttr : '',
      contextTokens: hasCompleteContext ? contextTokens : [],
      contextSet: new Set(hasCompleteContext ? contextTokens : []),
      hasCompleteContext,
    };

    normalizedRules.push(norm);
    ruleByIndex.set(i, norm);
  }

  // 2. Duplicate rule detection
  const duplicateGroups = new Map<string, NormalizedRule[]>();
  for (const rule of normalizedRules) {
    const trigKey = [...rule.triggerTokens].sort(compareStrings).join(',');
    const targKey = [...rule.targetTokens].sort(compareStrings).join(',');
    const ctxKey = rule.hasCompleteContext
      ? `${rule.contextAttr}:${[...rule.contextTokens].sort(compareStrings).join(',')}`
      : '';

    let signature: string;
    if (rule.ruleType === 'cross_match' && rule.triggerAttr === rule.targetAttr) {
      const [first, second] = [trigKey, targKey].sort(compareStrings);
      signature = `${rule.ruleType}|${rule.triggerAttr}|${first}|${second}|${ctxKey}`;
    } else {
      signature = `${rule.ruleType}|${rule.triggerAttr}:${trigKey}|${rule.targetAttr}:${targKey}|${ctxKey}`;
    }

    const group = duplicateGroups.get(signature) || [];
    group.push(rule);
    duplicateGroups.set(signature, group);
  }

  for (const group of duplicateGroups.values()) {
    if (group.length > 1) {
      const ruleIndices = sortIndices(group.map((r) => r.index));
      const ruleIds = sortIds(
        group.map((r) => r.id).filter((id): id is number | string => id !== undefined)
      );
      pushIssue({
        code: 'DUPLICATE_RULE',
        severity: 'warning',
        message: `Duplicate ${group[0].ruleType} rule detected across ${group.map(formatRuleRef).join(', ')}.`,
        ruleIds,
        ruleIndices,
      });
    }
  }

  // 3. Expansion self-loops and multi-node cycles (per category, 3-color DFS)
  // category -> u -> v -> Set<ruleIndex>
  const expansionGraphs = new Map<string, Map<string, Map<string, Set<number>>>>();
  for (const rule of normalizedRules) {
    if (rule.ruleType !== 'expansion' || rule.triggerAttr !== rule.targetAttr) continue;
    let graph = expansionGraphs.get(rule.triggerAttr);
    if (!graph) {
      graph = new Map();
      expansionGraphs.set(rule.triggerAttr, graph);
    }
    for (const u of rule.triggerTokens) {
      let neighbors = graph.get(u);
      if (!neighbors) {
        neighbors = new Map();
        graph.set(u, neighbors);
      }
      for (const v of rule.targetTokens) {
        let edgeRules = neighbors.get(v);
        if (!edgeRules) {
          edgeRules = new Set();
          neighbors.set(v, edgeRules);
        }
        edgeRules.add(rule.index);
      }
    }
  }

  const sortedCategories = Array.from(expansionGraphs.keys()).sort(compareStrings);
  for (const category of sortedCategories) {
    const graph = expansionGraphs.get(category)!;
    const allNodesSet = new Set<string>();
    for (const [u, neighbors] of graph.entries()) {
      allNodesSet.add(u);
      for (const v of neighbors.keys()) {
        allNodesSet.add(v);
      }
    }
    const sortedNodes = Array.from(allNodesSet).sort(compareStrings);

    // Self-loops
    for (const u of sortedNodes) {
      const selfIndices = graph.get(u)?.get(u);
      if (selfIndices && selfIndices.size > 0) {
        const ruleIndices = sortIndices(selfIndices);
        const ruleIds = sortIds(
          ruleIndices
            .map((idx) => ruleByIndex.get(idx)?.id)
            .filter((id): id is number | string => id !== undefined)
        );
        pushIssue({
          code: 'EXPANSION_SELF_LOOP',
          severity: 'error',
          message: `Expansion self-loop detected in "${category}" for term "${u}".`,
          ruleIds,
          ruleIndices,
          attribute: category,
          terms: [u],
        });
      }
    }

    // 3-color DFS: 0 = white (unvisited), 1 = gray (visiting), 2 = black (visited)
    const color = new Map<string, number>();
    const stack: string[] = [];
    const seenCycleKeys = new Set<string>();

    const dfs = (u: string): void => {
      color.set(u, 1);
      stack.push(u);

      const neighborsMap = graph.get(u);
      if (neighborsMap) {
        const neighbors = Array.from(neighborsMap.keys()).sort(compareStrings);
        for (const v of neighbors) {
          if (u === v) continue; // Self-loops handled separately
          const vColor = color.get(v) ?? 0;
          if (vColor === 1) {
            const startIdx = stack.indexOf(v);
            const rawCycle = stack.slice(startIdx);
            const canonical = buildCanonicalCycle(rawCycle);
            const cycleKey = `${category}:${canonical.join('->')}`;
            if (!seenCycleKeys.has(cycleKey)) {
              seenCycleKeys.add(cycleKey);
              const cycleRuleIndices = new Set<number>();
              for (let k = 0; k < rawCycle.length; k++) {
                const from = rawCycle[k];
                const to = rawCycle[(k + 1) % rawCycle.length];
                const edgeSet = graph.get(from)?.get(to);
                if (edgeSet) {
                  for (const idx of edgeSet) cycleRuleIndices.add(idx);
                }
              }
              const ruleIndices = sortIndices(cycleRuleIndices);
              const ruleIds = sortIds(
                ruleIndices
                  .map((idx) => ruleByIndex.get(idx)?.id)
                  .filter((id): id is number | string => id !== undefined)
              );
              const displayPath = [...canonical, canonical[0]].join(' -> ');
              pushIssue({
                code: 'EXPANSION_CYCLE',
                severity: 'error',
                message: `Expansion cycle detected in "${category}": ${displayPath}.`,
                ruleIds,
                ruleIndices,
                attribute: category,
                terms: [...canonical].sort(compareStrings),
              });
            }
          } else if (vColor === 0) {
            dfs(v);
          }
        }
      }

      stack.pop();
      color.set(u, 2);
    };

    for (const node of sortedNodes) {
      if ((color.get(node) ?? 0) === 0) {
        dfs(node);
      }
    }
  }

  // 4. Exclusion contradictions
  const exclusions = normalizedRules.filter((r) => r.ruleType === 'exclusion');
  const nonExclusions = normalizedRules.filter((r) => r.ruleType !== 'exclusion');

  for (const ex of exclusions) {
    // 4a. Self-contradiction: excluding a term against itself in the same attribute
    if (ex.triggerAttr === ex.targetAttr && setsIntersect(ex.triggerSet, ex.targetSet)) {
      const overlapping = [...ex.triggerSet]
        .filter((t) => ex.targetSet.has(t))
        .sort(compareStrings);
      const ruleIds = ex.id !== undefined ? [ex.id] : [];
      pushIssue({
        code: 'EXCLUSION_SELF_CONTRADICTION',
        severity: 'error',
        message: `Exclusion rule ${formatRuleRef(ex)} excludes term(s) [${overlapping.join(', ')}] in "${ex.triggerAttr}" against themselves.`,
        ruleIds,
        ruleIndices: [ex.index],
        attribute: ex.triggerAttr,
        terms: overlapping,
      });
    }

    // 4b. Contradictions with cross_match, expansion, enrichment, acceptance
    for (const other of nonExclusions) {
      if (!contextsAreCompatible(ex, other)) continue;

      if (other.ruleType === 'cross_match' && other.triggerAttr !== other.targetAttr) continue;
      if (other.ruleType === 'expansion' && other.triggerAttr !== other.targetAttr) continue;

      const forwardMatch =
        ex.triggerAttr === other.triggerAttr &&
        ex.targetAttr === other.targetAttr &&
        setsIntersect(ex.triggerSet, other.triggerSet) &&
        setsIntersect(ex.targetSet, other.targetSet);

      const reverseMatch =
        ex.triggerAttr === other.targetAttr &&
        ex.targetAttr === other.triggerAttr &&
        setsIntersect(ex.triggerSet, other.targetSet) &&
        setsIntersect(ex.targetSet, other.triggerSet);

      if (!forwardMatch && !reverseMatch) continue;

      let code: ValidationIssueCode;
      switch (other.ruleType) {
        case 'cross_match':
          code = 'EXCLUSION_CROSS_MATCH_CONTRADICTION';
          break;
        case 'acceptance':
          code = 'EXCLUSION_ACCEPTANCE_CONTRADICTION';
          break;
        case 'enrichment':
          code = 'EXCLUSION_ENRICHMENT_CONTRADICTION';
          break;
        case 'expansion':
          code = 'EXCLUSION_EXPANSION_CONTRADICTION';
          break;
        default:
          continue;
      }

      const ruleIndices = sortIndices([ex.index, other.index]);
      const ruleIds = sortIds(
        [ex.id, other.id].filter((id): id is number | string => id !== undefined)
      );

      pushIssue({
        code,
        severity: 'error',
        message: `Exclusion rule ${formatRuleRef(ex)} contradicts ${other.ruleType} rule ${formatRuleRef(other)}.`,
        ruleIds,
        ruleIndices,
      });
    }
  }

  // 5. Orphan attribute and term references
  const knownAttrs = buildKnownAttributesSet(options.knownAttributes);
  const knownTerms = buildKnownTermsMap(options.knownTerms);
  const orphanSeverity: ValidationSeverity = options.strictOrphans ? 'error' : 'warning';

  if (knownAttrs || knownTerms) {
    for (const rule of normalizedRules) {
      const ruleIds = rule.id !== undefined ? [rule.id] : [];

      if (knownAttrs) {
        const referencedAttrs = new Set<string>([rule.triggerAttr, rule.targetAttr]);
        if (rule.hasCompleteContext) referencedAttrs.add(rule.contextAttr);

        const sortedAttrs = Array.from(referencedAttrs).sort(compareStrings);
        for (const attr of sortedAttrs) {
          if (!knownAttrs.has(attr)) {
            pushIssue({
              code: 'ORPHAN_ATTRIBUTE',
              severity: orphanSeverity,
              message: `Rule ${formatRuleRef(rule)} references unknown attribute "${attr}".`,
              ruleIds,
              ruleIndices: [rule.index],
              attribute: attr,
            });
          }
        }
      }

      if (knownTerms) {
        const unknownByAttr = new Map<string, Set<string>>();
        const checkTerms = (attr: string, tokens: string[]): void => {
          const validTerms = knownTerms.get(attr);
          if (!validTerms) return;
          for (const token of tokens) {
            if (!validTerms.has(token)) {
              let set = unknownByAttr.get(attr);
              if (!set) {
                set = new Set<string>();
                unknownByAttr.set(attr, set);
              }
              set.add(token);
            }
          }
        };

        checkTerms(rule.triggerAttr, rule.triggerTokens);
        checkTerms(rule.targetAttr, rule.targetTokens);
        if (rule.hasCompleteContext) {
          checkTerms(rule.contextAttr, rule.contextTokens);
        }

        const sortedAttrs = Array.from(unknownByAttr.keys()).sort(compareStrings);
        for (const attr of sortedAttrs) {
          const terms = Array.from(unknownByAttr.get(attr)!).sort(compareStrings);
          pushIssue({
            code: 'ORPHAN_TERM',
            severity: orphanSeverity,
            message: `Rule ${formatRuleRef(rule)} references unknown term(s) [${terms.join(', ')}] for attribute "${attr}".`,
            ruleIds,
            ruleIndices: [rule.index],
            attribute: attr,
            terms,
          });
        }
      }
    }
  }

  sortIssues(errors);
  sortIssues(warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
};
