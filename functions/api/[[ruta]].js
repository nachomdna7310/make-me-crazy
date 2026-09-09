/* ============================================================
   API de los tres juegos Make Me Crazy
     POST /api/cuenta   entrar o crear la cuenta en la nube
     POST /api/guardar  subir el progreso y las marcas
     GET  /api/tabla    el ranking global de un juego
   Todo lo que llega del navegador se revisa aca: nombres, largos y numeros.
   Las marcas solo suben (MAX), asi un aparato atrasado nunca borra un record.
   ============================================================ */
const JUEGOS = ['maths', 'tildes', 'tabla', 'spermiox', 'sc'];
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
    if (ruta === 'vs' && request.method === 'POST') return await vs(request, env);
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
    `SELECT j.clave AS clave, j.nombre AS nombre, j.avatar AS avatar, j.nivel AS nivel, j.pts AS pts, j.partida AS partida,
            j.arcade60 AS arcade60, j.arcade120 AS arcade120, j.arcade180 AS arcade180,
            j.arcade300 AS arcade300, j.arcade600 AS arcade600,
            j.racha AS racha, j.aciertos AS aciertos, j.fallos AS fallos, j.medallas AS medallas,
            j.visto AS visto,
            COALESCE(v.gan, 0) AS vsGan, COALESCE(v.per, 0) AS vsPer, COALESCE(v.emp, 0) AS vsEmp
       FROM jugadores j
       LEFT JOIN marcasvs v ON v.juego = j.juego AND v.clave = j.clave
      WHERE j.juego = ?
      ORDER BY j.pts DESC, j.nivel DESC, j.partida DESC LIMIT 200`).bind(juego).all();
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
  if (fila.hash !== h) {
    /* la cuenta se habia publicado sola con una llave automatica del aparato:
       si el jugador la trae, puede cambiarla por la contrasena que eligio */
    const vieja = String(b.claveVieja == null ? '' : b.claveVieja).slice(0, 40);
    if (vieja.length >= 3 && fila.hash === await sha256(clave + ':' + vieja + ':' + SAL)) {
      await env.DB.prepare('UPDATE jugadores SET hash = ? WHERE juego = ? AND clave = ?').bind(h, juego, clave).run();
    } else {
      return json({ ok: false, error: 'clave' }, 403);
    }
  }
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

/* ============================================================
   VERSUS: amigos, chat y duelos 1 contra 1
   Todo pasa por POST /api/vs con un campo "op". Una sola ruta para
   no tener diez endpoints que autenticar por separado.
   El servidor es el reloj y el arbitro: los relojes de los celulares
   no se creen, y quien llego primero a una pregunta lo decide aca.

   Dos modos:
     'mismas'    los dos ven LA MISMA pregunta y gana el punto el que
                 conteste bien primero; ahi mismo pasan los dos a la
                 siguiente. Fallar te deja fuera de esa pregunta.
     'distintas' cada uno con su propia lista, a su ritmo. Gana el que
                 junte mas aciertos antes de que suene el reloj.
   ============================================================ */
const DUELO_MS = 60000;          // el primer minuto
const ALARGUE_MS = 30000;        // los 30 s extra si la cosa esta pareja
const VENTAJA = 10;              // diferencia de aciertos que cierra el duelo al minuto
const EN_LINEA_MS = 25000;       // cuanto dura la lucecita de "conectado"
const CUENTA_MS = 4000;          // cuenta regresiva antes de la primera pregunta
const RONDA_MS = 20000;          // si nadie contesta la pregunta compartida, se pasa igual

const texto = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
const sala = (x, y) => (x < y ? x + '|' + y : y + '|' + x);

/* quien manda la peticion: mismo hash que /cuenta, nada de sesiones */
async function quienEs(env, juego, b) {
  const clave = claveDe(b.nombre);
  if (!JUEGOS.includes(juego) || clave.length < 2) return null;
  const pass = String(b.clave == null ? '' : b.clave).slice(0, 40);
  if (pass.length < 3) return null;
  const f = await env.DB.prepare(
    'SELECT hash, nombre, avatar, nivel FROM jugadores WHERE juego = ? AND clave = ?').bind(juego, clave).first();
  if (!f) return null;
  if (f.hash !== await sha256(clave + ':' + pass + ':' + SAL)) return null;
  return { clave, nombre: f.nombre, avatar: f.avatar || '', nivel: f.nivel || 1 };
}

