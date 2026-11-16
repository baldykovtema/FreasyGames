-- Грузчик на FreasyGames: таблицы лидеров по сумме очков за уровни и по числу пройденных уровней.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.gruzchik_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 100000),
    best_levels int not null default 0 check (best_levels between 0 and 1000),
    updated_at timestamptz not null default now()
);

create index if not exists gruzchik_scores_score on public.gruzchik_scores (best_score desc);
create index if not exists gruzchik_scores_levels on public.gruzchik_scores (best_levels desc);

alter table public.gruzchik_scores enable row level security;

drop policy if exists "gruzchik_scores_select_all" on public.gruzchik_scores;
create policy "gruzchik_scores_select_all"
    on public.gruzchik_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Уровней 20 (с запасом на будущие — до 100),
-- за уровень не больше 300 очков.
create or replace function public.gruzchik_submit(new_score int, new_levels int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null then
        raise exception 'Нужно войти в аккаунт';
    end if;
    if new_score < 0 or new_levels < 0 or new_levels > 100 or new_score > new_levels * 300 then
        raise exception 'Неверный результат';
    end if;
    insert into public.gruzchik_scores (user_id, username, best_score, best_levels)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_levels)
    on conflict (user_id) do update
        set best_score = greatest(public.gruzchik_scores.best_score, excluded.best_score),
            best_levels = greatest(public.gruzchik_scores.best_levels, excluded.best_levels),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.gruzchik_scores.best_score or excluded.best_levels > public.gruzchik_scores.best_levels then now() else public.gruzchik_scores.updated_at end;
end;
$$;

revoke all on function public.gruzchik_submit(int, int) from public;
grant execute on function public.gruzchik_submit(int, int) to authenticated;
