export type RuleType = 'expansion' | 'enrichment' | 'acceptance' | 'exclusion' | 'cross_match';

export interface Rule {
  id?: number | string;
  rule_type: RuleType;
  trigger_attribute: string;
  trigger_value: string;
  target_attribute: string;
  target_value: string;
  context_attribute?: string | null;
  context_value?: string | null;
  [key: string]: unknown;
}

export type AttributeMap = Record<string, string[] | string | undefined | null>;

export interface UserProfile {
  identity_attributes?: AttributeMap | string;
  [key: string]: unknown;
}

export interface Wish {
  creator_attributes?: AttributeMap | string;
  desired_attributes?: AttributeMap | string;
  [key: string]: unknown;
}

export interface Conflict {
  rule_id?: number | string;
  trigger_attribute: string;
  trigger_value: string;
  context_attribute: string | null;
  context_value: string | null;
  target_attribute: string;
  target_value: string;
  message: string;
}

export type ValidationSeverity = 'error' | 'warning';

export type ValidationIssueCode =
  | 'MALFORMED_RULE'
  | 'EMPTY_RULE'
  | 'INCOMPLETE_CONTEXT'
  | 'CROSS_CATEGORY_EXPANSION'
  | 'CROSS_CATEGORY_CROSS_MATCH'
  | 'DUPLICATE_RULE'
  | 'EXPANSION_SELF_LOOP'
  | 'EXPANSION_CYCLE'
  | 'EXCLUSION_SELF_CONTRADICTION'
  | 'EXCLUSION_CROSS_MATCH_CONTRADICTION'
  | 'EXCLUSION_ACCEPTANCE_CONTRADICTION'
  | 'EXCLUSION_ENRICHMENT_CONTRADICTION'
  | 'EXCLUSION_EXPANSION_CONTRADICTION'
  | 'ORPHAN_ATTRIBUTE'
  | 'ORPHAN_TERM';

export interface ValidationIssue {
  code: ValidationIssueCode;
  severity: ValidationSeverity;
  message: string;
  ruleIds: (number | string)[];
  ruleIndices: number[];
  attribute?: string;
  terms?: string[];
}

export interface ValidateRulesetOptions {
  /**
   * Known valid attribute names. When provided, rules referencing unknown attributes
   * emit ORPHAN_ATTRIBUTE issues.
   */
  knownAttributes?: Iterable<string>;
  /**
   * Known valid terms per attribute. Mixed-case attribute keys and terms are merged
   * case-insensitively. When provided, unknown terms for listed attributes emit ORPHAN_TERM.
   */
  knownTerms?: Record<string, Iterable<string>> | Map<string, Iterable<string>>;
  /**
   * When true, orphan reference issues (ORPHAN_ATTRIBUTE, ORPHAN_TERM) are reported as
   * 'error' instead of 'warning'. Defaults to false.
   */
  strictOrphans?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
