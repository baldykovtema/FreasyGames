-- Мостик на FreasyGames: таблицы лидеров по очкам за игру и по самой длинной серии попаданий в центр.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.mostik_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 1000000),
    best_streak int not null default 0 check (best_streak between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists mostik_scores_score on public.mostik_scores (best_score desc);
create index if not exists mostik_scores_streak on public.mostik_scores (best_streak desc);

alter table public.mostik_scores enable row level security;

drop policy if exists "mostik_scores_select_all" on public.mostik_scores;
create policy "mostik_scores_select_all"
    on public.mostik_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. new_steps и new_time не хранятся, по ним проверяется, что результат возможен:
-- за колонну 1 очко и до 5 за попадание в центр, а на одну колонну уходит не меньше половины секунды.
create or replace function public.mostik_submit(new_score int, new_streak int, new_steps int, new_time int)
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
    if new_score < 0 or new_streak < 0 or new_steps < 0 or new_time < 0 or new_time > 1000000
       or new_score > new_steps * 6 or new_streak > new_steps or new_steps > new_time * 2 + 5 then
        raise exception 'Неверный результат';
    end if;
    insert into public.mostik_scores (user_id, username, best_score, best_streak)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_streak)
    on conflict (user_id) do update
        set best_score = greatest(public.mostik_scores.best_score, excluded.best_score),
            best_streak = greatest(public.mostik_scores.best_streak, excluded.best_streak),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.mostik_scores.best_score or excluded.best_streak > public.mostik_scores.best_streak then now() else public.mostik_scores.updated_at end;
end;
$$;

revoke all on function public.mostik_submit(int, int, int, int) from public;
grant execute on function public.mostik_submit(int, int, int, int) to authenticated;
