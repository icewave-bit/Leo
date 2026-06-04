CREATE TABLE tax_replenishment_meta (
  balance_movement_id UUID PRIMARY KEY REFERENCES balance_movements(id) ON DELETE CASCADE,
  tutor_id            UUID NOT NULL REFERENCES tutors(id) ON DELETE CASCADE,
  tax_paid            BOOLEAN NOT NULL DEFAULT false,
  comment             TEXT NOT NULL DEFAULT '',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tax_replenishment_meta_tutor ON tax_replenishment_meta (tutor_id);
