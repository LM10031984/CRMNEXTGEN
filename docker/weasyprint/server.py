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
from weasyprint import HTML
import io

app = Flask(__name__)


@app.route("/pdf", methods=["POST"])
def render_pdf():
    html_text = request.get_data(as_text=True)
    if not html_text or len(html_text) < 50:
        return Response("HTML body too short or missing", status=400)
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
