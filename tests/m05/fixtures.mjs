export function fixture() {
  return {
    project: { name: '隔离测试工程', city: '杭州', road_type: '城市道路', crs: 'LOCAL_ENGINEERING:TEST', source_unit: 'm', unit_to_meter: 1 },
    species: [{ species_id: 'sp1', chinese_name: '测试树种', scientific_name: 'Test species', category: 'TREE', evergreen_type: 'DECIDUOUS', usage_tags: ['测试'], suitable_regions: ['待校核'], symbol_id: 'symbol1' }],
    specifications: [{ specification_id: 'spec1', species_id: 'sp1', height_m: 3 }],
    areas: [{ area_id: 'area1', name: '绿带', area_type: 'SIDE', geometry: { type: 'Polygon', coordinates: [[[0,0],[100,0],[100,4],[0,4],[0,0]]] }, excluded_geometry: [], usable_area_m2: 400, source_layer: 'TEST', locked: false }],
    alignments: [{ alignment_id: 'line1', geometry: { type: 'LineString', coordinates: [[0,2],[100,2]] }, direction: 'FORWARD', length_m: 100, geometry_version: 1 }],
    rules: [{ rule_id: 'rule1', area_id: 'area1', alignment_id: 'line1', rule_type: 'GROUP_PLANTING', species_config: { species_id: 'sp1', specification_id: 'spec1' }, parameters: { group_size: 5, intra_group_spacing_m: 4, group_end_center_gap_m: 12, start_offset_m: 4, end_offset_m: 4 }, constraints: {}, conflict_strategy: 'REPORT', algorithm_version: 'test-v1' }],
    objects: [{ object_id: 'obj1', object_type: 'INSTANCE', species_id: 'sp1', specification_id: 'spec1', area_id: 'area1', rule_id: 'rule1', group_id: 'group1', geometry: { type: 'Point', coordinates: [4,2] }, station_m: 4, quantity_method: 'INSTANCE_COUNT', lock_mode: 'POSITION_LOCKED', logical_key: 'rule1:0:0' }],
    groups: [{ group_id: 'group1', rule_id: 'rule1', name: '第一组' }],
    assets: [{ asset_id: 'asset1', storage_key: 'test/asset1', sha256: 'a'.repeat(64), media_type: 'application/dxf', size_bytes: 0 }],
    templates: [{ template_id: 'template1', version: 1, name: '测试模板', rule_ids: ['rule1'], applicable_conditions: '测试，不作为适生性结论' }],
  };
}
