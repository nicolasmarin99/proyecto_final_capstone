# Handoff de diseño: Landing LocalCL

Esta carpeta contiene el diseño de la landing page de **LocalCL**, una plataforma para buscar y ofrecer servicios (gasfitería, electricidad, banquetería, soldadura, carpintería, etc.).

## Archivos

- `landing.html`: la landing completa en HTML con estilos inline y un pequeño script. Funciona abriéndola en el navegador. Es la **referencia visual y de comportamiento**, no el código final.
- `hero.mp4`: el video en loop de la portada (sin audio, 4 s).
- `marca.html`: el logo (SVG), la paleta de colores y la tipografía.

## Qué necesito que hagas

1. Revisa la estructura y el stack actual de mi proyecto antes de escribir código. **Dime tu plan antes de crear archivos.**
2. Implementa la landing de `landing.html` **usando el stack de mi proyecto**. Si no hay un framework definido, propón uno y explícame por qué.
3. Separa la página en componentes reutilizables: `Navbar`, `Hero`, `CategoriasScroll` (con `CategoriaCard`), `ComoFunciona`, `Prestadores`, `CtaFinal` y `Footer`.
4. Pasa los estilos inline a CSS (o a Tailwind, si el proyecto ya lo usa) con los tokens de abajo como variables. Los colores no deben quedar escritos a mano en cada componente.
5. Guarda el logo como un componente o como un archivo `.svg` en assets, y `hero.mp4` en la carpeta de assets públicos.
6. Hazla **responsive**: el diseño está hecho para escritorio (1440px). En móvil el hero debe pasar a una sola columna (video debajo del texto), el formulario de búsqueda debe quedar apilado y las tarjetas de categorías deben pasar a 1 columna.
7. Mantén la accesibilidad: `label` en los inputs, `aria-hidden` en los íconos decorativos, `prefers-reduced-motion` en todas las animaciones y un contraste de texto de al menos 4.5:1.
8. El nombre es **LocalCL** en todos lados.
9. Explícame los pasos y las decisiones que tomes. Soy estudiante y quiero aprender cómo se estructura el proyecto.

## Comportamientos que hay que conservar

### 1. Hero

- **Fondo animado en loop, solo con CSS:** una malla de puntos que se desplaza (`ds-pan`), íconos de oficios flotando (`ds-float`), puntos de ubicación que laten (`ds-pulse`) y círculos que se mueven lento (`ds-drift`).
- **Video a la derecha:** `<video autoplay muted loop playsinline>`. `muted` es obligatorio para que se reproduzca solo.

### 2. Categorías guiadas por scroll (la sección más importante)

- La sección mide 2400px de alto y su contenido queda fijo con `position: sticky; top: 0; height: 100vh`.
- El script calcula el progreso del scroll dentro de la sección (0 a 1) con `getBoundingClientRect()`:
  - `< 0.34` → **Etapa 0:** Gasfitería, Electricidad, Banquetería
  - `< 0.72` → **Etapa 1:** Soldadura, Carpintería, Cerrajería
  - resto → **Etapa 2:** solo el logo de LocalCL, en grande
- Cada grupo tiene tres clases posibles: `cat-in` (visible), `cat-above` (ya pasó: sale hacia arriba) y `cat-below` (todavía no llega: espera abajo). Así, **al hacer scroll hacia arriba las categorías vuelven** en orden inverso.
- Los tres puntos junto al título indican la etapa actual. El aviso "Sigue bajando" se oculta en la etapa 2.
- Las transiciones usan `opacity` + `transform` (0.6 s).
- En móvil conviene bajar la altura de la sección (unos 1800px) y dejar las tarjetas en una columna, o reemplazar la secuencia por una lista normal si no se ve bien.
- Si el proyecto usa React, esto va bien con `useEffect` + `useRef` + `useState` para la etapa. También se puede hacer con GSAP ScrollTrigger si ya está instalado.

## Tokens de diseño

```css
:root {
  --color-noche: #0B2A5B;    /* títulos, texto, pie de página */
  --color-primario: #1D4ED8; /* botones, logo, enlaces */
  --color-cielo: #3B82F6;    /* acentos (nunca debajo de texto) */
  --color-hielo: #DBEAFE;    /* fondos de íconos, etiquetas */
  --color-niebla: #F4F7FC;   /* fondos de sección */
  --color-blanco: #FFFFFF;
  --color-texto-suave: #3D5478;
  --color-borde: #E3EAF6;

  --fuente-titulos: 'Sora', sans-serif;   /* 600, 700, 800 */
  --fuente-texto: 'DM Sans', sans-serif;  /* 400, 500, 700 */

  --radio-sm: 10px;
  --radio-md: 16px;
  --radio-lg: 24px;
}
```
