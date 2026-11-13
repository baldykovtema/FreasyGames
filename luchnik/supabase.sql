-- Лучник на FreasyGames: таблицы лидеров по очкам и по попаданиям в яблочко за одну игру.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.luchnik_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 10000000),
    best_bulls int not null default 0 check (best_bulls between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists luchnik_scores_score on public.luchnik_scores (best_score desc);
create index if not exists luchnik_scores_bulls on public.luchnik_scores (best_bulls desc);

alter table public.luchnik_scores enable row level security;

drop policy if exists "luchnik_scores_select_all" on public.luchnik_scores;
create policy "luchnik_scores_select_all"
    on public.luchnik_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: результат хранится лучший из всех.
create or replace function public.luchnik_submit(new_score int, new_bulls int)
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
    if new_score < 0 or new_bulls < 0 or new_bulls > 100000 or new_score > 10000000 or new_score < new_bulls * 10 then
        raise exception 'Неверный результат';
    end if;
    insert into public.luchnik_scores (user_id, username, best_score, best_bulls)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_bulls)
    on conflict (user_id) do update
        set best_score = greatest(public.luchnik_scores.best_score, excluded.best_score),
            best_bulls = greatest(public.luchnik_scores.best_bulls, excluded.best_bulls),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.luchnik_scores.best_score or excluded.best_bulls > public.luchnik_scores.best_bulls then now() else public.luchnik_scores.updated_at end;
end;
$$;

revoke all on function public.luchnik_submit(int, int) from public;
grant execute on function public.luchnik_submit(int, int) to authenticated;
