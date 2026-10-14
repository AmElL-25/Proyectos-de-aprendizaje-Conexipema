/* Lógica de calendario: término diario según hora de Lima (UTC-5, sin horario de verano). */
(function (root) {
  var LIMA_OFFSET_MIN = -300;            // UTC-5
  var CHANGE_H = 7, CHANGE_M = 55;       // cambio a las 7:55 a.m. hora Lima
  var DAY = 86400000;
  // Día 0 del calendario: 13-oct-2026 7:55 a.m. Lima = 12:55 UTC
  var EPOCH = Date.UTC(2026, 9, 13, 12, 55);

  function rng(seed) { // mulberry32
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }

  // Orden de un ciclo: niveles 1→3; dentro de cada nivel, categorías intercaladas y mezcladas con semilla fija.
  var cache = {};
  function cycleOrder(terms, cycle) {
    var key = cycle + ':' + terms.length;
    if (cache[key]) return cache[key];
    var r = rng(20261013 + cycle * 7919), order = [];
    [1, 2, 3].forEach(function (lvl) {
      var byCat = {};
      terms.forEach(function (t, i) { if (t.level === lvl) (byCat[t.category] = byCat[t.category] || []).push(i); });
      var cats = shuffle(Object.keys(byCat).sort(), r);
      cats.forEach(function (c) { shuffle(byCat[c], r); });
      var left = true;
      while (left) { left = false; cats.forEach(function (c) { if (byCat[c].length) { order.push(byCat[c].shift()); left = true; } }); }
    });
    return (cache[key] = order);
  }

  function dayIndex(nowMs) { return Math.floor((nowMs - EPOCH) / DAY); }
  function mod(a, n) { return ((a % n) + n) % n; }
  function termIndexForDay(terms, idx) {
    var n = terms.length, cycle = Math.floor(idx / n);
    return cycleOrder(terms, cycle)[mod(idx, n)];
  }
  // Fecha (Lima) en que empezó el día idx, como "AAAA-MM-DD"
  function dateKeyForDay(idx) { return new Date(EPOCH + idx * DAY).toISOString().slice(0, 10); }
  function limaDateKey(nowMs) { return new Date(nowMs + LIMA_OFFSET_MIN * 60000).toISOString().slice(0, 10); }
  function nextChange(nowMs) { return EPOCH + (dayIndex(nowMs) + 1) * DAY; }

  var api = { EPOCH: EPOCH, DAY: DAY, dayIndex: dayIndex, termIndexForDay: termIndexForDay, cycleOrder: cycleOrder,
    dateKeyForDay: dateKeyForDay, limaDateKey: limaDateKey, nextChange: nextChange, rng: rng, shuffle: shuffle };
  root.Schedule = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
