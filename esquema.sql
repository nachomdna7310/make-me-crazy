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
