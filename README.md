# Make Me Crazy · tres juegos de aula

Tres juegos hechos para el colegio. Cada uno es **un solo archivo HTML**: no necesitan
internet, ni instalador, ni cuentas online. El progreso, las medallas y la tabla de
clasificación se guardan en el propio aparato.

| Juego | Qué practica |
|---|---|
| 🧠 **[Maths Make Me Crazy](maths/)** | Cálculo mental por niveles: sumas, restas, multiplicaciones, divisiones y combinadas. Se responde **escribiendo** o **eligiendo entre 4 alternativas**. |
| ✏️ **[Tildes Make Me Crazy](tildes/)** | Acentuación: 332 palabras con agudas/graves/esdrújulas, hiatos, diacríticas, los cuatro porqués, plurales y las excepciones. |
| ⚗️ **[Tabla Make Me Crazy](tabla/)** | Los 118 elementos: número atómico, símbolo y nombre cruzados en 6 tipos de pregunta, con 4 alternativas. |

Los tres comparten el mismo motor: cuentas locales con PIN, niveles, ligas, medallas,
misión del día, modo carrera / entrenar / contrarreloj, repaso de lo que fallaste y
**aviso de récord propio y récord de la tabla de clasificación al terminar cada partida**.

---

## 📱 Android e iPhone

Abre el link del juego en el celular y agrégalo a la pantalla de inicio. Queda con su
ícono, se abre en pantalla completa y **funciona sin internet** después de la primera vez.

- **Android (Chrome):** menú de tres puntitos ⋮ → *Instalar aplicación*.
- **iPhone (Safari):** botón compartir → *Agregar a inicio*.

## 💻 Windows

1. Descarga el repositorio (botón verde **Code → Download ZIP**) y descomprímelo.
2. Clic derecho en `windows/InstalarEnElEscritorio.ps1` → **Ejecutar con PowerShell**.
3. Quedan los tres accesos directos en el Escritorio, cada uno abre su juego en ventana
   de aplicación.

## 🍎 Mac

1. Descarga el repositorio (**Code → Download ZIP**) y descomprímelo.
2. Los tres `.app` están en la carpeta `mac/`. Arrástralos a *Aplicaciones*.
3. La primera vez, si macOS reclama porque no viene de la App Store: clic derecho sobre
   la app → *Abrir* → *Abrir*.
4. Si al abrir no pasa nada, es que el ZIP perdió el permiso de ejecución. En Terminal:
   `chmod +x "/Applications/Maths Make Me Crazy.app/Contents/MacOS/run"` (igual para los otros dos).

---

## Estructura

```
maths/  tildes/  tabla/     el juego (index.html) + manifest + service worker + iconos
mac/                        los tres .app listos para arrastrar a Aplicaciones
windows/                    script que deja los accesos directos en el Escritorio
index.html                  portada con los tres juegos (la que se abre en el celular)
```

## Autocomprobación

Cada juego trae su propio test: se abre `index.html?test` y tiene que decir `RESULT=OK`
arriba a la izquierda. Revisa el banco de datos, la curva de niveles, las medallas, el
multiusuario y juega una partida completa por la interfaz.

## Dónde queda el progreso

En el `localStorage` del navegador, con una llave distinta por juego (`crazymath`,
`tildes`, `tabla`), así que los tres conviven sin pisarse. Es **por aparato**: cada
computador o celular tiene su propia tabla de clasificación. Dentro de cada juego,
*MIS NÚMEROS → COPIAR MI PROGRESO* permite llevarse la cuenta a otro aparato.

---

## 🌎 Ranking global y cuenta en cualquier aparato

Al entrar a cualquiera de los tres juegos hay un ticket **🌎 JUGAR ONLINE** (viene apagado).

- **Apagado:** el juego funciona como siempre, todo se guarda solo en ese aparato y no sale ni un dato.
- **Ticado:** escribes tu nombre y una contraseña (mínimo 3 caracteres) y entonces:
  - tus récords entran al **ranking global** del juego (botón 🌎), con tarjetas de quién lleva el
    récord de **cada modo**: nivel, mejor partida, contrarreloj de 60 s / 2 / 3 / 5 / 10 minutos,
    racha y puntos;
  - puedes entrar con ese mismo nombre y contraseña **desde otro celular** y sigues donde ibas.

Detalles que importan: la contraseña nunca viaja (se manda revuelta con SHA-256); solo viajan tu
nombre, tu carita y tus números; las marcas **solo suben**, así que ningún aparato atrasado puede
bajarle un récord a nadie; y si la copia de internet va más adelante que la del aparato, la de acá
queda guardada de respaldo antes de reemplazarla. Nunca se borra nada.

El servidor es una función de Cloudflare Pages (`functions/api/`) con una base D1 (`esquema.sql`).

## ⏱ Cómo cuentan los puntos del contrarreloj

Cada acierto del contrarreloj vale puntos, **pero solo se suman si el reloj llega a cero**.
Si te sales antes (al lobby, a otro modo o cambiando de usuario) esos puntos no se guardan y el
juego te avisa. Hay que terminar la partida.