/* el duelo tal como lo ve cada uno: siempre "yo" y "el", nunca a/b */
function verDuelo(d, miClave, ahora) {
  if (!d) return null;
  const soyA = d.a === miClave;
  const mio = soyA ? 'a' : 'b';
  const suyo = soyA ? 'b' : 'a';
  return {
    id: d.id, estado: d.estado, reglas: d.reglas, modo: d.modo || 'distintas',
    nivel: d.nivel, semilla: d.semilla, soyA,
    empieza: d.empieza, termina: d.termina, alarga: d.alarga, ahora,
    ronda: d.ronda || 0, rondaDesde: d.rondaDesde || 0,
    yo: {
      nombre: d[mio + 'Nom'], avatar: d[mio + 'Av'], nivel: d[mio + 'Niv'],
      ok: d[mio + 'Ok'] || 0, fail: d[mio + 'Fail'] || 0, i: d[mio + 'I'] || 0,
      resp: d[mio + 'Resp'] == null ? -1 : d[mio + 'Resp'],
      revancha: !!d[mio + 'Rev']
    },
    el: {
      clave: d[suyo], nombre: d[suyo + 'Nom'], avatar: d[suyo + 'Av'], nivel: d[suyo + 'Niv'],
      ok: d[suyo + 'Ok'] || 0, fail: d[suyo + 'Fail'] || 0, i: d[suyo + 'I'] || 0,
      resp: d[suyo + 'Resp'] == null ? -1 : d[suyo + 'Resp'],
      revancha: !!d[suyo + 'Rev'],
      conectado: (ahora - (d[suyo + 'Visto'] || 0)) < EN_LINEA_MS
    },
    gano: d.ganoRonda || '', rendido: d.rendido || '', revanchaId: d.revanchaId || '',
    /* el resultado lo decide el servidor: los celulares pueden ir una lectura atras */
    resultado: d.estado !== 'fin' ? '' :
      (d.rendido ? (d.rendido === miClave ? 'perdi' : 'gane')
        : ((d[mio + 'Ok'] || 0) > (d[suyo + 'Ok'] || 0) ? 'gane'
          : ((d[mio + 'Ok'] || 0) < (d[suyo + 'Ok'] || 0) ? 'perdi' : 'empate')))
  };
}

const COLS_DUELO = `id, juego, estado, reglas, modo, nivel, semilla, ronda, rondaDesde, ganoRonda,
  a, aNom, aAv, aNiv, aOk, aFail, aI, aVisto, aRev, aResp,
  b, bNom, bAv, bNiv, bOk, bFail, bI, bVisto, bRev, bResp,
  empieza, termina, alarga, rendido, revanchaId, creado`;

async function miDuelo(env, juego, clave) {
  return await env.DB.prepare(
    `SELECT ${COLS_DUELO} FROM duelos WHERE juego = ? AND (a = ? OR b = ?)
       AND estado <> 'muerto' ORDER BY creado DESC LIMIT 1`).bind(juego, clave, clave).first();
}

/* el reloj vive aca: pasar de pregunta, alargar y cerrar lo decide el servidor */
async function correrReloj(env, d, ahora) {
  if (!d || d.estado !== 'juega') return d;

  /* en 'mismas', si nadie contesto la pregunta compartida, se pasa igual */
  if (d.modo === 'mismas' && ahora > d.empieza &&
      (ahora - (d.rondaDesde || d.empieza)) > RONDA_MS && ahora <= d.termina) {
    const r = (d.ronda || 0) + 1;
    await env.DB.prepare(
      "UPDATE duelos SET ronda = ?, rondaDesde = ?, ganoRonda = '' WHERE id = ? AND ronda = ?")
      .bind(r, ahora, d.id, d.ronda || 0).run();
    d.ronda = r; d.rondaDesde = ahora; d.ganoRonda = '';
  }

  if (ahora <= d.termina) return d;
  const dif = Math.abs((d.aOk || 0) - (d.bOk || 0));
  if (!d.alarga && dif < VENTAJA) {
    const nuevo = d.termina + ALARGUE_MS;
    await env.DB.prepare('UPDATE duelos SET alarga = 1, termina = ? WHERE id = ?').bind(nuevo, d.id).run();
    d.alarga = 1; d.termina = nuevo;
    return d;
  }
  const cerro = await env.DB.prepare(
    "UPDATE duelos SET estado = 'fin' WHERE id = ? AND estado <> 'fin'").bind(d.id).run();
  d.estado = 'fin';
  if (cerro.meta && cerro.meta.changes) await anotarDuelo(env, d);
  return d;
}

