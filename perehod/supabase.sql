-- Переход на FreasyGames: таблицы лидеров по шагам и по яблокам за одну игру.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.perehod_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 1000000),
    best_apples int not null default 0 check (best_apples between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists perehod_scores_score on public.perehod_scores (best_score desc);
create index if not exists perehod_scores_apples on public.perehod_scores (best_apples desc);

alter table public.perehod_scores enable row level security;

drop policy if exists "perehod_scores_select_all" on public.perehod_scores;
create policy "perehod_scores_select_all"
    on public.perehod_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Яблоко лежит не чаще чем на каждой травяной полосе,
-- поэтому яблок за игру не больше, чем шагов.
create or replace function public.perehod_submit(new_score int, new_apples int)
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
    if new_score < 0 or new_score > 1000000 or new_apples < 0 or new_apples > new_score then
        raise exception 'Неверный результат';
    end if;
    insert into public.perehod_scores (user_id, username, best_score, best_apples)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_apples)
    on conflict (user_id) do update
        set best_score = greatest(public.perehod_scores.best_score, excluded.best_score),
            best_apples = greatest(public.perehod_scores.best_apples, excluded.best_apples),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.perehod_scores.best_score or excluded.best_apples > public.perehod_scores.best_apples then now() else public.perehod_scores.updated_at end;
end;
$$;

revoke all on function public.perehod_submit(int, int) from public;
grant execute on function public.perehod_submit(int, int) to authenticated;
