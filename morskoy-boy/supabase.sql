-- Морской бой на FreasyGames: таблицы лидеров по лучшей серии побед подряд и по всем победам.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.morboi_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_streak int not null default 0 check (best_streak between 0 and 100000),
    best_wins int not null default 0 check (best_wins between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists morboi_scores_streak on public.morboi_scores (best_streak desc);
create index if not exists morboi_scores_wins on public.morboi_scores (best_wins desc);

alter table public.morboi_scores enable row level security;

drop policy if exists "morboi_scores_select_all" on public.morboi_scores;
create policy "morboi_scores_select_all"
    on public.morboi_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Победы копятся на устройстве; проверяем, что серия не больше всех побед.
create or replace function public.morboi_submit(new_streak int, new_wins int)
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
    if new_streak < 0 or new_wins < 1 or new_wins > 1000000 or new_streak > new_wins then
        raise exception 'Неверный результат';
    end if;
    insert into public.morboi_scores (user_id, username, best_streak, best_wins)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_streak, new_wins)
    on conflict (user_id) do update
        set best_streak = greatest(public.morboi_scores.best_streak, excluded.best_streak),
            best_wins = greatest(public.morboi_scores.best_wins, excluded.best_wins),
            username = excluded.username,
            updated_at = case when excluded.best_streak > public.morboi_scores.best_streak or excluded.best_wins > public.morboi_scores.best_wins then now() else public.morboi_scores.updated_at end;
end;
$$;

revoke all on function public.morboi_submit(int, int) from public;
grant execute on function public.morboi_submit(int, int) to authenticated;
