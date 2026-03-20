import React, { useState } from 'react';
import EnrichmentService from '../services/EnrichmentService';
import SyntheticValidator from '../utils/SyntheticValidator';

const TestLab = () => {
  const [humanInput, setHumanInput] = useState('');
  const [humanResult, setHumanResult] = useState(null);
  
  const [synthInput, setSynthInput] = useState(JSON.stringify({
    name: "Patrimony",
    category: "Relojería",
    description: "Elegancia pura.",
    imageUrl: "https://example.com/img.jpg",
    url: "https://vacheron.com"
  }, null, 2));
  const [synthResult, setSynthResult] = useState(null);

  const testHuman = async () => {
    const res = await EnrichmentService.enrichCategory(humanInput);
    setHumanResult(res);
  };

  const testSynth = () => {
    try {
      const data = JSON.parse(synthInput);
      const res = SyntheticValidator.validate(data);
      setSynthResult(res);
    } catch (e) {
      setSynthResult({ success: false, error: "JSON Inválido" });
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-12">
      <h2 className="text-3xl font-bold text-center glow-text mt-8">Laboratorio de Registro - Alianza Algorítmica</h2>
      
      {/* Sección Humana */}
      <div className="glass p-6 rounded-2xl border border-blue-500/30">
        <h3 className="text-xl font-semibold mb-4 text-blue-400">Modo Humano (Asistido)</h3>
        <div className="flex gap-4">
          <input 
            type="text" 
            placeholder="Escribe una Categoría (ej: Relojería)"
            className="flex-1 bg-slate-900/50 border border-slate-700 p-2 rounded-lg text-white"
            value={humanInput}
            onChange={(e) => setHumanInput(e.target.value)}
          />
          <button 
            onClick={testHuman}
            className="bg-blue-600 hover:bg-blue-500 px-6 py-2 rounded-lg font-bold transition-all shadow-lg shadow-blue-500/20"
          >
            Enriquecer
          </button>
        </div>
        {humanResult && (
          <div className="mt-6 p-6 bg-slate-900/40 rounded-2xl border border-blue-500/20 backdrop-blur-md animate-in zoom-in-95 duration-500">
            <div className="flex flex-col md:flex-row gap-6 items-center">
              <div className="flex-1">
                <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2 font-mono">
                  {humanResult.isElite ? "✨ Athena Real Intelligence" : "📡 Escaneo en Proceso"}
                </p>
                <p className="text-lg text-slate-100 leading-relaxed italic">
                  "{humanResult.description}"
                </p>
                <p className="mt-4 text-[10px] text-slate-500 font-mono">
                  Sello Temporal: {new Date(humanResult.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="w-full md:w-64 shrink-0">
                <img 
                  src={humanResult.imageUrl} 
                  alt="Sugerencia Visual" 
                  className="rounded-xl border border-blue-500/30 shadow-2xl shadow-blue-500/10 w-full object-cover aspect-video"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sección Sintética */}
      <div className="glass p-6 rounded-2xl border border-purple-500/30">
        <h3 className="text-xl font-semibold mb-4 text-purple-400">Modo Sintético (Estricto)</h3>
        <textarea 
          className="w-full h-48 bg-slate-900/50 border border-slate-700 p-4 rounded-lg font-mono text-sm text-white"
          value={synthInput}
          onChange={(e) => setSynthInput(e.target.value)}
        />
        <button 
          onClick={testSynth}
          className="mt-4 w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-lg font-bold transition-all shadow-lg shadow-purple-500/20"
        >
          Validar Contrato
        </button>
        {synthResult && (
          <div className={`mt-4 p-4 rounded-lg ${synthResult.success ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
            <p className="font-bold">{synthResult.success ? "✅ VALIDACIÓN EXITOSA" : "❌ ERROR DE PROTOCOLO"}</p>
            {!synthResult.success && <p className="text-sm">{synthResult.error}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default TestLab;
