-- Парковка на FreasyGames: таблицы лидеров. Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.parkovka_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_level int not null default 0 check (best_level between 0 and 100000),
    best_stars int not null default 0 check (best_stars between 0 and 300000),
    updated_at timestamptz not null default now()
);

create index if not exists parkovka_scores_level on public.parkovka_scores (best_level desc);
create index if not exists parkovka_scores_stars on public.parkovka_scores (best_stars desc);

alter table public.parkovka_scores enable row level security;

drop policy if exists "parkovka_scores_select_all" on public.parkovka_scores;
create policy "parkovka_scores_select_all"
    on public.parkovka_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Каждый уровень даёт не больше трёх звёзд.
create or replace function public.parkovka_submit(new_level int, new_stars int)
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
    if new_level < 0 or new_level > 100000 or new_stars < 0 or new_stars > new_level * 3 then
        raise exception 'Неверный результат';
    end if;
    insert into public.parkovka_scores (user_id, username, best_level, best_stars)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_level, new_stars)
    on conflict (user_id) do update
        set best_level = greatest(public.parkovka_scores.best_level, excluded.best_level),
            best_stars = greatest(public.parkovka_scores.best_stars, excluded.best_stars),
            username = excluded.username,
            updated_at = case when excluded.best_level > public.parkovka_scores.best_level or excluded.best_stars > public.parkovka_scores.best_stars then now() else public.parkovka_scores.updated_at end;
end;
$$;

revoke all on function public.parkovka_submit(int, int) from public;
grant execute on function public.parkovka_submit(int, int) to authenticated;
