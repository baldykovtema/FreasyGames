-- Учёт времени в играх FreasyGames 2D и 3D: сколько минут каждый игрок провёл в каждой игре.
-- Открой Supabase → SQL Editor, вставь и нажми Run. Скрипт можно запускать повторно.
-- Пишет shared/session.js раз в минуту, пока вкладка с игрой открыта и видна. Читает только FreasyAdmin (service role).

create table if not exists public.play_time (
    user_id uuid not null references auth.users(id) on delete cascade,
    game_id text not null check (game_id ~ '^[a-z0-9-]{1,40}$'),
    seconds bigint not null default 0,
    sessions int not null default 0,
    first_played timestamptz not null default now(),
    last_played timestamptz not null default now(),
    primary key (user_id, game_id)
);

create index if not exists play_time_last on public.play_time (last_played desc);

alter table public.play_time enable row level security;
-- Политик на чтение нет: игроки не видят чужое время, а владелец читает через service role.

create or replace function public.play_tick(gid text, secs int, new_session boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
begin
    if uid is null then return; end if;
    if gid !~ '^[a-z0-9-]{1,40}$' then raise exception 'Неверная игра'; end if;
    secs := least(greatest(coalesce(secs, 0), 0), 90);

    insert into public.play_time (user_id, game_id, seconds, sessions)
    values (uid, gid, secs, case when new_session then 1 else 0 end)
    on conflict (user_id, game_id) do update
        set seconds = public.play_time.seconds
                      -- не чаще раза в 40 секунд, чтобы время нельзя было накрутить
                      + case when now() - public.play_time.last_played >= interval '40 seconds' or new_session then excluded.seconds else 0 end,
            sessions = public.play_time.sessions + excluded.sessions,
            last_played = now();
end;
$$;

revoke all on function public.play_tick(text, int, boolean) from public;
grant execute on function public.play_tick(text, int, boolean) to authenticated;
