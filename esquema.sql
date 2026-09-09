-- Una fila por jugador y por juego.
-- Los records solo suben: al guardar se toma el maximo entre lo que llega y lo
-- que ya estaba, asi ningun aparato atrasado puede borrar una marca vieja.
CREATE TABLE IF NOT EXISTS jugadores (
  juego     TEXT NOT NULL,          -- maths | tildes | tabla | spermiox
  clave     TEXT NOT NULL,          -- nombre normalizado (minusculas, sin espacios de mas)
  nombre    TEXT NOT NULL,          -- como se ve en la tabla
  hash      TEXT NOT NULL,          -- SHA-256 de la contrasena (nunca se guarda la contrasena)
  avatar    TEXT DEFAULT '',
  datos     TEXT DEFAULT '',        -- el progreso completo, para entrar desde otro aparato
  peso      INTEGER DEFAULT 0,      -- ejercicios respondidos: sirve para saber que copia es la mas nueva
  nivel     INTEGER DEFAULT 1,
  pts       INTEGER DEFAULT 0,
  partida   INTEGER DEFAULT 0,      -- mejor partida
  arcade60  INTEGER DEFAULT 0,      -- records del contrarreloj, uno por duracion
  arcade120 INTEGER DEFAULT 0,
  arcade180 INTEGER DEFAULT 0,
  arcade300 INTEGER DEFAULT 0,
  arcade600 INTEGER DEFAULT 0,
  racha     INTEGER DEFAULT 0,      -- mejor racha
  aciertos  INTEGER DEFAULT 0,
  fallos    INTEGER DEFAULT 0,
  medallas  INTEGER DEFAULT 0,
  visto     TEXT DEFAULT '',        -- ultima vez que jugo
  PRIMARY KEY (juego, clave)
);
CREATE INDEX IF NOT EXISTS idx_tabla ON jugadores (juego, pts DESC, nivel DESC);

/* ---------- VERSUS: amigos, chat y duelos 1v1 ---------- */
CREATE TABLE IF NOT EXISTS amigos (
  juego  TEXT NOT NULL,
  clave  TEXT NOT NULL,
  amigo  TEXT NOT NULL,
  estado TEXT NOT NULL,           -- 'pide' = yo se lo pedi | 'ok' = son amigos
  creado INTEGER NOT NULL,
  PRIMARY KEY (juego, clave, amigo)
);
CREATE INDEX IF NOT EXISTS ix_amigos_amigo ON amigos (juego, amigo, estado);

CREATE TABLE IF NOT EXISTS presencia (
  juego TEXT NOT NULL,
  clave TEXT NOT NULL,
  ts    INTEGER NOT NULL,
  PRIMARY KEY (juego, clave)
);

CREATE TABLE IF NOT EXISTS mensajes (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  juego  TEXT NOT NULL,
  sala   TEXT NOT NULL,           -- las dos claves ordenadas y unidas con |
  de     TEXT NOT NULL,
  texto  TEXT NOT NULL,
  creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_mensajes ON mensajes (juego, sala, id);

CREATE TABLE IF NOT EXISTS duelos (
  id         TEXT PRIMARY KEY,
  juego      TEXT NOT NULL,
  estado     TEXT NOT NULL,       -- 'invita' | 'juega' | 'fin' | 'muerto'
  reglas     TEXT NOT NULL,
  modo       TEXT NOT NULL,       -- 'mismas' | 'distintas'
  nivel      INTEGER NOT NULL,    -- el promedio de los dos
  semilla    INTEGER NOT NULL,    -- con esto los dos aparatos arman las mismas preguntas
  ronda      INTEGER DEFAULT 0,
  rondaDesde INTEGER DEFAULT 0,
  ganoRonda  TEXT DEFAULT '',
  a     TEXT NOT NULL, aNom TEXT, aAv TEXT, aNiv INTEGER,
  aOk   INTEGER DEFAULT 0, aFail INTEGER DEFAULT 0, aI INTEGER DEFAULT 0,
  aVisto INTEGER DEFAULT 0, aRev INTEGER DEFAULT 0, aResp INTEGER DEFAULT -1,
  b     TEXT NOT NULL, bNom TEXT, bAv TEXT, bNiv INTEGER,
  bOk   INTEGER DEFAULT 0, bFail INTEGER DEFAULT 0, bI INTEGER DEFAULT 0,
  bVisto INTEGER DEFAULT 0, bRev INTEGER DEFAULT 0, bResp INTEGER DEFAULT -1,
  empieza INTEGER, termina INTEGER, alarga INTEGER DEFAULT 0,
  rendido TEXT DEFAULT '', revanchaId TEXT DEFAULT '',
  creado INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_duelos_jug ON duelos (juego, a, creado);
CREATE INDEX IF NOT EXISTS ix_duelos_jug2 ON duelos (juego, b, creado);

CREATE TABLE IF NOT EXISTS cola (
  juego  TEXT NOT NULL,
  clave  TEXT NOT NULL,
  nombre TEXT, avatar TEXT, nivel INTEGER,
  reglas TEXT, firma TEXT,
  creado INTEGER NOT NULL,
  duelo  TEXT,
  PRIMARY KEY (juego, clave)
);
CREATE INDEX IF NOT EXISTS ix_cola ON cola (juego, firma, creado);

CREATE TABLE IF NOT EXISTS marcasvs (
  juego TEXT NOT NULL,
  clave TEXT NOT NULL,
  gan INTEGER DEFAULT 0,
  per INTEGER DEFAULT 0,
  emp INTEGER DEFAULT 0,
  PRIMARY KEY (juego, clave)
);
