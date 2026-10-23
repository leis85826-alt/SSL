import { object, text, id, positive, nonnegative, validate, ContractError } from './schema.mjs';
import { validateRule } from './rule-schemas.mjs';
const strings = { type: 'array', maxItems: 100, items: text };
const geometry = { type: 'object' };
export const schemas = {
  project: object({ name: text, city: text, road_type: text, crs: text, source_unit: { enum: ['m', 'mm', 'cm', 'ft'] }, unit_to_meter: positive }),
  species: object({ species_id: id, chinese_name: text, scientific_name: text, category: text, evergreen_type: text, usage_tags: strings, suitable_regions: strings, symbol_id: id }),
  specifications: object({ specification_id: id, species_id: id, trunk_diameter_cm: nonnegative, ground_diameter_cm: nonnegative, height_m: nonnegative, crown_diameter_m: nonnegative, branch_height_m: nonnegative, default_density: positive }, ['specification_id', 'species_id']),
  areas: object({ area_id: id, name: text, area_type: text, geometry, excluded_geometry: { type: 'array', maxItems: 1000, items: geometry }, usable_area_m2: nonnegative, source_layer: text, locked: { type: 'boolean' } }),
  alignments: object({ alignment_id: id, geometry, direction: { enum: ['FORWARD', 'REVERSE'] }, length_m: nonnegative, geometry_version: { type: 'integer', minimum: 1 } }),
  objects: object({ object_id: id, object_type: { enum: ['INSTANCE', 'LINE', 'AREA'] }, species_id: id, specification_id: id, area_id: id, rule_id: id, group_id: id, geometry, station_m: nonnegative, quantity_method: { enum: ['INSTANCE_COUNT', 'AREA_DENSITY', 'LINE_LENGTH'] }, density_per_m2: positive, estimated_quantity: nonnegative, lock_mode: { enum: ['UNLOCKED', 'POSITION_LOCKED', 'FULLY_LOCKED'] }, logical_key: text }, ['object_id', 'object_type', 'species_id', 'area_id', 'rule_id', 'geometry', 'quantity_method', 'lock_mode', 'logical_key']),
  groups: object({ group_id: id, rule_id: id, name: text }),
  assets: object({ asset_id: id, storage_key: text, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, media_type: text, size_bytes: { type: 'integer', minimum: 0 } }),
  templates: object({ template_id: id, version: { type: 'integer', minimum: 1 }, name: text, rule_ids: { type: 'array', items: id }, applicable_conditions: text }),
};
export const collections = { species: 'species_id', specifications: 'specification_id', areas: 'area_id', alignments: 'alignment_id', rules: 'rule_id', objects: 'object_id', groups: 'group_id', assets: 'asset_id', templates: 'template_id' };
function checkGeometry(g, allowed) {
  if (!g || !allowed.includes(g.type) || !Array.isArray(g.coordinates)) throw new ContractError('不支持的几何类型');
  const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const line = p => Array.isArray(p) && p.length >= 2 && p.every(point);
  const polygon = p => Array.isArray(p) && p.length > 0 && p.every(r => line(r) && r.length >= 4 && r[0].every((v,i) => v === r.at(-1)[i]));
  const valid = { Point: point, LineString: line, MultiLineString: p => p.length > 0 && p.every(line), Polygon: polygon, MultiPolygon: p => p.length > 0 && p.every(polygon) };
  if (!valid[g.type](g.coordinates)) throw new ContractError('无效坐标或未闭合环');
}
export function validateSnapshot(snapshot) {
  validate(object({ project: schemas.project, ...Object.fromEntries(Object.keys(collections).map(k => [k, { type: 'array', maxItems: 10000 }])) }), snapshot);
  const project = snapshot.project;
  const conversion = { m: 1, mm: .001, cm: .01, ft: .3048 };
  if (conversion[project.source_unit] !== project.unit_to_meter || !/^(LOCAL_ENGINEERING:[A-Za-z0-9_-]+|EPSG:32[67](0[1-9]|[1-5][0-9]|60))$/.test(project.crs)) throw new ContractError('须声明工程平面坐标及正确单位比例');
  const maps = {};
  for (const [key, pk] of Object.entries(collections)) {
    maps[key] = new Map();
    for (const row of snapshot[key]) {
      if (key === 'rules') validateRule(row); else validate(schemas[key], row, '$.' + key);
      if (maps[key].has(row[pk])) throw new ContractError('重复实体 ID');
      maps[key].set(row[pk], row);
    }
  }
  const ref = (kind, value) => { if (!maps[kind].has(value)) throw new ContractError(`无效 ${kind} 引用`); };
  const specification = row => { if (row.specification_id) { ref('specifications', row.specification_id); if (maps.specifications.get(row.specification_id).species_id !== row.species_id) throw new ContractError('规格与物种不一致'); } };
  for (const s of snapshot.specifications) ref('species', s.species_id);
  for (const a of snapshot.areas) { checkGeometry(a.geometry, ['Polygon', 'MultiPolygon']); a.excluded_geometry.forEach(g => checkGeometry(g, ['Polygon', 'MultiPolygon'])); }
  for (const a of snapshot.alignments) checkGeometry(a.geometry, ['LineString', 'MultiLineString']);
  for (const r of snapshot.rules) {
    ref('areas', r.area_id); if (r.alignment_id) ref('alignments', r.alignment_id);
    ref('species', r.species_config.species_id); specification(r.species_config);
    if (r.rule_type === 'ALTERNATING') r.parameters.pattern.forEach(s => ref('species', s));
    if (r.rule_type === 'AREA_PARTITION') ref('alignments', r.parameters.reference_alignment_id);
  }
  for (const g of snapshot.groups) ref('rules', g.rule_id);
  const logical = new Set();
  for (const o of snapshot.objects) {
    ref('species', o.species_id); specification(o); ref('areas', o.area_id); ref('rules', o.rule_id);
    if (maps.rules.get(o.rule_id).area_id !== o.area_id) throw new ContractError('对象与规则区域不一致');
    if (o.group_id) { ref('groups', o.group_id); if (maps.groups.get(o.group_id).rule_id !== o.rule_id) throw new ContractError('对象与组规则不一致'); }
    checkGeometry(o.geometry, { INSTANCE: ['Point'], LINE: ['LineString', 'MultiLineString'], AREA: ['Polygon', 'MultiPolygon'] }[o.object_type]);
    if (o.quantity_method !== { INSTANCE: 'INSTANCE_COUNT', AREA: 'AREA_DENSITY', LINE: 'LINE_LENGTH' }[o.object_type]) throw new ContractError('对象类型与数量口径不一致');
    if (o.object_type === 'AREA' && (!o.density_per_m2 || o.estimated_quantity === undefined)) throw new ContractError('区域缺少密度与估算量');
    if (logical.has(o.logical_key)) throw new ContractError('重复逻辑标识'); logical.add(o.logical_key);
  }
  for (const t of snapshot.templates) t.rule_ids.forEach(r => ref('rules', r));
  return snapshot;
}
