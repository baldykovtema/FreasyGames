-- RCFCG 3D на FreasyGames 3D: статистика игроков и таблицы лидеров (проценты, время, кубы).
-- Supabase-проект общий с PVZ (PVZ-Webgame), аккаунты тоже (ник@pvz-game.com).
-- Открой Supabase → SQL Editor, вставь и нажми Run. Скрипт можно запускать повторно.

create table if not exists public.rcfcg3d_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    username text not null check (char_length(username) between 1 and 40),
    best_percentage int not null default 0 check (best_percentage between 0 and 100),
    dominant_color text not null default 'white' check (char_length(dominant_color) <= 40),
    colors jsonb not null default '[]'::jsonb check (jsonb_typeof(colors) = 'array' and jsonb_array_length(colors) in (0, 80)),
    total_play_seconds bigint not null default 0 check (total_play_seconds >= 0),
    cubes_completed bigint not null default 0 check (cubes_completed >= 0),
    updated_at timestamptz not null default now()
);

create index if not exists rcfcg3d_scores_percentage on public.rcfcg3d_scores (best_percentage desc);
create index if not exists rcfcg3d_scores_time on public.rcfcg3d_scores (total_play_seconds desc);
create index if not exists rcfcg3d_scores_cubes on public.rcfcg3d_scores (cubes_completed desc);

alter table public.rcfcg3d_scores enable row level security;

drop policy if exists "rcfcg3d_scores_select_all" on public.rcfcg3d_scores;
create policy "rcfcg3d_scores_select_all"
    on public.rcfcg3d_scores for select
    to anon, authenticated
    using (true);

-- Писать можно только через функцию: она проверяет данные и хранит лучшие значения игрока.
create or replace function public.rcfcg3d_save(new_percentage int, new_color text, new_colors jsonb, new_seconds bigint, new_cubes bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
    old public.rcfcg3d_scores%rowtype;
    elapsed numeric;
    player text := coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок');
begin
    if uid is null then
        raise exception 'Нужно войти в аккаунт';
    end if;
    if new_percentage is null or new_percentage < 0 or new_percentage > 100
       or new_seconds is null or new_seconds < 0 or new_cubes is null or new_cubes < 0 then
        raise exception 'Неверный результат';
    end if;
    if new_color is null or new_color !~ '^(white|hsl\([0-9]{1,3},[0-9.]{1,5}%,[0-9.]{1,5}%\))$' then
        raise exception 'Неверный цвет';
    end if;
    new_colors := coalesce(new_colors, '[]'::jsonb);
    if jsonb_typeof(new_colors) <> 'array' or jsonb_array_length(new_colors) not in (0, 80)
       or exists (select 1 from jsonb_array_elements(new_colors) e
                  where jsonb_typeof(e) <> 'string' or char_length(e #>> '{}') > 40) then
        raise exception 'Неверные цвета';
    end if;

    select * into old from public.rcfcg3d_scores where user_id = uid for update;

    if not found then
        -- Первое сохранение: игра только началась.
        insert into public.rcfcg3d_scores (user_id, username, best_percentage, dominant_color, colors, total_play_seconds, cubes_completed)
        values (uid, player, new_percentage, new_color, new_colors, least(new_seconds, 600), least(new_cubes, 1500000));
        return;
    end if;

    -- Время и кубы не могут расти быстрее, чем идёт настоящее время (21 куб × автокликер раз в 10 мс ≈ 2100 кубов/с).
    elapsed := extract(epoch from (now() - old.updated_at)) + 120;
    new_seconds := least(new_seconds, old.total_play_seconds + floor(elapsed)::bigint);
    new_cubes := least(new_cubes, old.cubes_completed + floor(elapsed * 2500)::bigint);

    update public.rcfcg3d_scores set
        username = player,
        best_percentage = greatest(old.best_percentage, new_percentage),
        dominant_color = case when new_percentage > old.best_percentage then new_color else old.dominant_color end,
        colors = case when new_percentage > old.best_percentage and jsonb_array_length(new_colors) = 80 then new_colors else old.colors end,
        total_play_seconds = greatest(old.total_play_seconds, new_seconds),
        cubes_completed = greatest(old.cubes_completed, new_cubes),
        updated_at = now()
    where user_id = uid;
end;
$$;

revoke all on function public.rcfcg3d_save(int, text, jsonb, bigint, bigint) from public;
grant execute on function public.rcfcg3d_save(int, text, jsonb, bigint, bigint) to authenticated;
