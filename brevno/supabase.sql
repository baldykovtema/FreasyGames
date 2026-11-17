-- Бревно на FreasyGames: таблицы лидеров по очкам за игру и по самому дальнему бревну.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.brevno_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 1000000),
    best_level int not null default 0 check (best_level between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists brevno_scores_score on public.brevno_scores (best_score desc);
create index if not exists brevno_scores_level on public.brevno_scores (best_level desc);

alter table public.brevno_scores enable row level security;

drop policy if exists "brevno_scores_select_all" on public.brevno_scores;
create policy "brevno_scores_select_all"
    on public.brevno_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. new_time не хранится, по нему проверяется, что результат возможен:
-- за бревно не больше 10 ножей, 2 яблок по 3 очка и 15 за дуб, а на бревно уходит не меньше секунды.
create or replace function public.brevno_submit(new_score int, new_level int, new_time int)
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
    if new_score < 0 or new_level < 1 or new_time < 0 or new_time > 1000000
       or new_score > new_level * 40 or new_level > new_time + 2 then
        raise exception 'Неверный результат';
    end if;
    insert into public.brevno_scores (user_id, username, best_score, best_level)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_level)
    on conflict (user_id) do update
        set best_score = greatest(public.brevno_scores.best_score, excluded.best_score),
            best_level = greatest(public.brevno_scores.best_level, excluded.best_level),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.brevno_scores.best_score or excluded.best_level > public.brevno_scores.best_level then now() else public.brevno_scores.updated_at end;
end;
$$;

revoke all on function public.brevno_submit(int, int, int) from public;
grant execute on function public.brevno_submit(int, int, int) to authenticated;
