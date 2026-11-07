-- Звёздная башня на FreasyGames: таблицы лидеров по этажам за игру и по самой долгой игре.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.bashnya_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_floors int not null default 0 check (best_floors between 0 and 100000),
    best_time int not null default 0 check (best_time between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists bashnya_scores_floors on public.bashnya_scores (best_floors desc);
create index if not exists bashnya_scores_time on public.bashnya_scores (best_time desc);

alter table public.bashnya_scores enable row level security;

drop policy if exists "bashnya_scores_select_all" on public.bashnya_scores;
create policy "bashnya_scores_select_all"
    on public.bashnya_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит больше всего этажей и самую долгую игру игрока.
create or replace function public.bashnya_submit(new_floors int, new_time int)
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
    if new_floors < 0 or new_floors > 100000 or new_time < 0 or new_time > 1000000 then
        raise exception 'Неверный результат';
    end if;
    -- Плита едет к башне хотя бы десятую долю секунды, поэтому больше 10 этажей в секунду не построить.
    if new_floors > new_time * 10 + 5 then
        raise exception 'Неверный результат';
    end if;
    insert into public.bashnya_scores (user_id, username, best_floors, best_time)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_floors, new_time)
    on conflict (user_id) do update
        set best_floors = greatest(public.bashnya_scores.best_floors, excluded.best_floors),
            best_time = greatest(public.bashnya_scores.best_time, excluded.best_time),
            username = excluded.username,
            updated_at = case
                when excluded.best_floors > public.bashnya_scores.best_floors or excluded.best_time > public.bashnya_scores.best_time then now()
                else public.bashnya_scores.updated_at end;
end;
$$;

revoke all on function public.bashnya_submit(int, int) from public;
grant execute on function public.bashnya_submit(int, int) to authenticated;
