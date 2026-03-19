/**
 * SyntheticValidator.js
 * 
 * Validador de protocolo estricto para registros realizados por agentes.
 * No hay asistencia; el agente debe cumplir con el contrato de datos.
 */

const REQUIRED_FIELDS = ['name', 'category', 'description', 'imageUrl', 'url'];

const SyntheticValidator = {
  /**
   * Valida un objeto de descubrimiento proporcionado por un sintético.
   * @param {Object} data - El objeto enviado por el agente.
   * @returns {Object} { success: boolean, error?: string }
   */
  validate(data) {
    for (const field of REQUIRED_FIELDS) {
      if (!data[field] || data[field].toString().trim() === '') {
        return {
          success: false,
          error: `Campo requerido faltante o vacío: ${field}`
        };
      }
    }

    // Validación de formato de URL (ejemplo simple)
    if (data.url && !data.url.startsWith('http')) {
      return {
          success: false,
          error: "El campo 'url' debe ser una dirección válida."
      };
    }

    return { success: true };
  }
};

export default SyntheticValidator;
