/* ============================================================
   API de los tres juegos Make Me Crazy
     POST /api/cuenta   entrar o crear la cuenta en la nube
     POST /api/guardar  subir el progreso y las marcas
     GET  /api/tabla    el ranking global de un juego
   Todo lo que llega del navegador se revisa aca: nombres, largos y numeros.
   Las marcas solo suben (MAX), asi un aparato atrasado nunca borra un record.
   ============================================================ */
const JUEGOS = ['maths', 'tildes', 'tabla', 'spermiox'];
const SAL = 'make-me-crazy-2026';
const MAX_DATOS = 60000;            // el progreso de un jugador pesa ~3 KB

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });

async function sha256(txt) {
  const b = new TextEncoder().encode(txt);
  const h = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const limpiarNombre = n => String(n == null ? '' : n).replace(/\s+/g, ' ').trim().slice(0, 18);
const claveDe = n => limpiarNombre(n).toLowerCase();
// spermiox cuenta espermatozoides: los totales llegan a miles de millones,
// asi que el tope es el entero seguro de JavaScript, no 99 millones.
const entero = (v, max = 9000000000000000) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

export async function onRequest(context) {
  const { request, env, params } = context;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const ruta = (Array.isArray(params.ruta) ? params.ruta.join('/') : params.ruta || '').toLowerCase();
  if (!env.DB) return json({ ok: false, error: 'sin-base' }, 500);

  try {
    if (ruta === 'tabla' && request.method === 'GET') return await tabla(request, env);
    if (ruta === 'cuenta' && request.method === 'POST') return await cuenta(request, env);
    if (ruta === 'guardar' && request.method === 'POST') return await guardar(request, env);
    return json({ ok: false, error: 'ruta-desconocida' }, 404);
  } catch (e) {
    return json({ ok: false, error: 'servidor', detalle: String(e && e.message || e).slice(0, 200) }, 500);
  }
}

async function leerCuerpo(request) {
  const txt = await request.text();
  if (txt.length > MAX_DATOS) throw new Error('cuerpo muy grande');
  return JSON.parse(txt || '{}');
}

/* ---------- el ranking global ---------- */
async function tabla(request, env) {
  const url = new URL(request.url);
  const juego = String(url.searchParams.get('juego') || '');
  if (!JUEGOS.includes(juego)) return json({ ok: false, error: 'juego' }, 400);
  const r = await env.DB.prepare(
    `SELECT nombre, avatar, nivel, pts, partida, arcade60, arcade120, arcade180, arcade300, arcade600,
            racha, aciertos, fallos, medallas, visto
       FROM jugadores WHERE juego = ?
      ORDER BY pts DESC, nivel DESC, partida DESC LIMIT 200`).bind(juego).all();
  return json({ ok: true, filas: r.results || [] });
}

/* ---------- entrar o crear la cuenta ---------- */
async function cuenta(request, env) {
  const b = await leerCuerpo(request);
  const juego = String(b.juego || '');
  const nombre = limpiarNombre(b.nombre);
  const clave = claveDe(b.nombre);
  if (!JUEGOS.includes(juego)) return json({ ok: false, error: 'juego' }, 400);
  if (clave.length < 2) return json({ ok: false, error: 'nombre-corto' }, 400);
  const pass = String(b.clave == null ? '' : b.clave).slice(0, 40);
  if (pass.length < 3) return json({ ok: false, error: 'clave-corta' }, 400);
  const h = await sha256(clave + ':' + pass + ':' + SAL);

  const fila = await env.DB.prepare(
    'SELECT hash, datos, peso, avatar FROM jugadores WHERE juego = ? AND clave = ?').bind(juego, clave).first();

  if (!fila) {
    await env.DB.prepare(
      `INSERT INTO jugadores (juego, clave, nombre, hash, avatar, datos, peso, visto)
       VALUES (?, ?, ?, ?, '', '', 0, ?)`)
      .bind(juego, clave, nombre, h, new Date().toISOString().slice(0, 10)).run();
    return json({ ok: true, nueva: true, datos: null, peso: 0 });
  }
  if (fila.hash !== h) return json({ ok: false, error: 'clave' }, 403);
  return json({ ok: true, nueva: false, datos: fila.datos || null, peso: fila.peso || 0, avatar: fila.avatar || '' });
}

/* ---------- subir progreso y marcas ---------- */
async function guardar(request, env) {
  const b = await leerCuerpo(request);
  const juego = String(b.juego || '');
  const nombre = limpiarNombre(b.nombre);
  const clave = claveDe(b.nombre);
  if (!JUEGOS.includes(juego)) return json({ ok: false, error: 'juego' }, 400);
  const pass = String(b.clave == null ? '' : b.clave).slice(0, 40);
  const h = await sha256(clave + ':' + pass + ':' + SAL);

  const fila = await env.DB.prepare(
    `SELECT hash, peso, nivel, pts, partida, arcade60, arcade120, arcade180, arcade300, arcade600,
            racha, aciertos, fallos, medallas FROM jugadores WHERE juego = ? AND clave = ?`)
    .bind(juego, clave).first();
  if (!fila) return json({ ok: false, error: 'no-existe' }, 404);
  if (fila.hash !== h) return json({ ok: false, error: 'clave' }, 403);

  const m = b.marcas || {};
  const datos = typeof b.datos === 'string' ? b.datos.slice(0, MAX_DATOS) : '';
  const peso = entero(m.peso);
  const nuevo = {
    nivel: Math.max(entero(m.nivel, 100000), fila.nivel || 0),
    pts: Math.max(entero(m.pts), fila.pts || 0),
    partida: Math.max(entero(m.partida), fila.partida || 0),
    arcade60: Math.max(entero(m.arcade60, 100000), fila.arcade60 || 0),
    arcade120: Math.max(entero(m.arcade120, 100000), fila.arcade120 || 0),
    arcade180: Math.max(entero(m.arcade180, 100000), fila.arcade180 || 0),
    arcade300: Math.max(entero(m.arcade300, 100000), fila.arcade300 || 0),
    arcade600: Math.max(entero(m.arcade600, 100000), fila.arcade600 || 0),
    racha: Math.max(entero(m.racha, 100000), fila.racha || 0),
    aciertos: Math.max(entero(m.aciertos), fila.aciertos || 0),
    fallos: Math.max(entero(m.fallos), fila.fallos || 0),
    medallas: Math.max(entero(m.medallas, 200), fila.medallas || 0)
  };
  /* el progreso completo solo se reemplaza si el que llega trae mas ejercicios
     jugados que el guardado: asi un aparato viejo no pisa lo nuevo */
  const guardaDatos = datos && peso >= (fila.peso || 0);

  await env.DB.prepare(
    `UPDATE jugadores SET nombre = ?, avatar = ?, nivel = ?, pts = ?, partida = ?, arcade60 = ?,
        arcade120 = ?, arcade180 = ?, arcade300 = ?, arcade600 = ?,
        racha = ?, aciertos = ?, fallos = ?, medallas = ?, visto = ?
        ${guardaDatos ? ', datos = ?, peso = ?' : ''}
      WHERE juego = ? AND clave = ?`)
    .bind(...[nombre, String(b.avatar || '').slice(0, 8), nuevo.nivel, nuevo.pts, nuevo.partida,
      nuevo.arcade60, nuevo.arcade120, nuevo.arcade180, nuevo.arcade300, nuevo.arcade600,
      nuevo.racha, nuevo.aciertos, nuevo.fallos, nuevo.medallas,
      new Date().toISOString().slice(0, 10)]
      .concat(guardaDatos ? [datos, peso] : [])
      .concat([juego, clave])).run();

  /* ¿es record del grupo? se mira contra los demas, no contra uno mismo */
  const top = await env.DB.prepare(
    `SELECT nombre, partida, arcade60, nivel, racha FROM jugadores
      WHERE juego = ? AND clave <> ? ORDER BY partida DESC LIMIT 1`).bind(juego, clave).first();
  const lider = await env.DB.prepare(
    `SELECT MAX(partida) AS partida, MAX(nivel) AS nivel, MAX(racha) AS racha, MAX(pts) AS pts,
            MAX(arcade60) AS arcade60, MAX(arcade120) AS arcade120, MAX(arcade180) AS arcade180,
            MAX(arcade300) AS arcade300, MAX(arcade600) AS arcade600
       FROM jugadores WHERE juego = ? AND clave <> ?`).bind(juego, clave).first() || {};
  const mejorArc = Math.max(nuevo.arcade60, nuevo.arcade120, nuevo.arcade180, nuevo.arcade300, nuevo.arcade600);
  const mejorArcLider = Math.max(lider.arcade60 || 0, lider.arcade120 || 0, lider.arcade180 || 0,
                                 lider.arcade300 || 0, lider.arcade600 || 0);

  return json({
    ok: true,
    guardado: !!guardaDatos,
    marcas: nuevo,
    lider: { nombre: top ? top.nombre : '', partida: (lider.partida || 0), arcade60: (lider.arcade60 || 0), nivel: (lider.nivel || 0), racha: (lider.racha || 0) },
    records: {
      partida: nuevo.partida > (lider.partida || 0),
      arcade60: mejorArc > mejorArcLider,
      nivel: nuevo.nivel > (lider.nivel || 0),
      racha: nuevo.racha > (lider.racha || 0),
      pts: nuevo.pts > (lider.pts || 0)
    }
  });
}
