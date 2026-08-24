# SPEC — Fuente del membrete (Big John)

**Fecha:** 2026-08-24
**Estado:** Propuesto (rev. 1)
**Autor:** equipo task-drive-manager
**Plan asociado:** [`../plans/2026-08-24-fuente-membrete-big-john.md`](../plans/2026-08-24-fuente-membrete-big-john.md)

El nombre de la administración en el membrete pasa a dibujarse con **Big John**, la tipografía
oficial de la marca, en las tres superficies que muestran membrete: el informe en pantalla, el PDF
de informe por edificio y el PDF de visita de control.

---

## Contexto

El membrete quedó configurable en la feature de Informes (spec `2026-08-03`): nombre, email,
dirección, teléfono y logo viven en la hoja `Configuracion` y se dibujan tanto en `/informes` como
en los PDFs. Todo eso ya está cargado con los datos reales del cliente, y el logo real también
(`public/logo-source.png`, commit `4303efe`).

Lo único que falta para cerrar la identidad visual es la **tipografía**. Hoy los tres generadores
de PDF usan las fuentes built-in de `@react-pdf/renderer` (`Helvetica`, `Helvetica-Bold`,
`Helvetica-BoldOblique`) y la vista en pantalla usa la fuente por defecto de Tailwind. No hay
ningún `Font.register` en el repo.

La fuente oficial es **Big John** (dupla Big John / Slim Joe, de Ion Lucin): geométrica art-deco,
un solo peso. El archivo está disponible como `BIG JOHN.otf` (OTF con contornos CFF, 10 KB).

## Problema

Big John **no cubre el español**. Su juego de caracteres son 89 glifos: espacio, los signos
`! $ % & ( ) + , - . / : ; = ?`, los corchetes, el guion bajo, los dígitos `0-9`, las 26 letras en
mayúscula y en minúscula, `¡`, `¿` y las comillas tipográficas simples y dobles.

**No tiene ninguna vocal acentuada, ni `ñ`, ni arroba, ni el punto medio**, y tampoco trae los
acentos sueltos como para componerlos. En el visor de fuentes de Windows los acentos se ven porque
el sistema cae a otra tipografía; **`@react-pdf/renderer` no hace fallback por glifo faltante**: lo
que no está se dibuja como hueco o cuadro.

Con el membrete real eso rompe, como mínimo:

| Texto | Carácter sin glifo |
|---|---|
| `Administración Morinigo` | `ó` |
| el email de contacto | la arroba |
| `Dirección · Teléfono` | `ó`, `é`, el punto medio |
| tabla: `En Revisión`, `Período`, dptos y comentarios | acentos y `ñ` |

Por eso la fuente **no puede usarse para texto corrido**; el alcance se limita al título.

## Alcance

**Dentro:**
- Big John en el **nombre de la administración** (el título grande del membrete), en mayúsculas y
  sin diacríticos, en: `/informes` (pantalla), `InformeEdificioPdf` y `VisitaPdf`.
- Registro de la fuente para `@react-pdf/renderer` (server) y para la vista (`next/font/local`).
- Normalización del título como **función pura testeada**, con fallback seguro.

**Fuera:**
- El resto del membrete (email, dirección, teléfono) y todo el cuerpo de los PDFs: siguen en
  Helvetica, por los acentos y la arroba.
- `TareaReportePdf` (reporte por tarea): no tiene membrete, no se toca.
- La UI de la app (`AppShell`, listados, formularios): sin cambios tipográficos.
- Slim Joe: no se usa (mismo faltante de acentos, y no hace falta un segundo peso).
- Parchear la fuente para agregarle glifos, y cambiar la fuente del cuerpo por una alternativa
  libre: descartados en el brainstorming.

---

## Decisiones

