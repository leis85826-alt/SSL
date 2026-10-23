/** S1 shared engineering contract. Coordinates in stored geometry are always metres.
 * source_unit/unit_to_meter describe original CAD units, not a second conversion of stored points.
 */
export type ID = string;
export type Position = [number, number];
export type Geometry = { type: 'Point'; coordinates: Position } | { type: 'LineString'; coordinates: Position[] } | { type: 'MultiLineString' | 'Polygon'; coordinates: Position[][] } | { type: 'MultiPolygon'; coordinates: Position[][][] };
export interface ProjectInput { name: string; city: string; road_type: string; crs: string; source_unit: 'm'|'mm'|'cm'|'ft'; unit_to_meter: number }
export interface Project extends ProjectInput { project_id: ID; owner_user_id: ID; current_revision_id: ID; created_at: string; updated_at: string }
export interface PlantSpecies { species_id: ID; chinese_name: string; scientific_name: string; category: string; evergreen_type: string; usage_tags: string[]; suitable_regions: string[]; symbol_id: ID }
export interface PlantSpecification { specification_id: ID; species_id: ID; trunk_diameter_cm?: number; ground_diameter_cm?: number; height_m?: number; crown_diameter_m?: number; branch_height_m?: number; default_density?: number }
export interface PlantingArea { area_id: ID; name: string; area_type: string; geometry: Geometry; excluded_geometry: Geometry[]; usable_area_m2: number; source_layer: string; locked: boolean }
export interface PlantingAlignment { alignment_id: ID; geometry: Geometry; direction: 'FORWARD'|'REVERSE'; length_m: number; geometry_version: number }
export type ConflictStrategy = 'REPORT'|'SKIP'|'REJECT'|'AUTO_ADJUST';
export interface Constraints { min_center_distance_m?: number; boundary_offset_m?: number; max_shift_m?: number; step_m?: number; max_iterations?: number; source_references?: ID[] }
export interface Offsets { start_offset_m?: number; end_offset_m?: number; lateral_offset_m?: number }
export interface RuleBase { rule_id: ID; area_id: ID; alignment_id?: ID; species_config: { species_id: ID; specification_id?: ID }; constraints: Constraints; conflict_strategy: ConflictStrategy; algorithm_version: string }
export type PlantingRule = RuleBase & (
 {rule_type:'EQUAL_SPACING'; parameters: Offsets & {mode:'FIXED_SPACING'|'FIXED_COUNT';spacing_m?:number;count?:number;alignment?:'START'|'CENTER'|'BOTH_ENDS'}} |
 {rule_type:'GROUP_PLANTING';parameters:Offsets & {group_size:number;intra_group_spacing_m:number;group_end_center_gap_m:number;start_offset_m:number;end_offset_m:number;tail_policy?:'FULL_ONLY'|'CENTER'|'ALLOW_PARTIAL'|'REQUIRE_GROUP_COUNT';group_count?:number}} |
 {rule_type:'ALTERNATING';parameters:Offsets & {spacing_m:number;pattern:ID[]}} |
 {rule_type:'HEDGE_ROWS';parameters:Offsets & {spacing_m:number;row_count:number;row_spacing_m:number;side_offset_m?:number;layout:'GRID'|'STAGGERED';quantity_method?:'INSTANCE_COUNT'}} |
 {rule_type:'GROUNDCOVER_AREA';parameters:{density_per_m2:number;rounding:'CEIL_PER_AREA'|'CEIL_AGGREGATE';quantity_method:'AREA_DENSITY'}} |
 {rule_type:'AREA_PARTITION';parameters:{widths_m:[number,number,number];reference_alignment_id:ID}}
);
export interface PlantObject { object_id: ID; object_type:'INSTANCE'|'LINE'|'AREA'; species_id:ID; specification_id?:ID; area_id:ID; rule_id:ID; group_id?:ID; geometry:Geometry; station_m?:number; quantity_method:'INSTANCE_COUNT'|'AREA_DENSITY'|'LINE_LENGTH'; density_per_m2?:number; estimated_quantity?:number; lock_mode:'UNLOCKED'|'POSITION_LOCKED'|'FULLY_LOCKED'; logical_key:string }
export interface PlantGroup {group_id:ID;rule_id:ID;name:string}
export interface AssetReference {asset_id:ID;storage_key:string;sha256:string;media_type:string;size_bytes:number}
export interface RuleTemplate {template_id:ID;version:number;name:string;rule_ids:ID[];applicable_conditions:string}
export interface Snapshot {project:ProjectInput;species:PlantSpecies[];specifications:PlantSpecification[];areas:PlantingArea[];alignments:PlantingAlignment[];rules:PlantingRule[];objects:PlantObject[];groups:PlantGroup[];assets:AssetReference[];templates:RuleTemplate[]}
export interface DesignRevision {revision_id:ID;project_id:ID;revision_number:number;parent_revision_id:ID|null;status:'SAVED';created_by:ID;created_at:string;change_summary:string;algorithm_version:string;checksum:string}
export interface ProjectData {project:Project;revision:DesignRevision;snapshot:Snapshot}
export type ApiResponse<T> = {success:true;data:T;request_id:ID} | {success:false;error:{code:string;message:string};request_id:ID};
