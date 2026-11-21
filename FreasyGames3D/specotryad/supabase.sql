-- Спецотряд на FreasyGames 3D: таблицы лидеров по убийствам за матч и по выигранным матчам.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.specotryad_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_kills int not null default 0 check (best_kills between 0 and 1000),
    best_wins int not null default 0 check (best_wins between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists specotryad_scores_kills on public.specotryad_scores (best_kills desc);
create index if not exists specotryad_scores_wins on public.specotryad_scores (best_wins desc);

alter table public.specotryad_scores enable row level security;

drop policy if exists "specotryad_scores_select_all" on public.specotryad_scores;
create policy "specotryad_scores_select_all"
    on public.specotryad_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. new_time не хранится, по нему проверяется, что результат возможен:
-- не больше одного убийства в секунду матча (плюс запас), матч с ботами — не больше 60 убийств.
create or replace function public.specotryad_submit(new_kills int, new_wins int, new_time int)
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
    if new_kills < 0 or new_kills > 1000 or new_wins < 0 or new_wins > 1000000 or new_time < 0 or new_time > 1000000
       or new_kills > new_time + 10 then
        raise exception 'Неверный результат';
    end if;
    insert into public.specotryad_scores (user_id, username, best_kills, best_wins)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_kills, new_wins)
    on conflict (user_id) do update
        set best_kills = greatest(public.specotryad_scores.best_kills, excluded.best_kills),
            best_wins = greatest(public.specotryad_scores.best_wins, excluded.best_wins),
            username = excluded.username,
            updated_at = case when excluded.best_kills > public.specotryad_scores.best_kills or excluded.best_wins > public.specotryad_scores.best_wins then now() else public.specotryad_scores.updated_at end;
end;
$$;

revoke all on function public.specotryad_submit(int, int, int) from public;
grant execute on function public.specotryad_submit(int, int, int) to authenticated;
