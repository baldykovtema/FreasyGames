-- FreasyChat: общий чат, личные сообщения и группы для FreasyGames 2D и 3D.
-- Supabase-проект общий с PVZ (PVZ-Webgame), аккаунты тоже (ник@pvz-game.com). Скрипт можно запускать повторно.
--
-- Комнаты:   'general'                — общий чат, читают все
--            'dm:<uuid меньше>:<uuid больше>' — личная переписка, читают только двое
--            'g:<uuid группы>'        — группа, читают только её участники

create table if not exists public.chat_messages (
    id bigint generated always as identity primary key,
    room text not null check (char_length(room) between 1 and 90),
    sender uuid not null,
    sender_name text not null check (char_length(sender_name) between 1 and 40),
    body text not null check (char_length(body) between 1 and 300),
    created_at timestamptz not null default now()
);
create index if not exists chat_messages_room on public.chat_messages (room, id desc);
create index if not exists chat_messages_sender on public.chat_messages (sender, created_at desc);

create table if not exists public.chat_groups (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 1 and 30),
    owner uuid not null,
    created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
    group_id uuid not null references public.chat_groups(id) on delete cascade,
    user_id uuid not null,
    username text not null check (char_length(username) between 1 and 40),
    added_at timestamptz not null default now(),
    primary key (group_id, user_id)
);
create index if not exists chat_members_user on public.chat_members (user_id);

-- Состоит ли текущий игрок в группе (отдельная функция, чтобы правило доступа не ссылалось само на себя).
create or replace function public.chat_is_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (select 1 from public.chat_members m where m.group_id = gid and m.user_id = auth.uid());
$$;

-- Может ли текущий игрок читать и писать в комнату.
create or replace function public.chat_can_access(r text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
    gid uuid;
begin
    if r = 'general' then
        return true;
    end if;
    if uid is null then
        return false;
    end if;
    if r like 'dm:%' then
        -- dm:<меньший uuid>:<больший uuid> — сравниваем как uuid, а не как текст
        begin
            return uid in (split_part(r, ':', 2)::uuid, split_part(r, ':', 3)::uuid) and split_part(r, ':', 2)::uuid < split_part(r, ':', 3)::uuid;
        exception when others then
            return false;
        end;
    end if;
    if r like 'g:%' then
        begin
            gid := substring(r from 3)::uuid;
        exception when others then
            return false;
        end;
        return public.chat_is_member(gid);
    end if;
    return false;
end;
$$;

alter table public.chat_messages enable row level security;
alter table public.chat_groups enable row level security;
alter table public.chat_members enable row level security;

drop policy if exists "chat_messages_read" on public.chat_messages;
create policy "chat_messages_read" on public.chat_messages for select to anon, authenticated using (public.chat_can_access(room));

drop policy if exists "chat_messages_write" on public.chat_messages;
create policy "chat_messages_write" on public.chat_messages for insert to authenticated with check (sender = auth.uid() and public.chat_can_access(room));

drop policy if exists "chat_groups_read" on public.chat_groups;
create policy "chat_groups_read" on public.chat_groups for select to authenticated
    using (public.chat_is_member(id));

drop policy if exists "chat_members_read" on public.chat_members;
create policy "chat_members_read" on public.chat_members for select to authenticated
    using (public.chat_is_member(group_id));

drop policy if exists "chat_members_leave" on public.chat_members;
create policy "chat_members_leave" on public.chat_members for delete to authenticated using (user_id = auth.uid());

-- Имя отправителя сервер ставит сам из аккаунта (подделать ник нельзя); не больше 5 сообщений за 10 секунд.
create or replace function public.chat_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    new.sender := auth.uid();
    new.sender_name := left(coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), 40);
    new.created_at := now();
    new.body := left(btrim(new.body), 300);
    if new.body = '' then
        raise exception 'Пустое сообщение';
    end if;
    if (select count(*) from public.chat_messages c where c.sender = new.sender and c.created_at > now() - interval '10 seconds') >= 5 then
        raise exception 'Слишком много сообщений — подожди немного';
    end if;
    return new;
end;
$$;
drop trigger if exists chat_before_insert on public.chat_messages;
create trigger chat_before_insert before insert on public.chat_messages for each row execute function public.chat_before_insert();

-- Найти игрока по нику (для личных сообщений и групп).
create or replace function public.chat_find_user(nick text)
returns table (id uuid, username text)
language sql
stable
security definer
set search_path = ''
as $$
    select u.id, u.raw_user_meta_data ->> 'username'
    from auth.users u
    where lower(u.raw_user_meta_data ->> 'username') = lower(btrim(nick))
    limit 1;
