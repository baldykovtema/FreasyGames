-- Молния на FreasyGames: таблицы лидеров по очкам за игру и по самой быстрой средней реакции.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.molniya_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 10000000),
    best_reaction int check (best_reaction between 120 and 3000),
    updated_at timestamptz not null default now()
);

create index if not exists molniya_scores_score on public.molniya_scores (best_score desc);
create index if not exists molniya_scores_reaction on public.molniya_scores (best_reaction) where best_reaction is not null;

alter table public.molniya_scores enable row level security;

drop policy if exists "molniya_scores_select_all" on public.molniya_scores;
create policy "molniya_scores_select_all"
    on public.molniya_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит больше всего очков и самую быструю реакцию игрока.
-- new_hits и new_time не хранятся, по ним проверяется, что такой результат вообще возможен.
create or replace function public.molniya_submit(new_score int, new_reaction int, new_hits int, new_time int)
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
    if new_score < 0 or new_hits < 0 or new_time < 0 or new_time > 100000 then
        raise exception 'Неверный результат';
    end if;
    -- Мишени появляются не чаще пяти в секунду, а одно попадание даёт не больше 40 очков.
    if new_hits > new_time * 5 + 5 or new_score > new_hits * 40 then
        raise exception 'Неверный результат';
    end if;
    -- Средняя реакция засчитывается от 10 попаданий; быстрее 120 мс в среднем человек не успевает.
    if new_reaction is not null and (new_hits < 10 or new_reaction < 120 or new_reaction > 3000) then
        new_reaction := null;
    end if;
    insert into public.molniya_scores (user_id, username, best_score, best_reaction)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_reaction)
    on conflict (user_id) do update
        set best_score = greatest(public.molniya_scores.best_score, excluded.best_score),
            best_reaction = case
                when excluded.best_reaction is null then public.molniya_scores.best_reaction
                when public.molniya_scores.best_reaction is null then excluded.best_reaction
                else least(public.molniya_scores.best_reaction, excluded.best_reaction) end,
            username = excluded.username,
            updated_at = case
                when excluded.best_score > public.molniya_scores.best_score
                    or coalesce(excluded.best_reaction < public.molniya_scores.best_reaction, public.molniya_scores.best_reaction is null and excluded.best_reaction is not null) then now()
                else public.molniya_scores.updated_at end;
end;
$$;

revoke all on function public.molniya_submit(int, int, int, int) from public;
grant execute on function public.molniya_submit(int, int, int, int) to authenticated;
