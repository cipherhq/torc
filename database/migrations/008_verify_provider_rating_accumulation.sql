-- Verification queries for provider rating accumulation.
-- Run these in Supabase SQL editor after submitting one or more test ratings.
-- Replace the provider UUID below.

-- 1) Set provider id once
WITH input AS (
  SELECT '00000000-0000-0000-0000-000000000000'::uuid AS provider_id
),
agg AS (
  SELECT
    j.provider_id,
    COUNT(*) FILTER (WHERE j.status = 'completed' AND j.rating IS NOT NULL) AS rated_completed_jobs,
    ROUND(
      AVG(j.rating) FILTER (WHERE j.status = 'completed' AND j.rating IS NOT NULL),
      2
    )::numeric AS computed_avg_rating
  FROM public.jobs j
  JOIN input i ON i.provider_id = j.provider_id
  GROUP BY j.provider_id
)
SELECT
  i.provider_id,
  COALESCE(a.rated_completed_jobs, 0) AS rated_completed_jobs,
  COALESCE(a.computed_avg_rating, 0) AS computed_avg_rating,
  pp.rating AS provider_profiles_rating,
  pp.total_jobs AS provider_profiles_total_jobs,
  p.rating AS profiles_rating,
  p.total_jobs AS profiles_total_jobs,
  CASE
    WHEN a.provider_id IS NULL THEN 'NO_RATINGS_YET_OR_PROVIDER_NOT_FOUND'
    WHEN COALESCE(a.computed_avg_rating, 0) = COALESCE(pp.rating, 0)
         AND COALESCE(a.computed_avg_rating, 0) = COALESCE(p.rating, 0)
      THEN 'OK'
    ELSE 'MISMATCH'
  END AS rating_check
FROM input i
LEFT JOIN agg a ON a.provider_id = i.provider_id
LEFT JOIN public.provider_profiles pp ON pp.id = i.provider_id
LEFT JOIN public.profiles p ON p.id = i.provider_id;

-- 2) Optional: inspect latest rated jobs for that provider
SELECT
  id,
  status,
  rating,
  review,
  reviewed_at,
  completed_at,
  updated_at
FROM public.jobs
WHERE provider_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND rating IS NOT NULL
ORDER BY reviewed_at DESC NULLS LAST, updated_at DESC
LIMIT 20;
