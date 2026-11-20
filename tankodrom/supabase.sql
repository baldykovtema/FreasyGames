-- Танкодром на FreasyGames: таблицы лидеров по очкам и по волнам за один бой.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.tankodrom_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_score int not null default 0 check (best_score between 0 and 10000000),
    best_wave int not null default 0 check (best_wave between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists tankodrom_scores_score on public.tankodrom_scores (best_score desc);
create index if not exists tankodrom_scores_wave on public.tankodrom_scores (best_wave desc);

alter table public.tankodrom_scores enable row level security;

drop policy if exists "tankodrom_scores_select_all" on public.tankodrom_scores;
create policy "tankodrom_scores_select_all"
    on public.tankodrom_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. new_time не хранится, по нему проверяется, что результат возможен:
-- очков не больше, чем можно набрать за пройденные волны (враги и награда за волну растут с номером волны),
-- а на волну уходит не меньше восьми секунд.
create or replace function public.tankodrom_submit(new_score int, new_wave int, new_time int)
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
    if new_score < 0 or new_wave < 0 or new_time < 0 or new_time > 1000000
       or new_wave < 1 or new_score > (new_wave + 1) * (new_wave + 1) * 1200 or new_wave * 8 > new_time + 20 then
        raise exception 'Неверный результат';
    end if;
    insert into public.tankodrom_scores (user_id, username, best_score, best_wave)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_score, new_wave)
    on conflict (user_id) do update
        set best_score = greatest(public.tankodrom_scores.best_score, excluded.best_score),
            best_wave = greatest(public.tankodrom_scores.best_wave, excluded.best_wave),
            username = excluded.username,
            updated_at = case when excluded.best_score > public.tankodrom_scores.best_score or excluded.best_wave > public.tankodrom_scores.best_wave then now() else public.tankodrom_scores.updated_at end;
end;
$$;

revoke all on function public.tankodrom_submit(int, int, int) from public;
grant execute on function public.tankodrom_submit(int, int, int) to authenticated;
