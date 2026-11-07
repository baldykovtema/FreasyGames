-- Облака на FreasyGames: таблицы лидеров по высоте и по звёздам за одну игру.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.oblaka_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_height int not null default 0 check (best_height between 0 and 1000000),
    best_stars int not null default 0 check (best_stars between 0 and 1000000),
    updated_at timestamptz not null default now()
);

create index if not exists oblaka_scores_height on public.oblaka_scores (best_height desc);
create index if not exists oblaka_scores_stars on public.oblaka_scores (best_stars desc);

alter table public.oblaka_scores enable row level security;

drop policy if exists "oblaka_scores_select_all" on public.oblaka_scores;
create policy "oblaka_scores_select_all"
    on public.oblaka_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она хранит самую большую высоту и больше всего звёзд игрока.
-- new_time не хранится, по нему проверяется, что такой результат вообще возможен.
create or replace function public.oblaka_submit(new_height int, new_stars int, new_time int)
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
    if new_height < 0 or new_stars < 0 or new_time < 0 or new_time > 100000 then
        raise exception 'Неверный результат';
    end if;
    -- Даже с пружинками подъём не быстрее 20 м в секунду, а звёзды висят не чаще раза в 5 м.
    if new_height > new_time * 20 + 20 or new_stars > new_height / 5 + 5 then
        raise exception 'Неверный результат';
    end if;
    insert into public.oblaka_scores (user_id, username, best_height, best_stars)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_height, new_stars)
    on conflict (user_id) do update
        set best_height = greatest(public.oblaka_scores.best_height, excluded.best_height),
            best_stars = greatest(public.oblaka_scores.best_stars, excluded.best_stars),
            username = excluded.username,
            updated_at = case
                when excluded.best_height > public.oblaka_scores.best_height or excluded.best_stars > public.oblaka_scores.best_stars then now()
                else public.oblaka_scores.updated_at end;
end;
$$;

revoke all on function public.oblaka_submit(int, int, int) from public;
grant execute on function public.oblaka_submit(int, int, int) to authenticated;
