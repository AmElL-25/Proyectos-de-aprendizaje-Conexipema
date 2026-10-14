# Término del Día
App estática (sin build) para el equipo: un concepto nuevo cada día (cambia a las **7:55 a.m. hora Lima**), con cuentas de usuario, progreso en la nube y ranking del equipo.

- `terms.js`: banco de términos (generado desde `tools/gen.py` + `tools/d_*.py`).
- `schedule.js`: término diario determinista; sin repeticiones dentro de cada ciclo.
- `config.js`: URL y clave publicable de Supabase (es pública por diseño; los datos están protegidos por las funciones RPC).
- `api.js`: cliente mínimo de las funciones RPC.
- `app.js`: interfaz. `localStorage` solo se usa como caché y cola offline; la fuente de verdad es Supabase.
- `supabase/migrations/`: esquema y funciones de la base de datos.
- Pruebas: `node tools/test.js` y `tools/headless.sh` (Chrome headless).

## Cuentas (sin correo)
Cada compañero entra a la app → **Crear cuenta** → elige un **usuario** (3–30 caracteres: letras, números, `.`, `-`, `_`; no distingue mayúsculas) y una **contraseña** (mín. 6). No se pide correo ni confirmación. Cada uno puede cambiar su contraseña en **Ajustes**.

## Racha y ranking
- Un “día” va de 7:55 a.m. a 7:54 a.m. (hora Lima), igual que el término diario.
- Cuenta como práctica responder la pregunta de opción múltiple o ver la respuesta modelo.
- Racha = días consecutivos con práctica; sigue viva si practicaste ayer aunque hoy aún no.
- Pestaña **Equipo**: ranking por racha actual, luego términos aprendidos (respondidos bien o autoevaluados “Sí”) y respuestas correctas.

## Puntos, niveles e insignias (calculados en el servidor)
- **+5** práctica del día (responder la opción múltiple o ver la respuesta modelo; una vez por día).
- **+10** si aciertas tu **único intento puntuado del día** (el primer intento de opción múltiple del término de hoy; cada término puntúa una sola vez por persona). Los días anteriores son solo práctica.
- **+5** bono madrugador si aciertas entre 7:55 y 10:00 a.m. · **+3** si eres el primero del equipo en acertar hoy.
- Bonos de racha al llegar a 3/7/14/30/60/100 días: +10/+25/+50/+100/+200/+300.
- Niveles: Novato 0 · Aprendiz 50 · Intermedio 150 · Avanzado 400 · Experto 800 · Maestro 1500.
- Insignias: Primer acierto, Racha 3/7/30/100, 10/50/100 términos, Madrugador (5 aciertos antes de las 10), Campeón del día/semana/mes, Semana perfecta (7/7). Al ganar una aparece una celebración.

## Rankings y campeones
Pestaña **Equipo** con Hoy (aciertos → puntos → quien respondió primero), Semana (lun–dom, puntos), Mes (puntos) y Racha, con podio top 3.
Al cerrar cada día (7:55 a.m.), semana o mes se corona automáticamente al campeón (historial “Campeones”).

## Administración (restablecer contraseñas)
1. Luis crea su cuenta normalmente en la app.
2. Una sola vez, en Supabase → SQL Editor:
   ```sql
   update tdd.users set is_admin = true where lower(username) = lower('TU_USUARIO');
   ```
3. Cierra sesión y vuelve a entrar. En **Ajustes** aparecerá **Administración** (también para definir **premios** por día/semana/mes, p. ej. “Ganador del mes: almuerzo”): escribe el usuario del compañero y una contraseña temporal. Eso también cierra sus sesiones abiertas; luego él puede cambiarla en Ajustes.

## Base de datos (Supabase)
Esquema privado `tdd` (no expuesto por la API; RLS activado sin políticas): `users` (hash bcrypt), `sessions` (hash SHA-256 del token, 90 días), `term_progress`, `practice_days`.
Solo se accede mediante funciones `SECURITY DEFINER` en `public` (RPC `POST /rest/v1/rpc/<nombre>`):

| Función | Parámetros | Devuelve |
|---|---|---|
| `tdd_register` | `p_username, p_password` | progreso + `token` |
| `tdd_login` | `p_username, p_password` | progreso + `token` |
| `tdd_logout` | `p_token` | — |
| `tdd_get_progress` | `p_token` | progreso |
| `tdd_record` | `p_token, p_term_id, p_event` (`seen`/`mc`/`reveal`/`self`), `p_correct` | progreso |
| `tdd_leaderboard` | `p_token` | filas `rank, username, current_streak, terms_learned, correct_answers, terms_seen, is_me` |
| `tdd_change_password` | `p_token, p_old, p_new` | — |
| `tdd_team` | `p_token, p_scope` (`hoy`/`semana`/`mes`/`racha`) | `{ranking[], prizes{day,week,month}, champions[]}` |
| `tdd_ack_badges` | `p_token` | — (marca insignias como vistas) |
| `tdd_admin_set_prize` | `p_token, p_period` (`day`/`week`/`month`), `p_title` (vacío = quitar) | — (solo admin) |
| `tdd_admin_reset_password` | `p_token, p_username, p_new_password` | — (solo admin) |

“Progreso” = `{username, is_admin, seen[], correct[], answered{}, days[], streak, today, points, points_today, level, scored_today, badges[]}`; `tdd_record` añade `award {points, reasons[], scored}`. Errores: `28000` sesión inválida, `28P01` credenciales, `23505` usuario existe, `22023` dato inválido, `42501` no admin.
