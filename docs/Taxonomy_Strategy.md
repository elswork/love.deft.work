# Estrategia de Taxonomía e Inferencia Semántica (Fase IA)

## Visión General
El objetivo para la categorización automática de descubrimientos (URLs o palabras clave) se basa en un flujo de **Data Enrichment + Inferencia Semántica de Bajo Coste**. 

El proceso proyectado es el siguiente:
1. **Entrada**: El ciudadano introduce una URL o término.
2. **Extracción (Scraping)**: Un bot extrae el contexto principal (título, descripción, contenido relevante) de la fuente.
3. **Inferencia (IA)**: Se envía el contexto extraído a un modelo lingüístico de bajo coste y alta eficiencia (específicamente un modelo de la familia **Gemma**).
4. **Inferencia de Nivel Óptimo (El Punto Medio)**: El modelo tiene instrucciones estrictas de encontrar el *nivel intermedio de abstracción*. No debe ser micro-específico (ej. "Ferrari F40" -> "Deportivo V8"), ni excesivamente genérico (ej. "Interstellar" -> "Arte y Cultura"). Debe apuntar al concepto universalmente reconocible por un humano estándar (ej. "Ferrari" -> "Automóvil" o "Motor"; "Interstellar" -> "Cine" o "Películas").

## La "Regla de la Biblioteca" (Buscando la Categoría Idónea)
Para guiar a la IA (Gemma) hacia ese término medio perfecto sin tener que listar miles de categorías, utilizaremos el prompt system bajo la **Regla de la Biblioteca o del Gran Almacén**:
*Instrucción para el LLM*: "Clasifica este elemento nombrando el pasillo o sección exacta donde lo encontrarías en una gran biblioteca o en unos grandes almacenes físicos."

Esto restringe naturalmente a la IA a usar categorías de nivel medio-alto que los humanos usamos intuitivamente (ej. *Cine, Videojuegos, Cómics, Automoción, Alta Cocina, Nutrición, Hardware, Inteligencia Artificial*).

1. **Arte y Cultura** (Cine, Música, Literatura, Historia, Filosofía)
2. **Ciencia y Tecnología** (Informática, IA, Física, Desarrollo Web)
3. **Vehículos y Transporte** (Automovilismo, Aviación, Movilidad)
4. **Gastronomía y Alimentación** (Restauración, Enología, Nutrición)
5. **Economía y Negocios** (Finanzas, Emprendimiento, Mercados)
6. **Salud y Bienestar** (Medicina, Psicología, Deporte)
7. **Naturaleza y Medio Ambiente** (Biología, Ecología, Geografía)
8. **Diseño y Estilo de Vida** (Moda, Arquitectura, Tendencias)
9. **Sociedad y Política** (Sociología, Derecho, Relaciones Internacionales)
10. **Herramientas y Productividad** (Aplicaciones, Servicios, Metodologías)

## Implementación Futura
* **Prompt Engineering**: El prompt para Gemma instruirá al modelo a analizar el texto scrapeado y devolver *estrictamente* una de las 10 categorías listadas arriba.
* **Arquitectura**: Se integrará en los servicios de recolección (ej. `EnrichmentService.js`) actuando como el último paso antes de someter el descubrimiento a la base de datos Firestore o al estado de "pendiente de validación".
