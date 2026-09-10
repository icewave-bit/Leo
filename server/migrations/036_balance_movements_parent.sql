ALTER TABLE balance_movements
  ADD COLUMN parent_movement_id UUID REFERENCES balance_movements(id) ON DELETE CASCADE;
CREATE INDEX balance_movements_parent ON balance_movements (parent_movement_id);
