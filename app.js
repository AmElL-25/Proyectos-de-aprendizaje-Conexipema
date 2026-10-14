(function () {
  var T = window.TERMS, S = window.Schedule, A = window.Api, $ = function (s) { return document.querySelector(s); };
  var SKEY = 'tdd_session_v2';
  var SESSION = loadSession();            // { token, username, is_admin }
  var P = empty();
  function empty() { return { seen: {}, correct: {}, answered: {}, days: [], streak: null }; }
  function loadSession() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } }
  function saveSession() { try { SESSION ? localStorage.setItem(SKEY, JSON.stringify(SESSION)) : localStorage.removeItem(SKEY); } catch (e) {} }
  function cacheKey() { return 'tdd_cache_v2_' + (SESSION ? SESSION.username.toLowerCase() : ''); }
  // localStorage solo como caché/respaldo: la fuente de verdad es Supabase.
  function load() { try { return Object.assign(empty(), JSON.parse(localStorage.getItem(cacheKey()) || '{}')); } catch (e) { return empty(); } }
  function save() { try { localStorage.setItem(cacheKey(), JSON.stringify(P)); } catch (e) {} }
  function fromServer(d) {
    var toSet = function (arr) { var o = {}; (arr || []).forEach(function (id) { o[id] = 1; }); return o; };
    P = { seen: toSet(d.seen), correct: toSet(d.correct), answered: d.answered || {}, days: d.days || [], streak: d.streak };
    if (SESSION) { SESSION.is_admin = !!d.is_admin; SESSION.username = d.username || SESSION.username; saveSession(); }
    save(); stats();
  }
  // Cola de eventos pendientes si no hay conexión
  function queueKey() { return 'tdd_queue_v2_' + (SESSION ? SESSION.username.toLowerCase() : ''); }
  function getQueue() { try { return JSON.parse(localStorage.getItem(queueKey()) || '[]'); } catch (e) { return []; } }
  function setQueue(q) { try { localStorage.setItem(queueKey(), JSON.stringify(q)); } catch (e) {} }
  function send(termId, ev, ok) {
    if (!SESSION) return;
    var q = getQueue(); q.push([termId, ev, ok]); setQueue(q); flush();
  }
  var flushing = false;
  function flush() {
    if (flushing || !SESSION) return; var q = getQueue(); if (!q.length) return;
    flushing = true;
    A.record(SESSION.token, q[0][0], q[0][1], q[0][2]).then(function (d) {
      var rest = getQueue().slice(1); setQueue(rest); flushing = false;
      if (!rest.length) fromServer(d); flush();
    }).catch(function (e) { flushing = false; if (e.code === '28000') return expired(); if (e.status && e.status < 500) { setQueue(getQueue().slice(1)); flush(); } });
  }
  function expired() { SESSION = null; saveSession(); showAuth('Tu sesión venció. Vuelve a ingresar.'); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var LV = { 1: 'Básico', 2: 'Intermedio', 3: 'Avanzado' };
  var CAT_CLASS = { 'Marketing': 'c-mkt', 'Publicidad digital': 'c-ads', 'Estrategia de negocio': 'c-est', 'Finanzas': 'c-fin' };
  function fmtDate(key) { var p = key.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }

  var now = Date.now(), today = S.dayIndex(now);
  var viewIdx = today;

  function streak() {
    if (P.streak !== null && P.streak !== undefined && !getQueue().length) return P.streak;
    var set = {}; P.days.forEach(function (d) { set[d] = 1; });
    var n = 0, i = today; if (!set[S.dateKeyForDay(i)]) i--; // la racha sigue viva si ayer cumpliste
    while (set[S.dateKeyForDay(i)]) { n++; i--; }
    return n;
  }
  function markSeen(t) { if (!P.seen[t.id]) { P.seen[t.id] = Date.now(); save(); send(t.id, 'seen'); } }
  function markPracticed() { var k = S.dateKeyForDay(today); if (P.days.indexOf(k) < 0) { P.days.push(k); P.streak = null; } save(); }

  function stats() {
    $('#st-seen').textContent = Object.keys(P.seen).length + '/' + T.length;
    $('#st-ok').textContent = Object.keys(P.correct).length;
    $('#st-streak').textContent = streak();
  }

  function mcOptions(t) {
    var r = S.rng(t.id.split('').reduce(function (a, c) { return a * 31 + c.charCodeAt(0) | 0; }, 7));
    var pool = T.filter(function (x) { return x.category === t.category && x.id !== t.id; });
    var opts = S.shuffle(pool.slice(), r).slice(0, 3).concat([t]);
    return S.shuffle(opts, r);
  }

  function render(idx) {
    viewIdx = idx;
    var t = T[S.termIndexForDay(T, idx)], dk = S.dateKeyForDay(idx);
    if (idx === today) markSeen(t);
    var isToday = idx === today;
    var opts = mcOptions(t);
    $('#card').innerHTML =
      '<div class="meta"><span class="chip ' + CAT_CLASS[t.category] + '">' + esc(t.category) + '</span><span class="chip lvl">' + LV[t.level] + '</span>' +
      '<span class="date">' + (isToday ? 'Hoy · ' : '') + fmtDate(dk) + '</span></div>' +
      '<h2>' + esc(t.term) + '</h2>' + (t.en ? '<p class="en">En inglés: <b>' + esc(t.en) + '</b></p>' : '') +
      '<p class="expl">' + esc(t.explanation) + '</p>' +
      '<div class="ex"><b>Ejemplo práctico</b><p>' + esc(t.example) + '</p></div>' +
      '<section class="practice"><h3>Practica</h3>' +
      '<p class="q"><b>1.</b> ¿Qué término corresponde a esta definición?<br><i>“' + esc(t.explanation.split('. ')[0].replace(/\.$/, '')) + '.”</i></p>' +
      '<div class="opts">' + opts.map(function (o) { return '<button class="opt" data-id="' + o.id + '">' + esc(o.term) + '</button>'; }).join('') + '</div>' +
      '<p class="fb" id="fb1"></p>' +
      '<p class="q"><b>2.</b> ' + esc(t.question) + '</p>' +
      '<textarea id="ans" rows="3" placeholder="Escribe tu respuesta…"></textarea>' +
      '<button class="btn" id="reveal">Ver respuesta modelo</button>' +
      '<div id="model" class="model" hidden><b>Respuesta modelo:</b> ' + esc(t.answer) +
      '<div class="self">¿Tu respuesta coincidía? <button class="btn sm" data-self="1">Sí</button><button class="btn sm ghost" data-self="0">No del todo</button></div></div>' +
      '</section>' +
      '<nav class="pager"><button class="btn ghost" id="prev">← Anterior</button>' + (isToday ? '' : '<button class="btn ghost" id="gotoday">Hoy</button>') +
      (idx < today ? '<button class="btn ghost" id="next">Siguiente →</button>' : '') + '</nav>';

    $('#card').querySelectorAll('.opt').forEach(function (b) {
      b.onclick = function () {
        var ok = b.dataset.id === t.id;
        $('#card').querySelectorAll('.opt').forEach(function (x) { x.disabled = true; if (x.dataset.id === t.id) x.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        $('#fb1').textContent = ok ? '¡Correcto! 🎉' : 'Casi. La respuesta correcta es “' + t.term + '”.';
        $('#fb1').className = 'fb ' + (ok ? 'ok' : 'bad');
        P.answered[t.id] = (P.answered[t.id] || 0) + 1;
        if (ok) P.correct[t.id] = Date.now();
        markSeen(t); markPracticed(); send(t.id, 'mc', ok); stats();
      };
    });
    $('#reveal').onclick = function () { $('#model').hidden = false; this.hidden = true; markSeen(t); markPracticed(); send(t.id, 'reveal'); stats(); };
    $('#card').querySelectorAll('[data-self]').forEach(function (b) {
      b.onclick = function () { if (b.dataset.self === '1') { P.correct[t.id] = P.correct[t.id] || Date.now(); send(t.id, 'self', true); } save(); stats(); b.parentNode.textContent = b.dataset.self === '1' ? '¡Bien! Registrado.' : 'Sin problema, repásalo mañana.'; };
    });
    $('#prev').onclick = function () { render(idx - 1); };
    if ($('#next')) $('#next').onclick = function () { render(idx + 1); };
    if ($('#gotoday')) $('#gotoday').onclick = function () { render(today); };
    stats(); show('hoy'); window.scrollTo(0, 0);
  }

  // Historial
  function renderHistory() {
    var q = $('#search').value.trim().toLowerCase(), cat = $('#fcat').value, all = $('#fall').checked;
    var norm = function (s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); };
    var items = [];
    if (all) T.forEach(function (t, i) { items.push({ t: t, idx: null }); });
    else for (var i = today; i >= Math.max(today - 400, -1e9) && i >= today - T.length * 3; i--) { if (i < 0 && !P.seen[T[S.termIndexForDay(T, i)].id]) break; items.push({ t: T[S.termIndexForDay(T, i)], idx: i }); }
    items = items.filter(function (it) {
      return (!cat || it.t.category === cat) && (!q || norm(it.t.term + ' ' + it.t.en + ' ' + it.t.explanation).indexOf(norm(q)) >= 0);
    });
    $('#hist').innerHTML = items.length ? items.map(function (it) {
      return '<li data-id="' + it.t.id + '" data-idx="' + (it.idx === null ? '' : it.idx) + '"><span class="dot ' + CAT_CLASS[it.t.category] + '"></span><div><b>' + esc(it.t.term) + '</b>' +
        (P.correct[it.t.id] ? ' <span class="okmark">✓</span>' : '') + '<small>' + (it.idx !== null ? fmtDate(S.dateKeyForDay(it.idx)) + ' · ' : '') + esc(it.t.category) + ' · ' + LV[it.t.level] + '</small></div></li>';
    }).join('') : '<p class="empty">Sin resultados.</p>';
    $('#hist').querySelectorAll('li').forEach(function (li) {
      li.onclick = function () {
        if (li.dataset.idx !== '') return render(+li.dataset.idx);
        var t = T.find(function (x) { return x.id === li.dataset.id; });
        $('#detail').innerHTML = '<h3>' + esc(t.term) + '</h3>' + (t.en ? '<p class="en">' + esc(t.en) + '</p>' : '') + '<p>' + esc(t.explanation) + '</p><p><b>Ejemplo:</b> ' + esc(t.example) + '</p><p><b>Pregunta:</b> ' + esc(t.question) + '</p><details><summary>Respuesta</summary>' + esc(t.answer) + '</details><button class="btn" id="closeD">Cerrar</button>';
        $('#dlg').showModal ? $('#dlg').showModal() : $('#dlg').setAttribute('open', '');
        $('#closeD').onclick = function () { $('#dlg').close ? $('#dlg').close() : $('#dlg').removeAttribute('open'); };
      };
    });
  }

  function show(tab) {
    document.querySelectorAll('.view').forEach(function (v) { v.hidden = v.id !== 'v-' + tab; });
    document.querySelectorAll('header .tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === tab); });
    if (tab === 'hist') renderHistory();
    if (tab === 'equipo') renderBoard();
    if (tab === 'info') renderSettings();
  }
  document.querySelectorAll('header .tabs button').forEach(function (b) { b.onclick = function () { b.dataset.tab === 'hoy' ? render(today) : show(b.dataset.tab); }; });
  ['#search', '#fcat', '#fall'].forEach(function (s) { $(s).addEventListener('input', renderHistory); $(s).addEventListener('change', renderHistory); });

  // Cuenta regresiva + cambio automático a las 7:55
  function tick() {
    var n = Date.now();
    if (S.dayIndex(n) !== today) { today = S.dayIndex(n); render(today); notify(); }
    var ms = S.nextChange(n) - n, h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
    $('#countdown').textContent = 'Próximo término en ' + h + ' h ' + m + ' min (7:55 a.m., hora Lima)';
  }
  // Notificaciones (mejor esfuerzo: solo con la pestaña abierta)
  function notify() {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var t = T[S.termIndexForDay(T, today)];
    try { new Notification('Término del día: ' + t.term, { body: t.category + ' · ' + t.explanation.slice(0, 100) + '…' }); } catch (e) {}
  }
  var nb = $('#notif');
  function nbState() {
    if (!('Notification' in window)) { nb.textContent = 'Notificaciones no disponibles'; nb.disabled = true; return; }
    nb.textContent = Notification.permission === 'granted' ? '🔔 Recordatorio 7:55 activo' : Notification.permission === 'denied' ? '🔕 Notificaciones bloqueadas' : '🔔 Activar recordatorio 7:55';
  }
  nb.onclick = function () { if ('Notification' in window) Notification.requestPermission().then(function () { nbState(); if (Notification.permission === 'granted') new Notification('¡Listo! Te avisaré a las 7:55 a.m. mientras la app esté abierta.'); }); };
  nbState();

  // ===== Equipo (ranking) =====
  function renderBoard() {
    var box = $('#board'); box.innerHTML = '<p class="empty">Cargando ranking…</p>';
    A.leaderboard(SESSION.token).then(function (rows) {
      var medal = { 1: '🥇', 2: '🥈', 3: '🥉' };
      box.innerHTML = '<table class="board"><thead><tr><th>#</th><th>Usuario</th><th>Racha 🔥</th><th>Aprendidos</th><th>Correctas</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr' + (r.is_me ? ' class="me"' : '') + '><td>' + (medal[r.rank] || r.rank) + '</td><td>' + esc(r.username) + (r.is_me ? ' <small>(tú)</small>' : '') +
            '</td><td>' + r.current_streak + '</td><td>' + r.terms_learned + '</td><td>' + r.correct_answers + '</td></tr>';
        }).join('') + '</tbody></table><p class="hint">Orden: racha actual, luego términos aprendidos y respuestas correctas.</p>';
    }).catch(function (e) { if (e.code === '28000') return expired(); box.innerHTML = '<p class="empty">No se pudo cargar el ranking: ' + esc(e.message) + '</p>'; });
  }

  // ===== Ajustes: cuenta =====
  function msg(sel, text, ok) { var el = $(sel); el.textContent = text; el.className = 'fb ' + (ok ? 'ok' : 'bad'); }
  function renderSettings() {
    $('#me-name').textContent = SESSION ? SESSION.username : '';
    $('#admin').hidden = !(SESSION && SESSION.is_admin);
  }
  $('#pw-form').onsubmit = function (ev) {
    ev.preventDefault();
    if ($('#pw-new').value !== $('#pw-new2').value) return msg('#pw-msg', 'Las contraseñas nuevas no coinciden.');
    A.changePassword(SESSION.token, $('#pw-old').value, $('#pw-new').value).then(function () { msg('#pw-msg', 'Contraseña actualizada.', true); $('#pw-form').reset(); })
      .catch(function (e) { msg('#pw-msg', e.message); });
  };
  $('#adm-form').onsubmit = function (ev) {
    ev.preventDefault();
    var u = $('#adm-user').value.trim(), p = $('#adm-pass').value;
    if (!confirm('¿Restablecer la contraseña de “' + u + '”?')) return;
    A.adminReset(SESSION.token, u, p).then(function () { msg('#adm-msg', 'Listo: “' + u + '” ya puede ingresar con la nueva contraseña.', true); $('#adm-form').reset(); })
      .catch(function (e) { msg('#adm-msg', e.message); });
  };
  $('#logout').onclick = function () {
    var t = SESSION && SESSION.token; SESSION = null; saveSession(); P = empty();
    if (t) A.logout(t).catch(function () {});
    showAuth();
  };

  // ===== Acceso (usuario + contraseña, sin correo) =====
  var authMode = 'login';
  function setMode(m) {
    authMode = m;
    document.querySelectorAll('[data-auth]').forEach(function (b) { b.classList.toggle('active', b.dataset.auth === m); });
    $('#au-pass2-row').hidden = m !== 'register';
    $('#au-pass2').required = m === 'register';
    $('#au-submit').textContent = m === 'register' ? 'Crear cuenta' : 'Ingresar';
    $('#au-pass').autocomplete = m === 'register' ? 'new-password' : 'current-password';
    msg('#au-msg', '', true);
  }
  document.querySelectorAll('[data-auth]').forEach(function (b) { b.onclick = function () { setMode(b.dataset.auth); }; });
  $('#auth-form').onsubmit = function (ev) {
    ev.preventDefault();
    var u = $('#au-user').value.trim(), p = $('#au-pass').value;
    if (authMode === 'register' && p !== $('#au-pass2').value) return msg('#au-msg', 'Las contraseñas no coinciden.');
    $('#au-submit').disabled = true; msg('#au-msg', 'Un momento…', true);
    (authMode === 'register' ? A.register(u, p) : A.login(u, p)).then(function (d) {
      SESSION = { token: d.token, username: d.username, is_admin: !!d.is_admin }; saveSession();
      fromServer(d); start();
    }).catch(function (e) { msg('#au-msg', e.message); }).then(function () { $('#au-submit').disabled = false; });
  };
  function showAuth(text) {
    $('#app').hidden = true; $('#auth').hidden = false; setMode('login');
    if (text) msg('#au-msg', text);
  }

  var started = false;
  function start() {
    $('#auth').hidden = true; $('#app').hidden = false;
    $('#who').textContent = '👤 ' + SESSION.username;
    if (!started) { started = true; tick(); setInterval(function () { tick(); flush(); }, 30000); }
    render(today);
  }

  $('#count').textContent = T.length;
  if (SESSION && SESSION.token) {
    P = load(); start(); flush();
    A.progress(SESSION.token).then(function (d) { if (!getQueue().length) fromServer(d); })
      .catch(function (e) { if (e.code === '28000') expired(); /* sin conexión: seguimos con la caché */ });
  } else showAuth();
})();
