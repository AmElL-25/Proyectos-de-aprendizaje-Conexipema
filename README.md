# Término del Día
App estática (sin build ni backend). Abre `index.html` en el navegador o súbela a cualquier hosting estático.
- `terms.js`: banco de términos (generado desde `tools/gen.py` + `tools/d_*.py`).
- `schedule.js`: término diario determinista; cambia a las 7:55 a.m. hora Lima (UTC-5); sin repeticiones dentro de cada ciclo.
- Pruebas: `node tools/test.js` y `tools/headless.sh` (Chrome headless).
