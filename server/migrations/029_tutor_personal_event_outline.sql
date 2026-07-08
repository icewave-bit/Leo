ALTER TABLE tutors
  ADD COLUMN personal_event_outline TEXT NOT NULL DEFAULT 'tab';

ALTER TABLE tutors
  ADD CONSTRAINT tutors_personal_event_outline_allowed
    CHECK (personal_event_outline IN ('tab', 'frame', 'dashed'));
