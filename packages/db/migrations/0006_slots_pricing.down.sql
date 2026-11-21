DROP TABLE IF EXISTS pricing_rules;
DROP TABLE IF EXISTS slot_blocks;
ALTER TABLE turf_slots DROP CONSTRAINT IF EXISTS turf_slots_no_overlap;
DROP TABLE IF EXISTS turf_slots;
DROP TABLE IF EXISTS slot_templates;
