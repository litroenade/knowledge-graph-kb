export const GRAPH_NODE_COLORS: Record<string, number> = {
  source: 0xd17d21,
  workbook: 0xa85710,
  paragraph: 0x1a8d80,
  worksheet: 0x5a8f29,
  record: 0x3f6bc4,
  entity: 0x2b6ea4,
};

export const GRAPH_EDGE_COLORS: Record<string, number> = {
  provenance: 0xc88428,
  contains: 0xc8a66c,
  contains_sheet: 0x9a6f2f,
  contains_record: 0x5f8b4c,
  mentions: 0x3c7ca6,
  relation: 0x268b71,
  manual: 0xce5378,
};

export const GRAPH_EDGE_RENDER_COLORS = {
  provenance: 0xb07b24,
  structure: 0xa88342,
  evidence: 0x3c7ca6,
  relation: 0x1f7a64,
  manual: 0xc15a78,
};

export const GRAPH_LAYOUT_TOKENS = {
  charge_base: -56,
  charge_scale: 10,
  semantic_link_distance: 56,
  manual_link_distance: 62,
  structure_link_distance: 48,
  evidence_link_distance: 60,
  component_gap: 96,
  isolated_row_offset: 112,
};

export const GRAPH_SIDECAR_TOKENS = {
  fill_light: 0xf4e5cf,
  fill_dark: 0x3c2b18,
  stroke_light: 0xd3a361,
  stroke_dark: 0xe2b97d,
  title_light: 0x8d5a12,
  title_dark: 0xf4d3a0,
};
