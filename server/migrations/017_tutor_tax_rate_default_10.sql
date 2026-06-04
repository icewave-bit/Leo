ALTER TABLE tutors ALTER COLUMN tax_rate_percent SET DEFAULT 10;
UPDATE tutors SET tax_rate_percent = 10 WHERE tax_rate_percent = 0;
