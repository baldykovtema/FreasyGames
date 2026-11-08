-- FreasyCode Studio на FreasyGames: опубликованные проекты игроков.
-- Supabase-проект общий с PVZ, аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.

create table if not exists public.freasycode_projects (
    id bigint generated always as identity primary key,
    author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    author_name text not null check (char_length(author_name) between 1 and 40),
    name text not null check (char_length(name) between 1 and 40),
    data jsonb not null check (pg_column_size(data) < 4000000),
    thumb text check (thumb is null or char_length(thumb) < 60000),
    plays int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (author_id, name)
);

create index if not exists freasycode_projects_new on public.freasycode_projects (updated_at desc);
create index if not exists freasycode_projects_top on public.freasycode_projects (plays desc);

alter table public.freasycode_projects enable row level security;

drop policy if exists "freasycode_select_all" on public.freasycode_projects;
create policy "freasycode_select_all" on public.freasycode_projects for select to anon, authenticated using (true);

drop policy if exists "freasycode_insert_own" on public.freasycode_projects;
create policy "freasycode_insert_own" on public.freasycode_projects for insert to authenticated
    with check (author_id = auth.uid() and plays = 0);

drop policy if exists "freasycode_update_own" on public.freasycode_projects;
create policy "freasycode_update_own" on public.freasycode_projects for update to authenticated
    using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists "freasycode_delete_own" on public.freasycode_projects;
create policy "freasycode_delete_own" on public.freasycode_projects for delete to authenticated using (author_id = auth.uid());

-- Имя автора берётся из аккаунта, а счётчик просмотров нельзя поменять при обновлении проекта.
create or replace function public.freasycode_projects_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    -- Счётчик просмотров меняет только freasycode_opened, остальное при этом не трогаем.
    if tg_op = 'UPDATE' and current_setting('freasycode.counting', true) = '1' then
        return new;
    end if;
    new.author_name := coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок');
    if tg_op = 'UPDATE' then
        new.plays := old.plays;
        new.created_at := old.created_at;
    end if;
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists freasycode_projects_guard on public.freasycode_projects;
create trigger freasycode_projects_guard before insert or update on public.freasycode_projects
    for each row execute function public.freasycode_projects_guard();

-- +1 к «открыт N раз» при открытии проекта.
create or replace function public.freasycode_opened(project_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform set_config('freasycode.counting', '1', true);
    update public.freasycode_projects set plays = plays + 1 where id = project_id;
    perform set_config('freasycode.counting', '0', true);
end;
$$;

revoke all on function public.freasycode_opened(bigint) from public;
grant execute on function public.freasycode_opened(bigint) to anon, authenticated;
