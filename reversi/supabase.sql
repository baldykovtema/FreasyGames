-- Реверси на FreasyGames: таблицы лидеров. Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.reversi_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_points int not null default 0 check (best_points between 0 and 300000),
    best_streak int not null default 0 check (best_streak between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists reversi_scores_points on public.reversi_scores (best_points desc);
create index if not exists reversi_scores_streak on public.reversi_scores (best_streak desc);

alter table public.reversi_scores enable row level security;

drop policy if exists "reversi_scores_select_all" on public.reversi_scores;
create policy "reversi_scores_select_all"
    on public.reversi_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. За каждую победу 1–3 очка, поэтому серия побед не больше очков.
create or replace function public.reversi_submit(new_points int, new_streak int)
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
    if new_points < 0 or new_points > 300000 or new_streak < 0 or new_streak > 100000 or new_streak > new_points then
        raise exception 'Неверный результат';
    end if;
    insert into public.reversi_scores (user_id, username, best_points, best_streak)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_points, new_streak)
    on conflict (user_id) do update
        set best_points = greatest(public.reversi_scores.best_points, excluded.best_points),
            best_streak = greatest(public.reversi_scores.best_streak, excluded.best_streak),
            username = excluded.username,
            updated_at = case when excluded.best_points > public.reversi_scores.best_points or excluded.best_streak > public.reversi_scores.best_streak then now() else public.reversi_scores.updated_at end;
end;
$$;

revoke all on function public.reversi_submit(int, int) from public;
grant execute on function public.reversi_submit(int, int) to authenticated;
