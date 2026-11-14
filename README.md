# love.deft.work // Tablero Keep de Pasiones & Micro-Notas

Aplicación web estilo **Google Keep** diseñada específicamente para capturar, ordenar, relacionar y compartir **elementos cortos** (**🔗 Links**, **🏷️ Palabras** y **💬 Frases**) organizados en **Listas por Categorías**.

## Características Principales

1. **Tablero Dual de 2 Niveles (`App.jsx`)**:
   - **Nivel Superior — Tarjetas de Categoría**: Tarjetas tipo Google Keep con paleta cromática personalizable (`keep_palette.js`), contadores por tipo (`🔗`, `🏷️`, `💬`), vista previa interactiva con checkboxes, captura rápida inline (`+ Añadir a <Categoría>…`), reordenación **Drag & Drop**, fijado (`★`), vista expandida (`⤢`) y compartición.
   - **Nivel Inferior — Muro de Mini-Tarjetas**: Píldoras ultra-compactas adaptadas al tipo de contenido (enlace con favicon y dominio, palabra léxica destacada o cita/frase corta), con copia en 1 clic, apertura directa, fijado, check (`✓` envía los completados al final), reordenación **Drag & Drop** y ordenación en 1 clic (`Manual / Pin`, `Recientes`, `Alfabético A–Z`, `Más usados`).

2. **Captura Rápida Inteligente (`DiscoveryForm.jsx` & `EnrichmentService.js`)**:
   - Detección automática de **Link**, **Palabra** o **Frase**.
   - Extracción automática de dominio, favicon y título corto para URLs.
   - **Regla de la Biblioteca**: inferencia automática de categoría según el dominio o palabras clave.
   - Soporte de sintaxis rápida en línea: `#Categoría` para asignar o crear categorías al vuelo y `@término` para enlazar con otros elementos existentes.

3. **Relaciones Cruzadas entre Categorías (`ConnectionsGraph.jsx`)**:
   - Vinculación bidireccional entre ítems de distintas categorías (`relatedIds`) y presencia simultánea en categorías secundarias (`extraCategories`).
   - Resaltado cruzado interactivo (`is-related-glow`) al pasar el cursor y vista de **Mapa de Conexiones SVG**.

4. **Compartición Dual por Categoría y por Elemento (`ShareModal.jsx`)**:
   - Interruptor **Público / Privado** (`isPublic`) sincronizado con Cloud Firestore.
   - Enlaces directos profundos (`?cat=...` y `?item=...`).
   - Exportación en 1 clic a **Markdown / WhatsApp / Portapapeles**.
   - Invitación de colaboradores por correo de Google (`sharedWith`) y código **QR** escaneable.

## Desarrollo y Despliegue

```bash
npm install
npm run lint
npm run build
npx firebase-tools deploy --project free-deft-work --only hosting:love-deft-work,firestore:rules
```
