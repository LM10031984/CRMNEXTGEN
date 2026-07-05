"""
Mini-serveur HTTP qui wrappe WeasyPrint.

POST /pdf
  Body : HTML brut (Content-Type: text/html)
  Renvoie : PDF binaire (Content-Type: application/pdf)

Pourquoi WeasyPrint plutôt que Gotenberg/Chromium :
WeasyPrint supporte nativement CSS Paged Media — notamment les "running
elements" (`@page { @bottom-center { content: element(footer) } }`) qui
permettent un footer répété sur chaque page À LA VRAIE TAILLE
(Chromium downscale les headers/footers de manière imprévisible).
"""

from flask import Flask, request, Response
import io
import os

app = Flask(__name__)

# Token d'enforcement Bearer server-side (parite pdf-render.ts authHeaders).
# Lu au boot ; CONDITIONNEL : si absent (dev local), aucun controle n'est
# applique et le rendu marche comme avant. En prod cloud (Phase 21) ce service
# est expose en HTTPS public — le Bearer protege l'endpoint de rendu.
DOC_ENGINE_TOKEN = os.environ.get("DOC_ENGINE_TOKEN")


@app.before_request
def _enforce_bearer():
    # /health reste public : probe de liveness Railway non authentifiee.
    if request.path == "/health":
        return None
    # Conditionnel au token : dev local sans token => pas de controle
    # (parite exacte avec pdf-render.ts authHeaders() qui omet le header).
    if DOC_ENGINE_TOKEN:
        authorization = request.headers.get("Authorization", "")
        if authorization != "Bearer " + DOC_ENGINE_TOKEN:
            return Response("Unauthorized", status=401)
    return None


@app.route("/pdf", methods=["POST"])
def render_pdf():
    html_text = request.get_data(as_text=True)
    if not html_text or len(html_text) < 50:
        return Response("HTML body too short or missing", status=400)
    # Import paresseux : WeasyPrint charge des libs natives (Pango/cairo) au
    # moment de l'import. On le fait DANS la route (pas au niveau module) pour
    # que le check Bearer (hook d'auth) et les tests d'auth restent
    # executables sans la stack native. En prod l'image Docker fournit ces libs.
    from weasyprint import HTML

    pdf_bytes = io.BytesIO()
    HTML(string=html_text).write_pdf(pdf_bytes)
    return Response(
        pdf_bytes.getvalue(),
        mimetype="application/pdf",
        headers={"Content-Disposition": "inline; filename=document.pdf"},
    )


@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok"}, 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=False)
