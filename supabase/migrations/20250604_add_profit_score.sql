-- Add profit_score column to users table
-- แต้มเซียน: สะสมกำไรจากการทายถูกเท่านั้น ไม่มีวันลด

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS profit_score integer not null default 0;

-- Update existing users: calculate profit_score from their won entries
UPDATE public.users u
SET profit_score = COALESCE((
  SELECT SUM(payout_amount - amount)
  FROM public.prediction_entries pe
  WHERE pe.user_id = u.id AND pe.status = 'won'
), 0)
WHERE profit_score = 0;
