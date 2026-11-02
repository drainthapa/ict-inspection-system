-- Migration 002: fields needed by the inspection and maintenance workflows

-- Inspectors estimate replacement cost when recommending a replacement
ALTER TABLE inspections
  ADD COLUMN estimated_replacement_cost NUMERIC(12,2) CHECK (estimated_replacement_cost >= 0);

-- Speeds up "latest inspection per device" lookups
CREATE INDEX inspections_equipment_submitted_idx
  ON inspections (equipment_id, inspection_date DESC, id DESC) WHERE status = 'submitted';

-- One open replacement request per device at a time
CREATE UNIQUE INDEX replacement_requests_one_open_uq
  ON replacement_requests (equipment_id) WHERE status IN ('pending', 'approved', 'purchased');
