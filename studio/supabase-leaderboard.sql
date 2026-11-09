-- FreasyCode Studio на FreasyGames: таблица лидеров авторов, считается из опубликованных проектов.
-- Нужна таблица freasycode_projects из studio/supabase.sql. Скрипт можно запускать повторно.

create or replace view public.freasycode_scores
with (security_invoker = true) as
select
    author_id as user_id,
    max(author_name) as username,
    sum(plays)::int as total_plays,
    count(*)::int as projects,
    max(updated_at) as updated_at
from public.freasycode_projects
group by author_id;

grant select on public.freasycode_scores to anon, authenticated;
