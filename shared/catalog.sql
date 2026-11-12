-- Счётчики игр в каталогах FreasyGames 2D и 3D: заходы, лайки и оценки звёздами.
-- Supabase-проект общий с PVZ. Голосовать можно без аккаунта: у каждого браузера свой случайный voter-id,
-- один лайк и одна оценка на игру с одного браузера. Скрипт можно запускать повторно.

create table if not exists public.game_stats (
    game_id text primary key check (game_id ~ '^[a-z0-9-]{1,40}$'),
    plays bigint not null default 0,
    likes int not null default 0,
    stars_sum int not null default 0,
    stars_count int not null default 0,
    updated_at timestamptz not null default now()
);

create table if not exists public.game_votes (
    game_id text not null references public.game_stats(game_id) on delete cascade,
    voter uuid not null,
    liked boolean not null default false,
    stars smallint check (stars between 1 and 5),
    updated_at timestamptz not null default now(),
    primary key (game_id, voter)
);

alter table public.game_stats enable row level security;
alter table public.game_votes enable row level security;

drop policy if exists "game_stats_select_all" on public.game_stats;
create policy "game_stats_select_all" on public.game_stats for select to anon, authenticated using (true);
-- game_votes читается и пишется только через функции ниже.

-- Заход в игру: +1 к счётчику.
create or replace function public.game_play(gid text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if gid !~ '^[a-z0-9-]{1,40}$' then raise exception 'Неверная игра'; end if;
    insert into public.game_stats (game_id, plays) values (gid, 1)
    on conflict (game_id) do update set plays = public.game_stats.plays + 1, updated_at = now();
end;
$$;

-- Лайк и/или оценка. new_stars = 0 — убрать оценку. Возвращает новые счётчики игры.
create or replace function public.game_vote(gid text, voter_id uuid, new_liked boolean, new_stars int)
returns public.game_stats
language plpgsql
security definer
set search_path = ''
as $$
declare
    result public.game_stats;
begin
    if gid !~ '^[a-z0-9-]{1,40}$' then raise exception 'Неверная игра'; end if;
    if new_stars < 0 or new_stars > 5 then raise exception 'Оценка от 1 до 5'; end if;

    insert into public.game_stats (game_id) values (gid) on conflict (game_id) do nothing;
    insert into public.game_votes (game_id, voter, liked, stars)
    values (gid, voter_id, coalesce(new_liked, false), nullif(new_stars, 0))
    on conflict (game_id, voter) do update
        set liked = excluded.liked, stars = excluded.stars, updated_at = now();

    update public.game_stats s
    set likes = v.likes, stars_sum = v.stars_sum, stars_count = v.stars_count, updated_at = now()
    from (
        select count(*) filter (where liked)::int as likes,
               coalesce(sum(stars), 0)::int as stars_sum,
               count(stars)::int as stars_count
        from public.game_votes where game_id = gid
    ) v
    where s.game_id = gid
    returning s.* into result;
    return result;
end;
$$;

-- Свои голоса этого браузера: показать, что игра уже лайкнута и какая стоит оценка.
create or replace function public.game_my_votes(voter_id uuid)
returns table (game_id text, liked boolean, stars smallint)
language sql
security definer
set search_path = ''
as $$
    select v.game_id, v.liked, v.stars from public.game_votes v where v.voter = voter_id;
$$;

revoke all on function public.game_play(text) from public;
revoke all on function public.game_vote(text, uuid, boolean, int) from public;
revoke all on function public.game_my_votes(uuid) from public;
grant execute on function public.game_play(text) to anon, authenticated;
grant execute on function public.game_vote(text, uuid, boolean, int) to anon, authenticated;
grant execute on function public.game_my_votes(uuid) to anon, authenticated;