| # | Decisión | Alternativa descartada |
|---|---|---|
| 1 | Big John **solo en el título** del membrete | Toda la tipografía del PDF |
| 2 | Las tildes las quita el **código al renderizar**; la hoja `Configuracion` queda intacta | Escribir el nombre sin tilde en la hoja |
| 3 | Aplica en **pantalla + los 2 PDFs**, para que la vista previa coincida con el papel | Solo los PDFs |
| 4 | Si tras normalizar queda algún carácter **fuera de la cobertura**, el título entero cae a Helvetica-Bold | Dibujarlo igual y aceptar el hueco |
| 5 | El `.otf` vive en **`public/fonts/`**, como el logo | `assets/` fuera de public; CDN |
| 6 | Se registra el archivo **tal cual (OTF/CFF)**, sin convertir a TTF | Convertir a TTF/WOFF en el build |

**Sobre la decisión 6:** se verificó que `@react-pdf/renderer` renderiza este `.otf` y lo embebe
como `FontFile3` (CFF). No hace falta conversión.

**Sobre la decisión 4:** es la red que evita el modo de falla silencioso. El nombre de la
administración lo edita el cliente desde `/configuracion`; si mañana escribe un nombre con una
arroba o un símbolo fuera del juego, ese carácter no existe en la fuente. Antes que un hueco en el
papel que se le entrega al consorcio, el título sale completo en Helvetica-Bold — se ve distinto,
pero se lee.

---

## #1 — Normalización del título (lógica pura)

Módulo nuevo `lib/membrete-titulo.ts`, sin IO, compartido por la vista y los dos PDFs para que no
puedan divergir (mismo criterio que `lib/informes.ts`).

```ts
export const COBERTURA_BIG_JOHN: string;              // el juego de caracteres real de la fuente
export function tituloMembrete(nombre: string): { texto: string; usaBigJohn: boolean };
```

**Qué hace, en orden:**
1. `trim()` y colapso de espacios repetidos.
2. Quita diacríticos (`NFD` + descarte de marcas combinantes): `ó → o`, `ñ → n`, `ü → u`.
3. Pasa a **mayúsculas**.
4. Comprueba que **todos** los caracteres resultantes estén en `COBERTURA_BIG_JOHN`
   (el espacio incluido). Si alguno falta → `usaBigJohn: false`.

`texto` sale siempre normalizado (mayúsculas, sin tildes) — se dibuje con la fuente que se dibuje,
así el título se ve igual en las tres superficies. `usaBigJohn` es lo único que decide la fuente.

**Nombre vacío:** quien renderiza ya cae a `APP_NAME` (`config?.membreteNombre || APP_NAME`); la
función recibe el valor ya resuelto y no conoce ese default.

**Criterio:** `tituloMembrete("Administración Morinigo")` devuelve
`{ texto: "ADMINISTRACION MORINIGO", usaBigJohn: true }`; con una arroba o un `#` en el nombre,
devuelve el texto normalizado y `usaBigJohn: false`.

## #2 — Registro de la fuente para los PDFs

El archivo se copia a **`public/fonts/BigJohn.otf`** (renombrado sin espacios, para no depender de
cómo trate el filesystem un nombre con dos palabras).

Módulo nuevo `lib/pdf-fonts.ts`:

```ts
export const BIG_JOHN = "BigJohn";
export function registrarFuentes(cwd?: string): boolean;   // idempotente
```

- Resuelve `path.join(cwd, "public", "fonts", "BigJohn.otf")` — mismo razonamiento que
  [`resolverLogoParaPdf`](../../../lib/membrete-logo.ts): el `Font.register` de react-pdf corre
  server-side y necesita una ruta de disco, y el Dockerfile copia `public/` a `/app/public` con
  `WORKDIR /app`, así que `process.cwd()` apunta al mismo lugar en dev y en prod.
- **Si el archivo no está, no registra y devuelve `false`** — el PDF se genera igual, con el
  título en Helvetica. Ningún informe se rompe por una fuente ausente (mismo criterio que el logo).
- Idempotente: registrar dos veces la misma familia no debe duplicar trabajo ni tirar error.

Lo llaman los dos componentes de PDF a nivel de módulo (una vez por proceso), no por render.

