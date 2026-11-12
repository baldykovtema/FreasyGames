-- Лабиринт на FreasyGames: таблицы лидеров по пройденным уровням и по собранным звёздам за одну игру.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.labirint_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_levels int not null default 0 check (best_levels between 0 and 10000),
    best_stars int not null default 0 check (best_stars between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists labirint_scores_levels on public.labirint_scores (best_levels desc);
create index if not exists labirint_scores_stars on public.labirint_scores (best_stars desc);

alter table public.labirint_scores enable row level security;

drop policy if exists "labirint_scores_select_all" on public.labirint_scores;
create policy "labirint_scores_select_all"
    on public.labirint_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. На уровень нужна хотя бы секунда (выход далеко от старта),
-- а звёзд на уровне не больше семи.
create or replace function public.labirint_submit(new_levels int, new_stars int, new_time int)
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
    if new_levels < 0 or new_stars < 0 or new_time < 0 or new_time > 100000
        or new_levels > new_time + 1 or new_stars > (new_levels + 1) * 7 then
        raise exception 'Неверный результат';
    end if;
    insert into public.labirint_scores (user_id, username, best_levels, best_stars)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_levels, new_stars)
    on conflict (user_id) do update
        set best_levels = greatest(public.labirint_scores.best_levels, excluded.best_levels),
            best_stars = greatest(public.labirint_scores.best_stars, excluded.best_stars),
            username = excluded.username,
            updated_at = case when excluded.best_levels > public.labirint_scores.best_levels or excluded.best_stars > public.labirint_scores.best_stars then now() else public.labirint_scores.updated_at end;
end;
$$;

revoke all on function public.labirint_submit(int, int, int) from public;
grant execute on function public.labirint_submit(int, int, int) to authenticated;
