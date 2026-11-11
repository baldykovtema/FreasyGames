-- Слияние звёзд на FreasyGames: таблицы лидеров по очкам и по самой большой звезде.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.sliyanie_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 10000000),
    best_level int not null default 0 check (best_level between 0 and 11),
    updated_at timestamptz not null default now()
);

create index if not exists sliyanie_scores_distance on public.sliyanie_scores (best_score desc);
create index if not exists sliyanie_scores_hooks on public.sliyanie_scores (best_level desc);

alter table public.sliyanie_scores enable row level security;

drop policy if exists "sliyanie_scores_select_all" on public.sliyanie_scores;
create policy "sliyanie_scores_select_all"
    on public.sliyanie_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит лучшие значения игрока.
create or replace function public.sliyanie_submit(new_score int, new_level int)
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
    if new_score is null or new_level is null or new_score < 0 or new_score > 10000000 or new_level < 1 or new_level > 11 then
        raise exception 'Неверный результат';
    end if;
    -- Самая большая звезда даёт очки сама по себе: без очков до неё не дойти.
    if new_level > 1 and new_score < new_level - 1 then
        raise exception 'Неверный результат';
    end if;
    insert into public.sliyanie_scores (user_id, username, best_score, best_level)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_level)
    on conflict (user_id) do update
        set best_score = greatest(public.sliyanie_scores.best_score, excluded.best_score),
            best_level = greatest(public.sliyanie_scores.best_level, excluded.best_level),
            username = excluded.username,
            updated_at = case
                when excluded.best_score > public.sliyanie_scores.best_score or excluded.best_level > public.sliyanie_scores.best_level then now()
                else public.sliyanie_scores.updated_at end;
end;
$$;

revoke all on function public.sliyanie_submit(int, int) from public, anon;
grant execute on function public.sliyanie_submit(int, int) to authenticated;