/* el historial de duelos de cada uno, para que salga en el ranking online.
   Va en su propia tabla y no en 'jugadores' para no tener que alterar la
   tabla que ya existe (ALTER TABLE no es repetible). */
async function anotarDuelo(env, d) {
  const aOk = d.aOk || 0, bOk = d.bOk || 0;
  const empate = !d.rendido && aOk === bOk;
  const ganoA = d.rendido ? (d.rendido === d.b) : (aOk > bOk);
  const ganoB = d.rendido ? (d.rendido === d.a) : (bOk > aOk);
  const sube = (clave, gano) => env.DB.prepare(
    `INSERT INTO marcasvs (juego, clave, gan, per, emp) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(juego, clave) DO UPDATE SET
         gan = gan + excluded.gan, per = per + excluded.per, emp = emp + excluded.emp`)
    .bind(d.juego, clave, gano ? 1 : 0, (!gano && !empate) ? 1 : 0, empate ? 1 : 0);
  await env.DB.batch([sube(d.a, ganoA), sube(d.b, ganoB)]);
}

async function limpiar(env, ahora) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM cola WHERE creado < ?').bind(ahora - 90000),
    env.DB.prepare('DELETE FROM duelos WHERE creado < ?').bind(ahora - 3600000),
    env.DB.prepare('DELETE FROM mensajes WHERE creado < ?').bind(ahora - 7 * 86400000)
  ]);
}

