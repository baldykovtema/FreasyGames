-- Стенолаз на FreasyGames: таблицы лидеров по высоте и по монетам за один подъём.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.stenolaz_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_metres int not null default 0 check (best_metres between 0 and 10000000),
    best_coins int not null default 0 check (best_coins between 0 and 10000000),
    updated_at timestamptz not null default now()
);

create index if not exists stenolaz_scores_metres on public.stenolaz_scores (best_metres desc);
create index if not exists stenolaz_scores_coins on public.stenolaz_scores (best_coins desc);

alter table public.stenolaz_scores enable row level security;

drop policy if exists "stenolaz_scores_select_all" on public.stenolaz_scores;
create policy "stenolaz_scores_select_all"
    on public.stenolaz_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Ниндзя лезет не быстрее 360 единиц (9 м) в секунду,
-- а монет на пути не больше одной на метр.
create or replace function public.stenolaz_submit(new_metres int, new_coins int, new_time int)
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
    if new_metres < 0 or new_coins < 0 or new_time < 0 or new_time > 1000000
       or new_metres > new_time * 9 + 5 or new_coins > new_metres + 10 then
        raise exception 'Неверный результат';
    end if;
    insert into public.stenolaz_scores (user_id, username, best_metres, best_coins)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_metres, new_coins)
    on conflict (user_id) do update
        set best_metres = greatest(public.stenolaz_scores.best_metres, excluded.best_metres),
            best_coins = greatest(public.stenolaz_scores.best_coins, excluded.best_coins),
            username = excluded.username,
            updated_at = case when excluded.best_metres > public.stenolaz_scores.best_metres or excluded.best_coins > public.stenolaz_scores.best_coins then now() else public.stenolaz_scores.updated_at end;
end;
$$;

revoke all on function public.stenolaz_submit(int, int, int) from public;
grant execute on function public.stenolaz_submit(int, int, int) to authenticated;
