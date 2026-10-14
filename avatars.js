/* Avatares originales (no son personajes con copyright). Evolucionan con el nivel. */
(function (root) {
  var LIST = [
    { id: 'spark', name: 'Chispa', blurb: 'Zorro de brasas' },
    { id: 'byte', name: 'Byte', blurb: 'Robot de bolsillo' },
    { id: 'luna', name: 'Luna', blurb: 'Gata lunar' },
    { id: 'nimbus', name: 'Nimbus', blurb: 'Búho nube' },
    { id: 'pico', name: 'Pico', blurb: 'Ave píxel' },
    { id: 'oro', name: 'Oro', blurb: 'Escarabajo geométrico' },
    { id: 'kiwi', name: 'Kiwi', blurb: 'Dragón pequeño' },
    { id: 'nova', name: 'Nova', blurb: 'Estrella viva' }
  ];
  var NAMES = ['Novato', 'Aprendiz', 'Intermedio', 'Avanzado', 'Experto', 'Maestro'];
  var MINS = [0, 50, 150, 400, 800, 1500];
  var PAL = {
    spark: { body: '#ff4040', belly: '#ffb4a2', ink: '#1a0a08', extra: '#ffd7a8' },
    byte: { body: '#e8e8ee', belly: '#ff2000', ink: '#141416', extra: '#9aa0b4' },
    luna: { body: '#f3e2a8', belly: '#fff8e8', ink: '#2a2112', extra: '#ff2000' },
    nimbus: { body: '#d5dbe6', belly: '#ffffff', ink: '#1c2433', extra: '#ff4040' },
    pico: { body: '#ffb089', belly: '#fff4ec', ink: '#2b140c', extra: '#ff2000' },
    oro: { body: '#f0c14a', belly: '#fff1c2', ink: '#2a1c04', extra: '#ff2000' },
    kiwi: { body: '#ff6a4a', belly: '#ffd0c4', ink: '#2a100c', extra: '#f5f5f7' },
    nova: { body: '#f5f5f7', belly: '#ff2000', ink: '#1a1a1e', extra: '#ff4040' }
  };

  function stageOf(level, points) {
    if (level && typeof level === 'object' && typeof level.n === 'number') return Math.max(0, Math.min(5, level.n - 1));
    var name = level && level.name ? level.name : (typeof level === 'string' ? level : '');
    if (name) { var i = NAMES.indexOf(name); if (i >= 0) return i; }
    var p = points || 0, s = 0;
    for (var k = 0; k < MINS.length; k++) if (p >= MINS[k]) s = k;
    return s;
  }
  function valid(id) { return LIST.some(function (c) { return c.id === id; }); }
  function meta(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return LIST[0]; }

  function eyes(y, stage, ink) {
    var r = 2.4 + Math.min(stage, 4) * 0.45;
    var open = '<circle cx="25" cy="' + y + '" r="' + r + '" fill="#fff"/><circle cx="39" cy="' + y + '" r="' + r + '" fill="#fff"/>';
    if (stage < 1) return '<circle cx="25" cy="' + y + '" r="1.5" fill="' + ink + '"/><circle cx="39" cy="' + y + '" r="1.5" fill="' + ink + '"/>';
    var pr = Math.max(1, r * 0.42);
    return open + '<circle cx="26" cy="' + (y + 0.3) + '" r="' + pr + '" fill="' + ink + '"/><circle cx="40" cy="' + (y + 0.3) + '" r="' + pr + '" fill="' + ink + '"/>';
  }
  function aura(stage, color) {
    if (stage < 3) return '';
    var o = (0.18 + (stage - 3) * 0.08).toFixed(2);
    return '<circle cx="32" cy="36" r="' + (20 + stage) + '" fill="' + color + '" opacity="' + o + '"/>';
  }
  function wings(stage, color) {
    if (stage < 4) return '';
    var op = stage >= 5 ? 0.95 : 0.75;
    return '<path d="M10 34 Q2 22 12 18 Q16 30 18 36 Z" fill="' + color + '" opacity="' + op + '"/>' +
      '<path d="M54 34 Q62 22 52 18 Q48 30 46 36 Z" fill="' + color + '" opacity="' + op + '"/>';
  }
  function crown(stage, ink) {
    if (stage < 5) return '';
    return '<path d="M22 16 L26 8 L32 14 L38 8 L42 16 Z" fill="#f0c14a" stroke="' + ink + '" stroke-width="1"/>';
  }
  function scarf(stage, color) {
    if (stage < 2 || stage >= 4) return '';
    return '<path d="M24 42 H40 L42 50 H30 L28 46 H24 Z" fill="' + color + '"/>';
  }
  function sparks(stage, color) {
    if (stage < 5) return '';
    return '<circle cx="10" cy="14" r="1.4" fill="' + color + '"/><circle cx="54" cy="16" r="1.2" fill="' + color + '"/><circle cx="50" cy="8" r="1" fill="' + color + '"/>';
  }

  function body(id, stage, p) {
    var g = 1 + stage * 0.03;
    var y = 34 - stage;
    if (id === 'byte') {
      return '<rect x="' + (20 - stage) + '" y="' + (22 - stage) + '" width="' + (24 + stage * 2) + '" height="' + (26 + stage) + '" rx="6" fill="' + p.body + '"/>' +
        '<rect x="24" y="' + (28 - stage * 0.3) + '" width="' + (16 + stage) + '" height="8" rx="2" fill="' + p.belly + '"/>' +
        '<rect x="30" y="' + (12 - stage) + '" width="4" height="' + (10 + stage) + '" rx="1" fill="' + p.extra + '"/>' +
        '<circle cx="32" cy="' + (12 - stage) + '" r="' + (2 + stage * 0.3) + '" fill="' + p.belly + '"/>';
    }
    if (id === 'luna') {
      return '<path d="M24 ' + (y - 16) + ' L28 ' + (y - 8) + ' L22 ' + (y - 6) + ' Z" fill="' + p.body + '"/>' +
        '<path d="M40 ' + (y - 16) + ' L44 ' + (y - 6) + ' L36 ' + (y - 8) + ' Z" fill="' + p.body + '"/>' +
        '<circle cx="32" cy="' + y + '" r="' + (12 * g) + '" fill="' + p.body + '"/>' +
        '<path d="M36 ' + (y - 4) + ' a8 8 0 1 0 0 10 a5 5 0 1 1 0 -10 Z" fill="' + p.extra + '" opacity="0.9"/>';
    }
    if (id === 'nimbus') {
      return '<ellipse cx="24" cy="' + (y + 2) + '" rx="10" ry="8" fill="' + p.body + '"/>' +
        '<ellipse cx="40" cy="' + (y + 2) + '" rx="10" ry="8" fill="' + p.body + '"/>' +
        '<ellipse cx="32" cy="' + (y - 4) + '" rx="' + (12 + stage) + '" ry="' + (11 + stage * 0.4) + '" fill="' + p.belly + '"/>' +
        '<path d="M26 ' + (y - 14) + ' l3 6 h-6 Z" fill="' + p.extra + '"/><path d="M38 ' + (y - 14) + ' l3 6 h-6 Z" fill="' + p.extra + '"/>';
    }
    if (id === 'pico') {
      return '<ellipse cx="32" cy="' + y + '" rx="' + (11 * g) + '" ry="' + (10 * g) + '" fill="' + p.body + '"/>' +
        '<path d="M40 ' + y + ' L52 ' + (y + 2) + ' L40 ' + (y + 6) + ' Z" fill="' + p.extra + '"/>' +
        (stage >= 1 ? '<path d="M18 ' + y + ' L8 ' + (y - 6 - stage) + ' L18 ' + (y + 6) + ' Z" fill="' + p.belly + '"/>' : '');
    }
    if (id === 'oro') {
      return '<ellipse cx="32" cy="' + (y + 2) + '" rx="' + (13 * g) + '" ry="' + (11 * g) + '" fill="' + p.body + '"/>' +
        '<path d="M32 ' + (y - 10) + ' L44 ' + y + ' L32 ' + (y + 12) + ' L20 ' + y + ' Z" fill="' + p.belly + '" opacity="0.85"/>' +
        (stage >= 3 ? '<path d="M22 ' + (y - 8) + ' L16 ' + (y - 16) + ' L26 ' + (y - 6) + ' Z" fill="' + p.extra + '"/><path d="M42 ' + (y - 8) + ' L48 ' + (y - 16) + ' L38 ' + (y - 6) + ' Z" fill="' + p.extra + '"/>' : '');
    }
    if (id === 'kiwi') {
      return '<ellipse cx="32" cy="' + (y + 2) + '" rx="' + (12 * g) + '" ry="' + (10 * g) + '" fill="' + p.body + '"/>' +
        '<ellipse cx="42" cy="' + (y + 2) + '" rx="6" ry="4" fill="' + p.belly + '"/>' +
        '<path d="M22 ' + (y - 8) + ' L18 ' + (y - 16 - stage) + ' L28 ' + (y - 6) + ' Z" fill="' + p.extra + '"/>' +
        '<path d="M18 ' + (y + 6) + ' Q10 ' + (y + 16) + ' 22 ' + (y + 12) + '" stroke="' + p.ink + '" fill="none" stroke-width="' + (1.4 + stage * 0.2) + '"/>';
    }
    if (id === 'nova') {
      var n = 4 + Math.min(stage, 2);
      var d = '';
      for (var i = 0; i < n * 2; i++) {
        var ang = -Math.PI / 2 + i * Math.PI / n;
        var rad = i % 2 ? 7 + stage : 14 + stage;
        var x = 32 + Math.cos(ang) * rad, yy = y + Math.sin(ang) * rad;
        d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + yy.toFixed(1) + ' ';
      }
      return '<path d="' + d + 'Z" fill="' + p.body + '"/>' + '<circle cx="32" cy="' + y + '" r="' + (3 + stage * 0.4) + '" fill="' + p.belly + '"/>';
    }
    /* spark: zorro */
    return '<path d="M18 ' + (y - 4) + ' L14 ' + (y - 16 - stage) + ' L26 ' + (y - 8) + ' Z" fill="' + p.body + '"/>' +
      '<path d="M46 ' + (y - 4) + ' L50 ' + (y - 16 - stage) + ' L38 ' + (y - 8) + ' Z" fill="' + p.body + '"/>' +
      '<circle cx="32" cy="' + y + '" r="' + (12 * g) + '" fill="' + p.body + '"/>' +
      '<ellipse cx="32" cy="' + (y + 4) + '" rx="6" ry="4" fill="' + p.belly + '"/>' +
      '<path d="M46 ' + (y + 4) + ' Q58 ' + (y + 8 + stage) + ' 48 ' + (y + 14) + '" stroke="' + p.extra + '" stroke-width="' + (3 + stage * 0.4) + '" fill="none" stroke-linecap="round"/>';
  }

  function svg(id, stage, size) {
    if (!valid(id)) id = 'spark';
    stage = Math.max(0, Math.min(5, stage | 0));
    size = size || 64;
    var p = PAL[id];
    var y = 34;
    return '<svg class="avatar s' + stage + '" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" role="img" aria-label="' + meta(id).name + ', ' + NAMES[stage] + '">' +
      aura(stage, p.extra) + wings(stage, p.belly) + body(id, stage, p) + eyes(y - 2, stage, p.ink) + scarf(stage, p.extra) + crown(stage, p.ink) + sparks(stage, p.extra) +
      '</svg>';
  }

  root.Avatars = { list: LIST, names: NAMES, mins: MINS, stageOf: stageOf, svg: svg, valid: valid, meta: meta };
})(typeof window !== 'undefined' ? window : globalThis);
