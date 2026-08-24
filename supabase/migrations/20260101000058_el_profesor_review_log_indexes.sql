-- Perf audit 2026-08-24 ("continue l'amélioration, avec l'optimisation de
-- el profesor") — el_profesor_review_log only had (user_id, flashcard_id),
-- which doesn't support the range/order-by/global-aggregate queries several
-- dashboard stats run against it, and this table grows with every single
-- flashcard answer across every user, so it's the one most worth indexing
-- properly early rather than after it becomes a real problem at scale.

-- getReviewActivitySummary (streak + 12-week heatmap): .eq(user_id).gte(reviewed_at)
create index el_profesor_review_log_user_reviewed_idx on public.el_profesor_review_log (user_id, reviewed_at);

-- getMostDifficultFlashcardsGlobal (admin): whole-table .eq(rating, 'again') with no per-user filter
create index el_profesor_review_log_rating_idx on public.el_profesor_review_log (rating);

-- getStaleChaptersForAdmin: .in(flashcard_id, [...]).order(reviewed_at desc).limit(1)
create index el_profesor_review_log_flashcard_reviewed_idx on public.el_profesor_review_log (flashcard_id, reviewed_at desc);
