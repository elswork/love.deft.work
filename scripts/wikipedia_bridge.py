from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app)

@app.route('/enrich', methods=['GET'])
def enrich():
    category = request.args.get('category')
    if not category:
        return jsonify({"error": "No category provided"}), 400

    print(f"[WikipediaBridge] Consultando Wikipedia para: {category}")
    
    headers = {
        'User-Agent': 'AnticiteraProject/1.0 (https://anticitera.deft.work; contact@deft.work)'
    }
    
    # Intentar obtener el extracto e info de Wikipedia (en español primero)
    wiki_url = "https://es.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "prop": "extracts|categories",
        "exintro": True,
        "explaintext": True,
        "titles": category,
        "format": "json",
        "cllimit": "max"
    }
    
    try:
        response = requests.get(wiki_url, params=params, headers=headers)
        data = response.json()
        
        pages = data.get("query", {}).get("pages", {})
        page_id = next(iter(pages))
        page = pages[page_id]
        
        if "missing" in page:
            # Reintentar con la primera letra en mayúscula si falló
            params["titles"] = category.capitalize()
            response = requests.get(wiki_url, params=params, headers=headers)
            data = response.json()
            pages = data.get("query", {}).get("pages", {})
            page_id = next(iter(pages))
            page = pages[page_id]

        if "missing" in page:
            # Fallback a inglés si no hay en español
            wiki_url_en = "https://en.wikipedia.org/w/api.php"
            response = requests.get(wiki_url_en, params=params, headers=headers)
            data = response.json()
            pages = data.get("query", {}).get("pages", {})
            page_id = next(iter(pages))
            page = pages[page_id]

        if "missing" in page:
            return jsonify({
                "description": f"Enclave místico sin registro enciclopédico. '{category}' permanece como un misterio por descubrir.",
                "imageKeyword": category,
                "categories": [],
                "source": "None"
            })

        extract = page.get("extract", "")
        # Limitar a unos 40 palabras para el diseño premium
        short_desc = " ".join(extract.split()[:40]) + "..."
        if not short_desc.strip():
             short_desc = f"Referencia técnica para {category}."

        categories = [c.get("title", "").replace("Categoría:", "").replace("Category:", "") for c in page.get("categories", [])]
        
        return jsonify({
            "description": short_desc,
            "imageKeyword": page.get("title", category),
            "categories": categories,
            "source": "Wikipedia"
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5001, debug=True)
