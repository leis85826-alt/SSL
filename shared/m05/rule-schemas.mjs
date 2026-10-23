import { object, id, positive, nonnegative, validate, ContractError } from './schema.mjs';
const integer = { type: 'integer', minimum: 1 };
const offsets = { start_offset_m: nonnegative, end_offset_m: nonnegative, lateral_offset_m: { type: 'number' } };
export const RULE_SCHEMAS = {
  EQUAL_SPACING: object({ ...offsets, spacing_m: positive, count: integer, mode: { enum: ['FIXED_SPACING', 'FIXED_COUNT'] }, alignment: { enum: ['START', 'CENTER', 'BOTH_ENDS'] } }, ['mode']),
  GROUP_PLANTING: object({ ...offsets, group_size: integer, intra_group_spacing_m: positive, group_end_center_gap_m: positive, tail_policy: { enum: ['FULL_ONLY', 'CENTER', 'ALLOW_PARTIAL', 'REQUIRE_GROUP_COUNT'] }, group_count: integer }, ['group_size', 'intra_group_spacing_m', 'group_end_center_gap_m', 'start_offset_m', 'end_offset_m']),
  ALTERNATING: object({ ...offsets, spacing_m: positive, pattern: { type: 'array', minItems: 1, maxItems: 100, items: id } }, ['spacing_m', 'pattern']),
  HEDGE_ROWS: object({ ...offsets, spacing_m: positive, row_count: integer, row_spacing_m: nonnegative, side_offset_m: nonnegative, layout: { enum: ['GRID', 'STAGGERED'] }, quantity_method: { enum: ['INSTANCE_COUNT'] } }, ['spacing_m', 'row_count', 'row_spacing_m', 'layout']),
  GROUNDCOVER_AREA: object({ density_per_m2: positive, rounding: { enum: ['CEIL_PER_AREA', 'CEIL_AGGREGATE'] }, quantity_method: { enum: ['AREA_DENSITY'] } }),
  AREA_PARTITION: object({ widths_m: { type: 'array', minItems: 3, maxItems: 3, items: positive }, reference_alignment_id: id }),
};
export const ruleSchema = object({ rule_id: id, area_id: id, alignment_id: id, rule_type: { enum: Object.keys(RULE_SCHEMAS) }, species_config: object({ species_id: id, specification_id: id }, ['species_id']), parameters: { type: 'object' }, constraints: object({ min_center_distance_m: nonnegative, boundary_offset_m: nonnegative, max_shift_m: nonnegative, step_m: positive, max_iterations: { type: 'integer', minimum: 1 }, source_references: { type: 'array', items: id } }, []), conflict_strategy: { enum: ['REPORT', 'SKIP', 'REJECT', 'AUTO_ADJUST'] }, algorithm_version: { type: 'string', minLength: 1, maxLength: 100 } }, ['rule_id', 'area_id', 'rule_type', 'species_config', 'parameters', 'constraints', 'conflict_strategy', 'algorithm_version']);
export function validateRule(rule) {
  validate(ruleSchema, rule);
  validate(RULE_SCHEMAS[rule.rule_type], rule.parameters, '$.parameters');
  const p = rule.parameters;
  if (rule.rule_type === 'EQUAL_SPACING' && (p.mode === 'FIXED_COUNT' ? !p.count : !p.spacing_m)) throw new ContractError('固定数量/间距模式缺少对应参数');
  if (rule.rule_type === 'EQUAL_SPACING' && p.alignment === 'BOTH_ENDS' && p.mode !== 'FIXED_COUNT') throw new ContractError('两端对齐须显式采用数量均分');
  if (rule.rule_type === 'GROUP_PLANTING' && p.tail_policy === 'REQUIRE_GROUP_COUNT' && !p.group_count) throw new ContractError('缺少组数');
  if (rule.rule_type === 'HEDGE_ROWS' && p.row_count > 1 && p.row_spacing_m <= 0) throw new ContractError('多行行距须大于零');
  if (['EQUAL_SPACING', 'GROUP_PLANTING', 'ALTERNATING', 'HEDGE_ROWS'].includes(rule.rule_type) && !rule.alignment_id) throw new ContractError('缺少轴线');
  if (rule.conflict_strategy === 'AUTO_ADJUST' && !(Number.isFinite(rule.constraints.max_shift_m) && rule.constraints.max_shift_m >= 0 && Number.isFinite(rule.constraints.step_m) && rule.constraints.step_m > 0 && Number.isSafeInteger(rule.constraints.max_iterations) && rule.constraints.max_iterations > 0 && rule.constraints.max_iterations <= 10000)) throw new ContractError('自动调整须声明有限搜索范围、步长与迭代上限');
  return rule;
}
