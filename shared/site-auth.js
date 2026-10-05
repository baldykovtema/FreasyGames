(() => {
    const projects = {
        rcfcg: {id: 'htooxiwcryzjopbnitef', key: 'sb_publishable_EvgpU14PTHkWQRUfr6f9RQ_lOVMrN9B', domain: 'rcfcg-game.com', label: 'RCFCG'},
        pvz: {id: 'ywqxrbmgmvpbeytxjkpi', key: 'sb_publishable_igyJK68YpyJYo-0KNrVZPA_rm6_gIRg', domain: 'pvz-game.com', label: 'Растения против Зомби'}
    };
    const form = document.getElementById('account-form');
    const game = document.getElementById('account-game');
    const password = document.getElementById('account-password');
    const message = document.getElementById('account-message');
    const submit = document.getElementById('account-submit');
    const toggle = document.getElementById('account-toggle');
    let mode = 'login';
    function setMode(next) {
        mode = next;
        document.getElementById('account-title').textContent = next === 'login' ? 'Вход на FreasyGames' : 'Регистрация на FreasyGames';
        submit.textContent = next === 'login' ? 'Войти' : 'Зарегистрироваться';
        toggle.textContent = next === 'login' ? 'Создать аккаунт' : 'Уже есть аккаунт — войти';
        password.autocomplete = next === 'login' ? 'current-password' : 'new-password';
        message.textContent = '';
    }
    document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => {
        setMode(button.dataset.authMode);
        document.getElementById('account').scrollIntoView();
        document.getElementById('account-username').focus({preventScroll: true});
    }));
    toggle.addEventListener('click', () => setMode(mode === 'login' ? 'register' : 'login'));
    const requested = new URLSearchParams(location.search).get('account');
    if (projects[requested]) game.value = requested;
    if (!window.supabase) {
        message.textContent = 'Не удалось загрузить вход. Обновите страницу или проверьте интернет.';
        submit.disabled = true;
        return;
    }
    for (const [slug, project] of Object.entries(projects)) {
        // Keep the original storage keys and PvZ tab-scoped session migration.
        const storageKey = `sb-${project.id}-auth-token`;
        if (slug === 'pvz' && !sessionStorage.getItem(storageKey) && localStorage.getItem(storageKey)) {
            sessionStorage.setItem(storageKey, localStorage.getItem(storageKey));
        }
        project.client = window.supabase.createClient(`https://${project.id}.supabase.co`, project.key, {
            auth: {storage: slug === 'pvz' ? sessionStorage : localStorage, storageKey, persistSession: true, autoRefreshToken: true}
        });
    }
    async function renderSessions() {
        const container = document.getElementById('account-sessions');
        const rows = await Promise.all(Object.entries(projects).map(async ([slug, project]) => {
            const {data, error} = await project.client.auth.getSession();
            if (error) throw error;
            if (!data.session) return null;
            const row = document.createElement('div');
            row.className = 'session-row';
            const name = document.createElement('span');
            name.textContent = `${project.label}: ${data.session.user.user_metadata?.username || data.session.user.email.split('@')[0]}`;
            const play = document.createElement('a');
            play.className = 'play';
            play.href = `games/${slug}/`;
            play.textContent = 'Продолжить играть →';
            const logout = document.createElement('button');
            logout.className = 'nav-link';
            logout.textContent = 'Выйти';
            logout.addEventListener('click', async () => {
                logout.disabled = true;
                try {
                    const {error} = await project.client.auth.signOut();
                    if (error) throw error;
                    if (slug === 'pvz') localStorage.removeItem(`sb-${project.id}-auth-token`);
                    await renderSessions();
                } catch {message.textContent = 'Не удалось выйти. Попробуйте снова.';}
                finally {logout.disabled = false;}
            });
            row.append(name, play, logout);
            return row;
        }));
        container.replaceChildren(...rows.filter(Boolean));
    }
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const username = document.getElementById('account-username').value.trim();
        if (!/^[A-Za-z0-9_]{3,30}$/.test(username) || password.value.length < 6) {
            message.textContent = 'Логин: 3–30 латинских букв, цифр или _. Пароль: минимум 6 символов.';
            return;
        }
        const project = projects[game.value];
        const action = mode;
        Array.from(form.elements).forEach(element => element.disabled = true);
        message.textContent = action === 'login' ? 'Входим…' : 'Создаём аккаунт…';
        try {
            const credentials = {email: `${username.toLowerCase()}@${project.domain}`, password: password.value};
            const {data, error} = action === 'login'
                ? await project.client.auth.signInWithPassword(credentials)
                : await project.client.auth.signUp({...credentials, options: {data: {username: game.value === 'rcfcg' ? username.toLowerCase() : username}}});
            if (error) {
                message.textContent = action === 'login' ? 'Не удалось войти. Проверьте выбранную игру, логин и пароль или попробуйте позже.' : 'Не удалось зарегистрироваться: ' + error.message;
                return;
            }
            password.value = '';
            message.textContent = data.session ? 'Готово! Выберите «Продолжить играть».' : 'Аккаунт создан, но вход требует подтверждения. Обратитесь к администратору FreasyGames.';
            await renderSessions();
        } catch {
            message.textContent = 'Ошибка соединения. Проверьте интернет и попробуйте снова.';
        } finally {
            Array.from(form.elements).forEach(element => element.disabled = false);
        }
    });
    renderSessions().catch(() => {message.textContent = 'Не удалось проверить аккаунты. Попробуйте обновить страницу.';});
})();