async function vs(request, env) {
  const b = await leerCuerpo(request);
  const juego = String(b.juego || '');
  const yo = await quienEs(env, juego, b);
  if (!yo) return json({ ok: false, error: 'clave' }, 403);
  const op = String(b.op || '');
  const ahora = Date.now();

  /* ---------- presencia + todo lo que el lobby necesita saber ---------- */
  if (op === 'sonar') {
    await env.DB.prepare(
      'INSERT INTO presencia (juego, clave, ts) VALUES (?, ?, ?) ' +
      'ON CONFLICT(juego, clave) DO UPDATE SET ts = excluded.ts').bind(juego, yo.clave, ahora).run();
    if (Math.random() < 0.05) await limpiar(env, ahora);

    const amigos = await env.DB.prepare(
      `SELECT j.clave AS clave, j.nombre AS nombre, j.avatar AS avatar, j.nivel AS nivel,
              j.pts AS pts, p.ts AS ts
         FROM amigos am JOIN jugadores j ON j.juego = am.juego AND j.clave = am.amigo
         LEFT JOIN presencia p ON p.juego = am.juego AND p.clave = am.amigo
        WHERE am.juego = ? AND am.clave = ? AND am.estado = 'ok'
        ORDER BY j.pts DESC LIMIT 100`).bind(juego, yo.clave).all();
    const piden = await env.DB.prepare(
      `SELECT j.clave AS clave, j.nombre AS nombre, j.avatar AS avatar, j.nivel AS nivel
         FROM amigos am JOIN jugadores j ON j.juego = am.juego AND j.clave = am.clave
        WHERE am.juego = ? AND am.amigo = ? AND am.estado = 'pide'
        LIMIT 50`).bind(juego, yo.clave).all();
    const filas = (amigos.results || []).map(a => ({
      clave: a.clave, nombre: a.nombre, avatar: a.avatar, nivel: a.nivel, pts: a.pts,
      conectado: (ahora - (a.ts || 0)) < EN_LINEA_MS
    }));
    /* ultimo mensaje de cada conversacion: el cliente compara con lo que ya vio */
    let ultimos = {};
    if (filas.length) {
      const r = await env.DB.prepare(
        `SELECT sala, MAX(id) AS ult FROM mensajes WHERE juego = ? AND sala IN (` +
        filas.map(() => '?').join(',') + ') GROUP BY sala')
        .bind(juego, ...filas.map(f => sala(yo.clave, f.clave))).all();
      (r.results || []).forEach(x => { ultimos[x.sala] = x.ult; });
    }
    const invita = await env.DB.prepare(
      `SELECT ${COLS_DUELO} FROM duelos WHERE juego = ? AND b = ? AND estado = 'invita'
         AND creado > ? ORDER BY creado DESC LIMIT 1`).bind(juego, yo.clave, ahora - 120000).first();
    let d = await miDuelo(env, juego, yo.clave);
    if (d && d.estado === 'invita') d = null;   /* las invitaciones van por su propio campo */
    d = await correrReloj(env, d, ahora);
    return json({
      ok: true, ahora, amigos: filas, piden: piden.results || [], ultimos,
      invita: invita ? {
        id: invita.id, clave: invita.a, nombre: invita.aNom, avatar: invita.aAv,
        nivel: invita.aNiv, reglas: invita.reglas, modo: invita.modo, nivelDuelo: invita.nivel
      } : null,
      duelo: verDuelo(d, yo.clave, ahora)
    });
  }

  /* ---------- buscar gente por nombre ---------- */
  if (op === 'buscar') {
    const q = texto(b.q, 18).toLowerCase();
    if (q.length < 2) return json({ ok: true, filas: [] });
    const r = await env.DB.prepare(
      `SELECT j.clave AS clave, j.nombre AS nombre, j.avatar AS avatar, j.nivel AS nivel, j.pts AS pts,
              (SELECT estado FROM amigos WHERE juego = j.juego AND clave = ? AND amigo = j.clave) AS mio,
              (SELECT estado FROM amigos WHERE juego = j.juego AND clave = j.clave AND amigo = ?) AS suyo
         FROM jugadores j
        WHERE j.juego = ? AND j.clave LIKE ? AND j.clave <> ?
        ORDER BY j.pts DESC LIMIT 25`)
      .bind(yo.clave, yo.clave, juego, '%' + q + '%', yo.clave).all();
    return json({ ok: true, filas: r.results || [] });
  }

  /* ---------- pedir, aceptar y quitar amigos ---------- */
  if (op === 'pedir' || op === 'aceptar' || op === 'quitar') {
    const otro = claveDe(b.a);
    if (otro.length < 2 || otro === yo.clave) return json({ ok: false, error: 'nombre' }, 400);
    const existe = await env.DB.prepare(
      'SELECT clave FROM jugadores WHERE juego = ? AND clave = ?').bind(juego, otro).first();
    if (!existe) return json({ ok: false, error: 'no-existe' }, 404);

    if (op === 'quitar') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM amigos WHERE juego = ? AND clave = ? AND amigo = ?').bind(juego, yo.clave, otro),
        env.DB.prepare('DELETE FROM amigos WHERE juego = ? AND clave = ? AND amigo = ?').bind(juego, otro, yo.clave)
      ]);
      return json({ ok: true });
    }
    if (op === 'aceptar') {
      const pide = await env.DB.prepare(
        'SELECT estado FROM amigos WHERE juego = ? AND clave = ? AND amigo = ?').bind(juego, otro, yo.clave).first();
      if (!pide) return json({ ok: false, error: 'no-te-pidio' }, 404);
      await env.DB.batch([
        env.DB.prepare("UPDATE amigos SET estado = 'ok' WHERE juego = ? AND clave = ? AND amigo = ?")
          .bind(juego, otro, yo.clave),
        env.DB.prepare("INSERT INTO amigos (juego, clave, amigo, estado, creado) VALUES (?, ?, ?, 'ok', ?) " +
          "ON CONFLICT(juego, clave, amigo) DO UPDATE SET estado = 'ok'").bind(juego, yo.clave, otro, ahora)
      ]);
      return json({ ok: true });
    }
    /* pedir: si el otro ya me habia pedido, quedan amigos al toque */
    const alReves = await env.DB.prepare(
      'SELECT estado FROM amigos WHERE juego = ? AND clave = ? AND amigo = ?').bind(juego, otro, yo.clave).first();
    if (alReves) {
      await env.DB.batch([
        env.DB.prepare("UPDATE amigos SET estado = 'ok' WHERE juego = ? AND clave = ? AND amigo = ?")
          .bind(juego, otro, yo.clave),
        env.DB.prepare("INSERT INTO amigos (juego, clave, amigo, estado, creado) VALUES (?, ?, ?, 'ok', ?) " +
          "ON CONFLICT(juego, clave, amigo) DO UPDATE SET estado = 'ok'").bind(juego, yo.clave, otro, ahora)
      ]);
      return json({ ok: true, yaSon: true });
    }
    await env.DB.prepare(
      "INSERT INTO amigos (juego, clave, amigo, estado, creado) VALUES (?, ?, ?, 'pide', ?) " +
      'ON CONFLICT(juego, clave, amigo) DO NOTHING').bind(juego, yo.clave, otro, ahora).run();
    return json({ ok: true });
  }

  /* ---------- el mini chat ---------- */
  if (op === 'chat' || op === 'decir') {
    const otro = claveDe(b.con);
    const amigo = await env.DB.prepare(
      "SELECT estado FROM amigos WHERE juego = ? AND clave = ? AND amigo = ? AND estado = 'ok'")
      .bind(juego, yo.clave, otro).first();
    if (!amigo) return json({ ok: false, error: 'no-son-amigos' }, 403);
    const s = sala(yo.clave, otro);
    if (op === 'decir') {
      const t = texto(b.texto, 200);
      if (!t) return json({ ok: false, error: 'vacio' }, 400);
      await env.DB.prepare('INSERT INTO mensajes (juego, sala, de, texto, creado) VALUES (?, ?, ?, ?, ?)')
        .bind(juego, s, yo.clave, t, ahora).run();
    }
    const r = await env.DB.prepare(
      'SELECT id, de, texto, creado FROM mensajes WHERE juego = ? AND sala = ? ORDER BY id DESC LIMIT 60')
      .bind(juego, s).all();
    return json({ ok: true, ahora, mensajes: (r.results || []).reverse() });
  }

  /* ---------- retar a un amigo ---------- */
  if (op === 'retar') {
    const otro = claveDe(b.a);
    const amigo = await env.DB.prepare(
      "SELECT estado FROM amigos WHERE juego = ? AND clave = ? AND amigo = ? AND estado = 'ok'")
      .bind(juego, yo.clave, otro).first();
    if (!amigo) return json({ ok: false, error: 'no-son-amigos' }, 403);
    const el = await env.DB.prepare(
      'SELECT nombre, avatar, nivel FROM jugadores WHERE juego = ? AND clave = ?').bind(juego, otro).first();
    if (!el) return json({ ok: false, error: 'no-existe' }, 404);
    await env.DB.prepare("UPDATE duelos SET estado = 'muerto' WHERE juego = ? AND estado = 'invita' AND a = ?")
      .bind(juego, yo.clave).run();
    const d = await crearDuelo(env, juego, yo,
      { clave: otro, nombre: el.nombre, avatar: el.avatar || '', nivel: el.nivel || 1 },
      texto(b.reglas, 300), modoDe(b.modo), 'invita', ahora);
    return json({ ok: true, duelo: verDuelo(d, yo.clave, ahora) });
  }

  /* ---------- rival al azar ---------- */
  if (op === 'azar') {
    const reglas = texto(b.reglas, 300);
    const modo = modoDe(b.modo);
    const firma = texto(b.firma, 120) + '#' + modo;
    const yaTengo = await miDuelo(env, juego, yo.clave);
    if (yaTengo && yaTengo.estado === 'juega') {
      return json({ ok: true, duelo: verDuelo(await correrReloj(env, yaTengo, ahora), yo.clave, ahora) });
    }
    /* me habian emparejado mientras esperaba */
    const mia = await env.DB.prepare('SELECT duelo FROM cola WHERE juego = ? AND clave = ?')
      .bind(juego, yo.clave).first();
    if (mia && mia.duelo) {
      const d = await env.DB.prepare(`SELECT ${COLS_DUELO} FROM duelos WHERE id = ?`).bind(mia.duelo).first();
      await env.DB.prepare('DELETE FROM cola WHERE juego = ? AND clave = ?').bind(juego, yo.clave).run();
      if (d) return json({ ok: true, duelo: verDuelo(d, yo.clave, ahora) });
    }
    /* para que dos que se buscan a la vez no armen dos duelos, solo empareja
       el de la clave menor; el otro se queda esperando y lo recoge */
    const rival = await env.DB.prepare(
      'SELECT clave, nombre, avatar, nivel FROM cola WHERE juego = ? AND firma = ? AND clave <> ? ' +
      'AND duelo IS NULL AND creado > ? ORDER BY creado LIMIT 1')
      .bind(juego, firma, yo.clave, ahora - 90000).first();
    if (rival && yo.clave < rival.clave) {
      const d = await crearDuelo(env, juego, yo, rival, reglas, modo, 'juega', ahora);
      await env.DB.batch([
        env.DB.prepare('UPDATE cola SET duelo = ? WHERE juego = ? AND clave = ?').bind(d.id, juego, rival.clave),
        env.DB.prepare('DELETE FROM cola WHERE juego = ? AND clave = ?').bind(juego, yo.clave)
      ]);
      return json({ ok: true, duelo: verDuelo(d, yo.clave, ahora) });
    }
    await env.DB.prepare(
      'INSERT INTO cola (juego, clave, nombre, avatar, nivel, reglas, firma, creado, duelo) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL) ' +
      'ON CONFLICT(juego, clave) DO UPDATE SET reglas = excluded.reglas, firma = excluded.firma, ' +
      'nivel = excluded.nivel, creado = excluded.creado, duelo = NULL')
      .bind(juego, yo.clave, yo.nombre, yo.avatar, yo.nivel, reglas, firma, ahora).run();
    const cuantos = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM cola WHERE juego = ? AND creado > ?').bind(juego, ahora - 90000).first();
    return json({ ok: true, esperando: true, enCola: (cuantos && cuantos.n) || 1 });
  }

  if (op === 'salirCola') {
    await env.DB.prepare('DELETE FROM cola WHERE juego = ? AND clave = ?').bind(juego, yo.clave).run();
    return json({ ok: true });
  }

  /* ---------- aceptar o rechazar una invitacion ---------- */
  if (op === 'entrar' || op === 'rechazar') {
    const id = texto(b.id, 40);
    const d = await env.DB.prepare(`SELECT ${COLS_DUELO} FROM duelos WHERE id = ? AND b = ?`)
      .bind(id, yo.clave).first();
    if (!d || d.estado !== 'invita') return json({ ok: false, error: 'no-hay' }, 404);
    if (op === 'rechazar') {
      await env.DB.prepare("UPDATE duelos SET estado = 'muerto' WHERE id = ?").bind(id).run();
      return json({ ok: true });
    }
    const empieza = ahora + CUENTA_MS;
    await env.DB.prepare(
      "UPDATE duelos SET estado = 'juega', empieza = ?, termina = ?, rondaDesde = ? WHERE id = ?")
      .bind(empieza, empieza + DUELO_MS, empieza, id).run();
    d.estado = 'juega'; d.empieza = empieza; d.termina = empieza + DUELO_MS; d.rondaDesde = empieza;
    return json({ ok: true, duelo: verDuelo(d, yo.clave, ahora) });
  }

  /* ---------- 'mismas': el arbitro de quien llego primero ---------- */
  if (op === 'responder') {
    const id = texto(b.id, 40);
    let d = await env.DB.prepare(`SELECT ${COLS_DUELO} FROM duelos WHERE id = ?`).bind(id).first();
    if (!d || (d.a !== yo.clave && d.b !== yo.clave)) return json({ ok: false, error: 'no-hay' }, 404);
    const mio = d.a === yo.clave ? 'a' : 'b';
    const suyo = mio === 'a' ? 'b' : 'a';
    if (d.estado === 'fin') return json({ ok: true, duelo: verDuelo(d, yo.clave, ahora) });
    const ronda = entero(b.ronda, 10000);
    const acierto = !!b.acierto;
    const rondaActual = d.ronda || 0;
    const yaRespondi = (d[mio + 'Resp'] == null ? -1 : d[mio + 'Resp']) >= rondaActual;

    /* llego tarde (ya paso la pregunta) o repetida: no cuenta, pero le devuelvo el estado */
    if (d.estado === 'juega' && ronda === rondaActual && !yaRespondi && ahora <= d.termina) {
      const partes = [`${mio}Resp = ?`, `${mio}Visto = ?`];
      const vals = [rondaActual, ahora];
      if (acierto) {
        partes.push(`${mio}Ok = ?`); vals.push((d[mio + 'Ok'] || 0) + 1);
        d[mio + 'Ok'] = (d[mio + 'Ok'] || 0) + 1;
      } else {
        partes.push(`${mio}Fail = ?`); vals.push((d[mio + 'Fail'] || 0) + 1);
        d[mio + 'Fail'] = (d[mio + 'Fail'] || 0) + 1;
      }
      /* la pregunta se cierra si alguien la gano, o si los dos ya fallaron */
      const otroYa = (d[suyo + 'Resp'] == null ? -1 : d[suyo + 'Resp']) >= rondaActual;
      const cierra = acierto || otroYa;
      if (cierra) {
        partes.push('ronda = ?', 'rondaDesde = ?', 'ganoRonda = ?');
        vals.push(rondaActual + 1, ahora, acierto ? yo.clave : '');
      }
      vals.push(id, rondaActual);
      await env.DB.prepare(`UPDATE duelos SET ${partes.join(', ')} WHERE id = ? AND ronda = ?`).bind(...vals).run();
      d[mio + 'Resp'] = rondaActual; d[mio + 'Visto'] = ahora;
      if (cierra) { d.ronda = rondaActual + 1; d.rondaDesde = ahora; d.ganoRonda = acierto ? yo.clave : ''; }
    } else {
      await env.DB.prepare(`UPDATE duelos SET ${mio}Visto = ? WHERE id = ?`).bind(ahora, id).run();
      d[mio + 'Visto'] = ahora;
    }
    d = await correrReloj(env, d, ahora);
    return json({ ok: true, duelo: verDuelo(d, yo.clave, ahora) });
  }

  /* ---------- 'distintas': cada uno reporta lo suyo ---------- */
  if (op === 'marcar' || op === 'mirar') {
    const id = texto(b.id, 40);
    let d = await env.DB.prepare(`SELECT ${COLS_DUELO} FROM duelos WHERE id = ?`).bind(id).first();
    if (!d || (d.a !== yo.clave && d.b !== yo.clave)) return json({ ok: false, error: 'no-hay' }, 404);
    const mio = d.a === yo.clave ? 'a' : 'b';
    /* si ya sono la bocina, los numeros quedan congelados: lo que llegue
       despues no puede mover el resultado que los dos ya estan viendo */
    if (d.estado === 'fin') return json({ ok: true, duelo: verDuelo(d, yo.clave, ahora) });
    if (op === 'marcar') {
      const ok = Math.max(entero(b.ok, 10000), d[mio + 'Ok'] || 0);
      const fail = Math.max(entero(b.fail, 10000), d[mio + 'Fail'] || 0);
      const i = Math.max(entero(b.i, 10000), d[mio + 'I'] || 0);
      await env.DB.prepare(
        `UPDATE duelos SET ${mio}Ok = ?, ${mio}Fail = ?, ${mio}I = ?, ${mio}Visto = ? WHERE id = ?`)
        .bind(ok, fail, i, ahora, id).run();
      d[mio + 'Ok'] = ok; d[mio + 'Fail'] = fail; d[mio + 'I'] = i; d[mio + 'Visto'] = ahora;
    } else {
      await env.DB.prepare(`UPDATE duelos SET ${mio}Visto = ? WHERE id = ?`).bind(ahora, id).run();
      d[mio + 'Visto'] = ahora;
    }
    d = await correrReloj(env, d, ahora);
    return json({ ok: true, duelo: verDuelo(d, yo.clave, ahora) });
  }

  /* ---------- rendirse / irse ---------- */
  if (op === 'rendirse') {
    const id = texto(b.id, 40);
    const d = await env.DB.prepare(`SELECT ${COLS_DUELO} FROM duelos WHERE id = ?`).bind(id).first();
    if (!d || (d.a !== yo.clave && d.b !== yo.clave)) return json({ ok: false, error: 'no-hay' }, 404);
    const cerro = await env.DB.prepare(
      "UPDATE duelos SET estado = 'fin', rendido = ? WHERE id = ? AND estado <> 'fin'").bind(yo.clave, id).run();
    if (cerro.meta && cerro.meta.changes) { d.rendido = yo.clave; await anotarDuelo(env, d); }
    return json({ ok: true });
  }

  /* ---------- revancha: cuando los dos la piden, sale duelo nuevo ---------- */
  if (op === 'revancha') {
    const id = texto(b.id, 40);
    const d = await env.DB.prepare(`SELECT ${COLS_DUELO} FROM duelos WHERE id = ?`).bind(id).first();
    if (!d || (d.a !== yo.clave && d.b !== yo.clave)) return json({ ok: false, error: 'no-hay' }, 404);
    if (d.revanchaId) return json({ ok: true, nuevo: d.revanchaId });
    const mio = d.a === yo.clave ? 'a' : 'b';
    const suyo = mio === 'a' ? 'b' : 'a';
    await env.DB.prepare(`UPDATE duelos SET ${mio}Rev = 1, ${mio}Visto = ? WHERE id = ?`).bind(ahora, id).run();
    d[mio + 'Rev'] = 1;
    if (!d[suyo + 'Rev']) return json({ ok: true, esperando: true, duelo: verDuelo(d, yo.clave, ahora) });
    /* el que aparece como "a" arma la revancha, el otro la recoge en el siguiente sondeo */
    if (d.a === yo.clave) {
      const nuevo = await crearDuelo(env, juego,
        { clave: d.a, nombre: d.aNom, avatar: d.aAv, nivel: d.aNiv },
        { clave: d.b, nombre: d.bNom, avatar: d.bAv, nivel: d.bNiv },
        d.reglas, d.modo, 'juega', ahora);
      await env.DB.prepare('UPDATE duelos SET revanchaId = ? WHERE id = ?').bind(nuevo.id, id).run();
      return json({ ok: true, nuevo: nuevo.id, duelo: verDuelo(nuevo, yo.clave, ahora) });
    }
    return json({ ok: true, esperando: true, duelo: verDuelo(d, yo.clave, ahora) });
  }

  if (op === 'traer') {
    const id = texto(b.id, 40);
    let d = await env.DB.prepare(`SELECT ${COLS_DUELO} FROM duelos WHERE id = ?`).bind(id).first();
    if (!d || (d.a !== yo.clave && d.b !== yo.clave)) return json({ ok: false, error: 'no-hay' }, 404);
    d = await correrReloj(env, d, ahora);
    return json({ ok: true, duelo: verDuelo(d, yo.clave, ahora) });
  }

  return json({ ok: false, error: 'op-desconocida' }, 400);
}