**Criterio:** con el archivo presente, un informe renderizado embebe la fuente; borrando el
archivo, el mismo informe se genera sin errores y con el título en Helvetica-Bold.

## #3 — Aplicación en los dos PDFs

En `components/pdf/InformeEdificioPdf.tsx` y `components/pdf/VisitaPdf.tsx`, el estilo `nombre`
(hoy `fontFamily: "Helvetica-Bold"`, `fontSize` 24 y 20 respectivamente) pasa a elegir la familia
según `usaBigJohn`. Todo lo demás del membrete y de las tablas queda **igual**.

Ajuste de tamaño: Big John es más ancha y de caja alta que Helvetica al mismo `fontSize`. El
título va centrado y en una sola línea, así que el `fontSize` del título se calibra visualmente
contra el membrete de la planilla original — es un número a fijar al implementar, no un cálculo.

**Criterio:** ambos PDFs muestran el nombre en Big John, en una sola línea, sin huecos ni cuadros,
y el resto del documento sale idéntico a hoy.

## #4 — Aplicación en pantalla

`components/informes/MembreteHeader.tsx` es el espejo en pantalla del membrete. Se carga la fuente
con **`next/font/local`** apuntando al mismo archivo de `public/fonts/` (next/font lo empaqueta en
build y lo sirve desde `_next/static/media`, con `display: "swap"`), y se aplica al `<h3>` del
nombre — con el mismo `tituloMembrete`, de modo que pantalla y PDF muestren idéntico texto.

Cuando `usaBigJohn` es `false`, el `<h3>` conserva las clases actuales (`font-bold` de Tailwind).

**Criterio:** en `/informes`, el nombre se ve en Big John y coincide carácter por carácter con el
del PDF que se descarga.

---

## Criterios de aceptación

1. Con `membrete_nombre = "Administración Morinigo"`, el título sale **ADMINISTRACION MORINIGO** en
   Big John, en `/informes`, en el PDF de informe y en el PDF de visita.
2. El email con arroba, la dirección y el teléfono siguen legibles, con sus acentos, en Helvetica.
3. Las tablas de tareas (con `En Revisión`, `Período`, dptos con `ñ`) salen sin ningún hueco.
4. Un nombre con un carácter fuera de la cobertura sale completo en Helvetica-Bold, no con huecos.
5. Sin `public/fonts/BigJohn.otf`, ambos PDFs se generan igual, sin lanzar error.
6. Árbol verde: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run build`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| **Licencia**: Big John / Slim Joe es gratuita para uso personal; el uso comercial requiere licencia del autor (Ion Lucin), y el archivo se bajó de un sitio agregador, no del autor. El cliente es comercial. | Fuera del código: queda planteado al cliente. Si no se licencia, la salida es la decisión descartada "sustituto libre" (Jost / Josefin Sans / Montserrat), que además cubre los acentos. El diseño de #1 y #2 no cambia: solo se cambia el archivo y la constante de cobertura. |
| Alguien edita el nombre en la hoja y mete un carácter sin glifo | Decisión 4: el título entero cae a Helvetica-Bold. |
| Alguien usa `BIG_JOHN` para texto corrido en un PDF nuevo | El comentario del módulo documenta la limitación, y `COBERTURA_BIG_JOHN` está exportada para verificarlo. |
| El título más ancho desborda o parte en dos líneas | Se calibra el `fontSize` al implementar; el membrete se revisa contra un PDF real antes de cerrar. |
| Cambia el caché de la PWA por el asset nuevo | El `.otf` pesa 10 KB y entra al precache del SW como un asset más; sin impacto práctico. |

## Definición de hecho

- `lib/membrete-titulo.ts` y `lib/pdf-fonts.ts` con tests colocados.
- `public/fonts/BigJohn.otf` en el repo.
- Los tres puntos de render aplicando la fuente.
- Un PDF de informe y uno de visita generados y revisados a ojo con los datos reales.
- Árbol verde y `CHANGELOG.md` actualizado.
