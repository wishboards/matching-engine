import { matchesAttribute, normalizeToken, getExpandedDesired, getCrossMatchedDesired } from '../src/matchingEngine.js';
import { Rule } from '../src/types.js';

const generateRules = (count: number): Rule[] => {
  const rules: Rule[] = [];
  for (let i = 0; i < count; i++) {
    rules.push({
      id: i,
      rule_type: 'expansion',
      trigger_attribute: 'categoryA',
      trigger_value: `trigger_${i}`,
      target_attribute: 'categoryA',
      target_value: `target_${i}`,
    });
    rules.push({
      id: i + count,
      rule_type: 'cross_match',
      trigger_attribute: 'categoryA',
      trigger_value: `target_${i}`,
      target_attribute: 'categoryA',
      target_value: `cross_${i}`,
    });
  }
  return rules;
};

const rules = generateRules(1000); // 2000 total rules
const searcherVals = ['target_99', 'cross_150'];
const desiredVals = ['trigger_99', 'trigger_150', 'trigger_200'];

export const matchesAttributeOld = (
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

const profileOriginal = () => {
  console.time('original_matchesAttribute');
  for (let i = 0; i < 1000; i++) {
    matchesAttributeOld(searcherVals, desiredVals, 'categoryA', rules);
  }
  console.timeEnd('original_matchesAttribute');
};

const profileOptimized = () => {
  console.time('optimized_matchesAttribute');
  for (let i = 0; i < 1000; i++) {
    matchesAttribute(searcherVals, desiredVals, 'categoryA', rules);
  }
  console.timeEnd('optimized_matchesAttribute');
};

console.log('Running benchmark for matchesAttribute with 2000 rules over 1000 iterations...');
profileOriginal();
profileOptimized();
