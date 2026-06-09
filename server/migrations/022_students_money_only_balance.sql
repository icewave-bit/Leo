-- Wallet balances are always money; convert legacy lesson packs by rate.
UPDATE students
SET
  prepaid = ROUND((prepaid * rate)::numeric, 2),
  debt = ROUND((debt * rate)::numeric, 2),
  balance_kind = 'money'
WHERE balance_kind = 'lessons'
  AND rate IS NOT NULL
  AND rate > 0;

UPDATE students
SET balance_kind = 'money'
WHERE balance_kind = 'lessons';

UPDATE tutors SET default_replenish_balance_kind = 'money';
