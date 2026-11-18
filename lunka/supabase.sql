-- Лунка на FreasyGames: таблицы лидеров по лункам за игру и по лункам с одного удара.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.lunka_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_holes int not null default 0 check (best_holes between 0 and 100000),
    best_aces int not null default 0 check (best_aces between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists lunka_scores_holes on public.lunka_scores (best_holes desc);
create index if not exists lunka_scores_aces on public.lunka_scores (best_aces desc);

alter table public.lunka_scores enable row level security;

drop policy if exists "lunka_scores_select_all" on public.lunka_scores;
create policy "lunka_scores_select_all"
    on public.lunka_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. new_time не хранится, по нему проверяется, что результат возможен:
-- с одного удара не больше лунок, чем всего, а на лунку уходит не меньше полутора секунд.
create or replace function public.lunka_submit(new_holes int, new_aces int, new_time int)
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
    if new_holes < 0 or new_aces < 0 or new_time < 0 or new_time > 1000000
       or new_aces > new_holes or new_holes * 3 > new_time * 2 + 6 then
        raise exception 'Неверный результат';
    end if;
    insert into public.lunka_scores (user_id, username, best_holes, best_aces)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_holes, new_aces)
    on conflict (user_id) do update
        set best_holes = greatest(public.lunka_scores.best_holes, excluded.best_holes),
            best_aces = greatest(public.lunka_scores.best_aces, excluded.best_aces),
            username = excluded.username,
            updated_at = case when excluded.best_holes > public.lunka_scores.best_holes or excluded.best_aces > public.lunka_scores.best_aces then now() else public.lunka_scores.updated_at end;
end;
$$;

revoke all on function public.lunka_submit(int, int, int) from public;
grant execute on function public.lunka_submit(int, int, int) to authenticated;
