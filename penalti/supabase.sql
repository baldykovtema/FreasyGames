-- Пенальти на FreasyGames: таблицы лидеров. Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.penalti_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 1000000),
    best_goals int not null default 0 check (best_goals between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists penalti_scores_score on public.penalti_scores (best_score desc);
create index if not exists penalti_scores_goals on public.penalti_scores (best_goals desc);

alter table public.penalti_scores enable row level security;

drop policy if exists "penalti_scores_select_all" on public.penalti_scores;
create policy "penalti_scores_select_all"
    on public.penalti_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Гол даёт от 1 до 9 очков (девятка в мишень с серией).
create or replace function public.penalti_submit(new_score int, new_goals int)
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
    if new_score < 0 or new_score > 1000000 or new_goals < 0 or new_goals > 100000 or new_score < new_goals or new_score > new_goals * 9 then
        raise exception 'Неверный результат';
    end if;
    insert into public.penalti_scores (user_id, username, best_score, best_goals)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_goals)
    on conflict (user_id) do update
        set best_score = greatest(public.penalti_scores.best_score, excluded.best_score),
            best_goals = greatest(public.penalti_scores.best_goals, excluded.best_goals),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.penalti_scores.best_score or excluded.best_goals > public.penalti_scores.best_goals then now() else public.penalti_scores.updated_at end;
end;
$$;

revoke all on function public.penalti_submit(int, int) from public;
grant execute on function public.penalti_submit(int, int) to authenticated;
