from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import requests
import json
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app) # Habilitar CORS para el frontend en el puerto 5173

# Load environment variables from synapse-ia
load_dotenv("/home/pirate/docker/synapse-ia/.env")
API_KEY = os.environ.get("GEMINI_API_KEY")

def consult_athena_realtime(query):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={API_KEY}"
    
    system_instruction = """Eres Athena, la Estratega de Anticitera. 
Tú respondes a las solicitudes de enriquecimiento de datos para el Nexo Love.
REGLA DE ORO: Responde ÚNICAMENTE en formato JSON válido.
El JSON debe tener exactamente estos campos:
{
  "description": "Una descripción elegante, mística y técnica (máximo 40 palabras).",
  "imageKeyword": "Una palabra clave en inglés que represente perfectamente la categoría para buscar en Unsplash."
}
No incluyas markdown, solo el objeto JSON."""

    payload = {
        "contents": [{"parts": [{"text": query}]}],
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "generationConfig": {
            "temperature": 0.4,
            "responseMimeType": "application/json"
        }
    }

    headers = {'Content-Type': 'application/json'}

    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        response.raise_for_status()
        result = response.json()
        
        if 'candidates' in result and result['candidates']:
            content = result['candidates'][0]['content']['parts'][0]['text']
            data = json.loads(content)
            # Construir la URL de imagen usando una fuente confiable basada en palabras clave
            keyword = data.get("imageKeyword", "innovation")
            data["imageUrl"] = f"https://source.unsplash.com/featured/800x600?{keyword}"
            return data
        return {"error": "No response from Athena"}
    except Exception as e:
        return {"error": str(e)}

@app.route('/enrich', methods=['GET'])
def enrich():
    category = request.args.get('category')
    if not category:
        return jsonify({"error": "Falta la categoría"}), 400
    
    result = consult_athena_realtime(f"Enriquece la categoría: {category}")
    return jsonify(result)

if __name__ == "__main__":
    print("🏛️ Puente de Athena Activo en el puerto 5001...")
    app.run(port=5001, debug=True)
