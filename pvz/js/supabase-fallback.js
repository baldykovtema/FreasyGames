// Если библиотека Supabase не загрузилась (нет интернета), игра всё равно открывается:
// вход недоступен, но можно играть в офлайн-режиме (js/guest.js).
if (!window.supabase) {
    window.supabase = {
        createClient() {
            const error = {message: "Нет связи с сервером. Проверь интернет или играй в офлайн-режиме"};
            const query = new Proxy({}, {get: (_, key) => key === "then" ? ok => ok({data: null, error}) : () => query});
            const channel = {on() { return channel; }, subscribe() { return channel; }, send: async () => "error", track: async () => "error", untrack: async () => "error"};
            return {
                from: () => query,
                rpc: () => query,
                channel: () => channel,
                removeChannel: async () => {},
                auth: {
                    getSession: async () => ({data: {session: null}, error: null}),
                    getUser: async () => ({data: {user: null}, error}),
                    onAuthStateChange: () => ({data: {subscription: {unsubscribe() {}}}}),
                    signInWithPassword: async () => ({data: {}, error}),
                    signUp: async () => ({data: {}, error}),
                    signOut: async () => ({error: null})
                }
            };
        }
    };
}