$$;

-- Мои личные переписки: с кем и когда было последнее сообщение.
create or replace function public.chat_my_dms()
returns table (room text, other_id uuid, other_name text, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
    with mine as (
        select c.room, max(c.created_at) as last_at
        from public.chat_messages c
        where c.room like 'dm:%' and auth.uid()::text in (split_part(c.room, ':', 2), split_part(c.room, ':', 3))
        group by c.room
    )
    select m.room,
           o.id,
           o.raw_user_meta_data ->> 'username',
           m.last_at
    from mine m
    join auth.users o on o.id::text = case when split_part(m.room, ':', 2) = auth.uid()::text then split_part(m.room, ':', 3) else split_part(m.room, ':', 2) end
    order by m.last_at desc
    limit 50;
$$;

-- Создать группу и сразу добавить участников по никам. Возвращает id группы и ники, которых не нашли.
create or replace function public.chat_create_group(group_name text, nicks text[])
returns table (group_id uuid, missing text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
    gid uuid;
    n text;
    found_id uuid;
    found_name text;
    miss text[] := '{}';
begin
    if uid is null then raise exception 'Нужно войти в аккаунт'; end if;
    if char_length(btrim(group_name)) < 1 or char_length(btrim(group_name)) > 30 then raise exception 'Название группы — от 1 до 30 символов'; end if;
    if coalesce(array_length(nicks, 1), 0) > 20 then raise exception 'В группе не больше 20 человек'; end if;
    if (select count(*) from public.chat_groups g where g.owner = uid) >= 20 then raise exception 'Можно создать не больше 20 групп'; end if;
    insert into public.chat_groups (name, owner) values (btrim(group_name), uid) returning id into gid;
    insert into public.chat_members (group_id, user_id, username)
        values (gid, uid, left(coalesce(auth.jwt() -> 'user_metadata' ->> 'username', 'Игрок'), 40));
    foreach n in array coalesce(nicks, '{}') loop
        select u.id, u.raw_user_meta_data ->> 'username' into found_id, found_name
        from auth.users u where lower(u.raw_user_meta_data ->> 'username') = lower(btrim(n)) limit 1;
        if found_id is null then miss := miss || n;
        else insert into public.chat_members (group_id, user_id, username) values (gid, found_id, left(found_name, 40)) on conflict do nothing;
        end if;
        found_id := null;
    end loop;
    return query select gid, miss;
end;
$$;

-- Добавить человека в группу (может любой её участник).
create or replace function public.chat_add_member(gid uuid, nick text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    uid uuid := auth.uid();
    found_id uuid;
    found_name text;
begin
    if uid is null then raise exception 'Нужно войти в аккаунт'; end if;
    if not exists (select 1 from public.chat_members m where m.group_id = gid and m.user_id = uid) then raise exception 'Ты не в этой группе'; end if;
    if (select count(*) from public.chat_members m where m.group_id = gid) >= 20 then raise exception 'В группе не больше 20 человек'; end if;
    select u.id, u.raw_user_meta_data ->> 'username' into found_id, found_name
    from auth.users u where lower(u.raw_user_meta_data ->> 'username') = lower(btrim(nick)) limit 1;
    if found_id is null then raise exception 'Игрок «%» не найден', nick; end if;
    insert into public.chat_members (group_id, user_id, username) values (gid, found_id, left(found_name, 40)) on conflict do nothing;
    return found_name;
end;
$$;

revoke all on function public.chat_find_user(text) from public;
revoke all on function public.chat_my_dms() from public;
revoke all on function public.chat_create_group(text, text[]) from public;
revoke all on function public.chat_add_member(uuid, text) from public;
grant execute on function public.chat_can_access(text) to anon, authenticated;
grant execute on function public.chat_is_member(uuid) to authenticated;
grant execute on function public.chat_find_user(text) to authenticated;
grant execute on function public.chat_my_dms() to authenticated;
grant execute on function public.chat_create_group(text, text[]) to authenticated;
grant execute on function public.chat_add_member(uuid, text) to authenticated;
grant select on public.chat_messages to anon, authenticated;
grant insert (room, body, sender, sender_name) on public.chat_messages to authenticated;
grant select on public.chat_groups, public.chat_members to authenticated;
grant delete on public.chat_members to authenticated;

-- Новые сообщения приходят игрокам сразу (Supabase Realtime проверяет те же правила доступа).
do $$
begin
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
        alter publication supabase_realtime add table public.chat_messages;
    end if;
end;
$$;
