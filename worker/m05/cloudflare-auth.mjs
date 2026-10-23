// Deployment supplies a private service binding. It must verify real account sessions.
// Neither model browser cookies nor oai-authenticated-user-id are project identities.
export function accountResolver(env) {
  if (!env.M05_AUTH?.fetch) return undefined;
  return async request => {
    const headers = new Headers();
    for (const name of ['Cookie', 'Authorization']) {
      const value = request.headers.get(name); if (value) headers.set(name, value);
    }
    const result = await env.M05_AUTH.fetch(new Request('https://m05-auth.internal/session', { headers }));
    if (!result.ok) return null;
    const data = await result.json();
    return data.authenticated === true ? data.user_id : null;
  };
}