const modoDe = m => (String(m || '') === 'mismas' ? 'mismas' : 'distintas');

/* el nivel del duelo es el promedio de los dos: el fuerte baja un poco y el
   otro sube un poco, que es justo lo que hace interesante el 1 contra 1 */
async function crearDuelo(env, juego, A, B, reglas, modo, estado, ahora) {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const nivel = Math.max(1, Math.round(((A.nivel || 1) + (B.nivel || 1)) / 2));
  const semilla = Math.floor(Math.random() * 2147483646) + 1;
  const empieza = estado === 'juega' ? ahora + CUENTA_MS : null;
  const termina = empieza ? empieza + DUELO_MS : null;
  await env.DB.prepare(
    `INSERT INTO duelos (id, juego, estado, reglas, modo, nivel, semilla, ronda, rondaDesde, ganoRonda,
       a, aNom, aAv, aNiv, b, bNom, bAv, bNiv, empieza, termina, alarga, rendido, revanchaId, creado,
       aOk, aFail, aI, aVisto, aRev, aResp, bOk, bFail, bI, bVisto, bRev, bResp)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', '', ?,
       0,0,0,?,0,-1, 0,0,0,?,0,-1)`)
    .bind(id, juego, estado, reglas, modo, nivel, semilla, empieza || ahora,
      A.clave, A.nombre, A.avatar || '', A.nivel || 1,
      B.clave, B.nombre, B.avatar || '', B.nivel || 1,
      empieza, termina, ahora, ahora, ahora).run();
  return await env.DB.prepare(`SELECT ${COLS_DUELO} FROM duelos WHERE id = ?`).bind(id).first();
}
