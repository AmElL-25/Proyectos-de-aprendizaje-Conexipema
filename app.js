(function () {
  var T = window.TERMS, S = window.Schedule, A = window.Api, $ = function (s) { return document.querySelector(s); };
  var SKEY = 'tdd_session_v2';
  var SESSION = loadSession();            // { token, username, is_admin }
  var P = empty();
  function empty() { return { seen: {}, correct: {}, answered: {}, days: [], streak: null, points: 0, points_today: 0, level: null, badges: [], scored_today: null }; }
  function loadSession() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } }
  function saveSession() { try { SESSION ? localStorage.setItem(SKEY, JSON.stringify(SESSION)) : localStorage.removeItem(SKEY); } catch (e) {} }
  function cacheKey() { return 'tdd_cache_v2_' + (SESSION ? SESSION.username.toLowerCase() : ''); }
  // localStorage solo como caché/respaldo: la fuente de verdad es Supabase.
  function load() { try { return Object.assign(empty(), JSON.parse(localStorage.getItem(cacheKey()) || '{}')); } catch (e) { return empty(); } }
  function save() { try { localStorage.setItem(cacheKey(), JSON.stringify(P)); } catch (e) {} }
  function fromServer(d) {
    var toSet = function (arr) { var o = {}; (arr || []).forEach(function (id) { o[id] = 1; }); return o; };
    P = { seen: toSet(d.seen), correct: toSet(d.correct), answered: d.answered || {}, days: d.days || [], streak: d.streak,
      points: d.points || 0, points_today: d.points_today || 0, level: d.level || null, badges: d.badges || [], scored_today: d.scored_today || null };
    var fresh = P.badges.filter(function (b) { return b.new; });
    if (fresh.length) { celebrateBadges(fresh); A.ackBadges(SESSION.token).catch(function () {}); P.badges.forEach(function (b) { b.new = false; }); }
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
      if (d.award && d.award.points > 0) toastPoints(d.award);
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
    $('#st-pts').textContent = P.points || 0;
    $('#st-lvl').textContent = P.level ? P.level.name : 'Novato';
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
      (isToday ? '<p class="hint" id="scorehint">' + (P.scored_today ? '✅ Ya usaste tu intento con puntos de hoy. Puedes seguir practicando.' : '🎯 Tu primer intento de hoy suma puntos.') + '</p>' : '<p class="hint">Los días anteriores son solo de práctica.</p>') +
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
        if (ok) { P.correct[t.id] = Date.now(); confetti(b); }
        markSeen(t); markPracticed(); if (isToday) send(t.id, 'mc', ok); else if (ok) send(t.id, 'self', true); stats();
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
    if (tab === 'perfil') renderProfile();
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

  // ===== Equipo: rankings, podio, premios y campeones =====
  var BADGES = [
    ['primer_acierto', '🌱', 'Primer acierto', 'Tu primera respuesta correcta'], ['racha_3', '🔥', 'Racha de 3', '3 días seguidos practicando'],
    ['racha_7', '🔥', 'Racha de 7', 'Una semana completa'], ['racha_30', '🌋', 'Racha de 30', '30 días seguidos'], ['racha_100', '💎', 'Racha de 100', '100 días seguidos'],
    ['aprendidos_10', '📘', '10 términos', '10 términos aprendidos'], ['aprendidos_50', '📚', '50 términos', '50 términos aprendidos'], ['aprendidos_100', '🎓', '100 términos', '100 términos aprendidos'],
    ['madrugador', '🌅', 'Madrugador', '5 aciertos antes de las 10:00 a.m.'], ['campeon_dia', '🥇', 'Campeón del día', 'Primer lugar de un día'],
    ['campeon_semana', '🏆', 'Campeón de la semana', 'Primer lugar de la semana'], ['campeon_mes', '👑', 'Campeón del mes', 'Primer lugar del mes'],
    ['perfecto_semanal', '⭐', 'Semana perfecta', '7 de 7 aciertos en una semana']
  ];
  var SCOPES = { hoy: 'Hoy', semana: 'Semana', mes: 'Mes', racha: 'Racha' }, scope = 'hoy';
  var PERIOD = { day: 'del día', week: 'de la semana', month: 'del mes' };
  function fmtShort(iso) { var p = String(iso).slice(0, 10).split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12)).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function fmtTime(ts) { return ts ? new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' }) : '—'; }
  function metric(r) { return scope === 'racha' ? r.streak + ' 🔥' : scope === 'hoy' ? r.correct + ' ✓ · ' + r.points + ' pts' : r.points + ' pts'; }
  function renderBoard() {
    var box = $('#board');
    $('#scopes').innerHTML = Object.keys(SCOPES).map(function (k) { return '<button class="' + (k === scope ? 'active' : '') + '" data-scope="' + k + '">' + SCOPES[k] + '</button>'; }).join('');
    $('#scopes').querySelectorAll('button').forEach(function (b) { b.onclick = function () { scope = b.dataset.scope; renderBoard(); }; });
    box.innerHTML = '<p class="empty">Cargando ranking…</p>';
    A.team(SESSION.token, scope).then(function (d) {
      var rows = d.ranking || [], pz = d.prizes || {}, prizeKey = { hoy: 'day', semana: 'week', mes: 'month' }[scope];
      var prizes = Object.keys(pz).length ? '<div class="prizes">' + ['day', 'week', 'month'].filter(function (k) { return pz[k]; }).map(function (k) {
        return '<div class="prize' + (k === prizeKey ? ' cur' : '') + '">🎁 <b>Ganador ' + PERIOD[k] + ':</b> ' + esc(pz[k]) + '</div>'; }).join('') + '</div>' : '';
      var top = rows.filter(function (r) { return r.rank <= 3 && (scope === 'racha' ? r.streak > 0 : r.points > 0); }).slice(0, 3);
      var order = [1, 0, 2], cls = ['p1', 'p2', 'p3'], medal = ['🥇', '🥈', '🥉'];
      var podium = top.length ? '<div class="podium">' + order.filter(function (i) { return top[i]; }).map(function (i) {
        var r = top[i];
        return '<div class="pod ' + cls[i] + (r.is_me ? ' me' : '') + '"><div class="medal">' + medal[i] + '</div><div class="pname">' + esc(r.username) + '</div><div class="pmet">' + metric(r) + '</div><div class="block">' + (i + 1) + '</div></div>';
      }).join('') + '</div>' : '<p class="empty">Aún nadie suma puntos en este período. ¡Sé el primero! 🚀</p>';
      var table = '<table class="board"><thead><tr><th>#</th><th>Usuario</th><th>Nivel</th><th>' + (scope === 'racha' ? 'Racha 🔥' : 'Puntos') + '</th><th>Aciertos</th>' + (scope === 'hoy' ? '<th>Hora</th>' : '') + '</tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr' + (r.is_me ? ' class="me"' : '') + '><td>' + r.rank + '</td><td>' + esc(r.username) + (r.is_me ? ' <small>(tú)</small>' : '') + '</td><td><small>' + esc(r.level) + '</small></td><td>' +
            (scope === 'racha' ? r.streak : r.points) + '</td><td>' + r.correct + '</td>' + (scope === 'hoy' ? '<td>' + fmtTime(r.first_at) + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table>';
      var hint = { hoy: 'Hoy: más aciertos, luego más puntos; empate → quien respondió primero.', semana: 'Semana (lun–dom): puntos acumulados.', mes: 'Mes: puntos acumulados.', racha: 'Racha actual de días practicando.' }[scope];
      var champs = (d.champions || []).slice(0, 15);
      var hist = '<h3>🏅 Campeones</h3>' + (champs.length ? '<ul class="champs">' + champs.map(function (c) {
        var ic = { day: '🥇', week: '🏆', month: '👑' }[c.type], lbl = c.type === 'day' ? 'Campeón del día · ' + fmtShort(c.start) : c.type === 'week' ? 'Campeón de la semana del ' + fmtShort(c.start) : 'Campeón del mes · ' + new Date(c.start + 'T12:00:00Z').toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        return '<li>' + ic + ' <b>' + esc(c.username) + '</b> <small>' + lbl + ' · ' + c.points + ' pts</small></li>'; }).join('') + '</ul>' : '<p class="hint">El primer campeón se corona al cerrar el día (7:55 a.m.).</p>');
      box.innerHTML = prizes + podium + table + '<p class="hint">' + hint + '</p>' + hist;
    }).catch(function (e) { if (e.code === '28000') return expired(); box.innerHTML = '<p class="empty">No se pudo cargar el ranking: ' + esc(e.message) + '</p>'; });
  }

  // ===== Perfil: nivel e insignias =====
  function renderProfile() {
    var lv = P.level || { name: 'Novato', min: 0, next: 50 }, pts = P.points || 0;
    var pct = lv.next ? Math.min(100, Math.round((pts - lv.min) * 100 / (lv.next - lv.min))) : 100;
    var earned = {}; (P.badges || []).forEach(function (b) { (earned[b.code] = earned[b.code] || []).push(b); });
    $('#profile').innerHTML = '<div class="lvl-card"><div class="lvl-name">' + esc(lv.name) + '</div><div class="lvl-pts">' + pts + ' pts · hoy +' + (P.points_today || 0) + '</div>' +
      '<div class="bar"><span style="width:' + pct + '%"></span></div><small>' + (lv.next ? 'Faltan ' + (lv.next - pts) + ' pts para el siguiente nivel' : '¡Nivel máximo!') + '</small></div>' +
      '<h3>Insignias</h3><div class="badges">' + BADGES.map(function (b) {
        var got = earned[b[0]];
        return '<div class="badge' + (got ? '' : ' locked') + '" title="' + esc(b[3]) + '"><div class="bi">' + b[1] + '</div><b>' + esc(b[2]) + '</b><small>' + esc(b[3]) + '</small>' + (got && got.length > 1 ? '<span class="cnt">×' + got.length + '</span>' : '') + '</div>';
      }).join('') + '</div>' +
      '<h3>¿Cómo se ganan puntos?</h3><ul class="rules"><li>+5 por practicar el día (responder o ver la respuesta modelo)</li><li>+10 si aciertas tu <b>primer</b> intento del día (uno por día; cada término puntúa una sola vez)</li>' +
      '<li>+5 bono madrugador si aciertas antes de las 10:00 a.m.</li><li>+3 si eres el primero del equipo en acertar hoy</li><li>Bonos de racha: 3 días +10 · 7 +25 · 14 +50 · 30 +100 · 60 +200 · 100 +300</li>' +
      '<li>Niveles: Novato 0 · Aprendiz 50 · Intermedio 150 · Avanzado 400 · Experto 800 · Maestro 1500</li></ul>';
  }

  // ===== Celebraciones =====
  function toastPoints(aw) {
    var el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = '<b>+' + aw.points + ' pts</b>' + aw.reasons.map(function (r) { return '<small>' + esc(r.label) + ' +' + r.points + '</small>'; }).join('');
    document.body.appendChild(el); setTimeout(function () { el.classList.add('out'); }, 2800); setTimeout(function () { el.remove(); }, 3400);
  }
  function celebrateBadges(list) {
    var el = document.createElement('div'); el.className = 'celebrate';
    el.innerHTML = '<div class="cbox"><div class="cbig">🎉</div><h3>¡Nueva' + (list.length > 1 ? 's insignias' : ' insignia') + '!</h3>' +
      list.map(function (b) { return '<div class="cb"><span>' + b.icon + '</span><div><b>' + esc(b.name) + '</b><small>' + esc(b.description) + '</small></div></div>'; }).join('') +
      '<button class="btn">¡Genial!</button></div>';
    document.body.appendChild(el); confetti(null, 160);
    el.querySelector('button').onclick = function () { el.remove(); };
  }
  function confetti(origin, n) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = document.createElement('canvas'), x = c.getContext('2d'), W = c.width = innerWidth, H = c.height = innerHeight;
    c.className = 'confetti'; document.body.appendChild(c);
    var r = origin ? origin.getBoundingClientRect() : { left: W / 2, top: H / 3, width: 0, height: 0 }, ox = r.left + r.width / 2, oy = r.top + r.height / 2;
    var cols = ['#ff2000', '#30d5c8', '#7c4dff', '#5b9bff', '#14151c', '#ff6a52'], ps = [];
    for (var i = 0; i < (n || 90); i++) { var a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 8; ps.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, s: 4 + Math.random() * 5, c: cols[i % cols.length], r: Math.random() * 6 }); }
    var t0 = performance.now();
    (function f(t) {
      x.clearRect(0, 0, W, H);
      ps.forEach(function (p) { p.vy += 0.3; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += 0.1; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); x.restore(); });
      if (t - t0 < 2200) requestAnimationFrame(f); else c.remove();
    })(t0);
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
  $('#prize-form').onsubmit = function (ev) {
    ev.preventDefault();
    var title = $('#prize-title').value.trim();
    A.setPrize(SESSION.token, $('#prize-period').value, title).then(function () { msg('#prize-msg', title ? 'Premio guardado. Ya se ve en la pestaña Equipo.' : 'Premio eliminado.', true); $('#prize-title').value = ''; })
      .catch(function (e) { msg('#prize-msg', e.message); });
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
