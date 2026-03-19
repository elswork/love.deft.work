/**
 * test-mechanics.js
 * 
 * Simulación de las mecánicas de love.deft.work para validación inmediata.
 */

// Simulación de imports (para ejecución directa en Node sin ESM complejo)
const EnrichmentService = {
  async enrichCategory(categoryName) {
    return {
      description: `Excelencia en ${categoryName}: Un pilar de la pasión humana.`,
      imageUrl: `https://love.deft.work/assets/categories/${categoryName.toLowerCase()}.jpg`
    };
  },
  async enrichElement(input) {
    return {
      title: "Elemento Encontrado",
      description: `Metadatos extraídos para: ${input}`,
      url: input.includes('http') ? input : `https://search.com?q=${input}`
    };
  }
};

const SyntheticValidator = {
  validate(data) {
    const required = ['name', 'category', 'description', 'imageUrl', 'url'];
    for (const f of required) {
      if (!data[f]) return { success: false, error: `Falta ${f}` };
    }
    return { success: true };
  }
};

async function runSimulation() {
  console.log("--- SIMULACIÓN DE REGISTRO love.deft.work ---");

  // 1. FLUJO HUMANO (ASISTIDO)
  console.log("\n[HUMANO] Paso 1: El usuario escribe 'Relojería'");
  const catEnrich = await EnrichmentService.enrichCategory("Relojería");
  console.log("[SISTEMA] Sugiriendo descripción:", catEnrich.description);
  console.log("[HUMANO] Paso 2: El usuario valida y escribe URL 'https://vacheron-constantin.com'");
  const elEnrich = await EnrichmentService.enrichElement("https://vacheron-constantin.com");
  console.log("[SISTEMA] Extrayendo metadatos:", elEnrich.title);
  console.log("[RESULTADO] Registro Humano completado con éxito.");

  // 2. FLUJO SINTÉTICO (ESTRICTO)
  console.log("\n[SINTÉTICO] El Agente envía objeto completo...");
  const agentData = {
    name: "Patrimony Self-Winding",
    category: "Relojería",
    description: "Elegancia atemporal en oro rosa.",
    imageUrl: "https://media.vacheron-constantin.com/image.jpg",
    url: "https://vacheron-constantin.com/patrimony"
  };
  
  const validation = SyntheticValidator.validate(agentData);
  if (validation.success) {
    console.log("[SISTEMA] Validación exitosa. Registro persistido.");
  } else {
    console.log("[SISTEMA] ERROR DE VALIDACIÓN:", validation.error);
  }

  // 3. PRUEBA DE ERROR SINTÉTICO
  console.log("\n[SINTÉTICO] Agente envía datos incompletos...");
  const badData = { name: "Incompleto" };
  const badValidation = SyntheticValidator.validate(badData);
  console.log("[SISTEMA] RESULTADO:", badValidation.success ? "Éxito" : "ERROR: " + badValidation.error);
}

runSimulation();
