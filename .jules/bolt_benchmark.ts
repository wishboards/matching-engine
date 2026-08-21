import { isCompatible } from '../src/matchingEngine.ts';
import { Rule, Wish, UserProfile } from '../src/types.ts';

const rules: Rule[] = [];
for (let i = 0; i < 50; i++) {
  rules.push({
    rule_type: 'expansion',
    trigger_attribute: 'attr_1',
    trigger_value: 'val_1',
    target_attribute: 'attr_1',
    target_value: 'tval_' + i + ',tval_' + (i + 1),
  });
  rules.push({
    rule_type: 'cross_match',
    trigger_attribute: 'attr_1',
    trigger_value: 'val_1',
    target_attribute: 'attr_1',
    target_value: 'tval_' + i + ',tval_' + (i + 1),
  });
}

const wish: Wish = {
  creator_attributes: { attr_1: ['val_1'] },
  desired_attributes: { attr_1: ['not_val_1'] },
};
const searcher: UserProfile = {
  identity_attributes: { attr_1: ['val_1'] },
};

const start = performance.now();
for (let i = 0; i < 10000; i++) {
  isCompatible(wish, searcher, rules);
}
console.log('Time taken: ' + (performance.now() - start) + 'ms');
