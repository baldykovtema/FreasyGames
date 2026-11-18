-- Угадайкот на FreasyGames: таблицы лидеров — сколько раз игрок обыграл кота и сколько партий сыграл.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.ugadaykot_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_beat int not null default 0 check (best_beat between 0 and 100000),
    best_games int not null default 0 check (best_games between 0 and 100000),
    updated_at timestamptz not null default now()
);

create index if not exists ugadaykot_scores_beat on public.ugadaykot_scores (best_beat desc);
create index if not exists ugadaykot_scores_games on public.ugadaykot_scores (best_games desc);

alter table public.ugadaykot_scores enable row level security;

drop policy if exists "ugadaykot_scores_select_all" on public.ugadaykot_scores;
create policy "ugadaykot_scores_select_all"
    on public.ugadaykot_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию. Счёт копится на устройстве, поэтому проверяем только,
-- что побед над котом не больше, чем сыгранных партий.
create or replace function public.ugadaykot_submit(new_beat int, new_games int)
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
    if new_beat < 0 or new_games < 1 or new_games > 100000 or new_beat > new_games then
        raise exception 'Неверный результат';
    end if;
    insert into public.ugadaykot_scores (user_id, username, best_beat, best_games)
    values (uid, coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), new_beat, new_games)
    on conflict (user_id) do update
        set best_beat = greatest(public.ugadaykot_scores.best_beat, excluded.best_beat),
            best_games = greatest(public.ugadaykot_scores.best_games, excluded.best_games),
            username = excluded.username,
            updated_at = case when excluded.best_beat > public.ugadaykot_scores.best_beat or excluded.best_games > public.ugadaykot_scores.best_games then now() else public.ugadaykot_scores.updated_at end;
end;
$$;

revoke all on function public.ugadaykot_submit(int, int) from public;
grant execute on function public.ugadaykot_submit(int, int) to authenticated;
