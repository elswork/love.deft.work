/**
 * EnrichmentService.js
 * 
 * Este servicio orquesta la captura de metadatos para el Nexo Love.
 * Sigue la doctrina de "Inteligencia Aumentada" ayudando al humano
 * a completar los campos de excelencia.
 */

import { ATHENA_KNOWLEDGE } from '../data/athena_knowledge';

const EnrichmentService = {
  /**
   * Enriquece una categoría mediante el motor de IA.
   * @param {string} categoryName - Nombre de la categoría a investigar.
   * @returns {Promise<Object>} - Metadatos: { description, imageUrl }
   */
  async enrichCategory(categoryName) {
    console.log(`[EnrichmentService] Consultando Oráculo Real para: ${categoryName}`);
    
    try {
      const response = await fetch(`http://localhost:5001/enrich?category=${encodeURIComponent(categoryName)}`);
      const data = await response.json();
      
      if (data.error) throw new Error(data.error);

      return {
        description: data.description,
        imageUrl: data.imageUrl,
        timestamp: new Date().toISOString(),
        isRealTime: true
      };
    } catch (error) {
      console.error("[EnrichmentService] Error en el Puente de Athena:", error);
      return {
        description: `Error de conexión con el Oráculo: ${error.message}. Asegúrate de que el puente esté activo.`,
        imageUrl: "https://placehold.co/600x400/18181b/ffffff?text=Error+Conexion",
        timestamp: new Date().toISOString(),
        isRealTime: false
      };
    }
  },

  /**
   * Enriquece un elemento (palabra o URL).
   * @param {string} input - Palabra clave o URL del descubrimiento.
   * @returns {Promise<Object>} - Metadatos extraídos.
   */
  async enrichElement(input) {
    console.log(`[EnrichmentService] Analizando elemento: ${input}`);
    // Simulación de scraping y búsqueda semántica
    return {
      title: "Resultado de Análisis",
      description: "Información recopilada automáticamente por el sistema.",
      visual: "https://placehold.co/600x400?text=Discovery",
      isValidated: false
    };
  }
};

export default EnrichmentService;
