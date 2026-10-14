/* Cliente mínimo para las funciones RPC de Supabase (sin dependencias). */
(function (root) {
  var C = root.TDD_CONFIG || {};
  function rpc(name, args) {
    return fetch(C.SUPABASE_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: C.SUPABASE_KEY },
      body: JSON.stringify(args || {})
    }).then(function (r) {
      return r.text().then(function (txt) {
        var data = txt ? JSON.parse(txt) : null;
        if (!r.ok) { var e = new Error((data && data.message) || 'Error de conexión'); e.code = data && data.code; e.status = r.status; throw e; }
        return data;
      });
    });
  }
  root.Api = {
    register: function (u, p) { return rpc('tdd_register', { p_username: u, p_password: p }); },
    login: function (u, p) { return rpc('tdd_login', { p_username: u, p_password: p }); },
    logout: function (t) { return rpc('tdd_logout', { p_token: t }); },
    progress: function (t) { return rpc('tdd_get_progress', { p_token: t }); },
    record: function (t, termId, ev, ok) { return rpc('tdd_record', { p_token: t, p_term_id: termId, p_event: ev, p_correct: ok === undefined ? null : ok }); },
    leaderboard: function (t) { return rpc('tdd_leaderboard', { p_token: t }); },
    changePassword: function (t, o, n) { return rpc('tdd_change_password', { p_token: t, p_old: o, p_new: n }); },
    adminReset: function (t, u, n) { return rpc('tdd_admin_reset_password', { p_token: t, p_username: u, p_new_password: n }); }
  };
})(window);
