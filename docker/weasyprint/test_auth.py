"""
Tests de l'enforcement Bearer server-side du micro-service WeasyPrint.

Le check est CONDITIONNEL au token (parite pdf-render.ts authHeaders) :
- token defini  -> POST /pdf exige "Bearer <token>", sinon 401 ;
- token absent  -> aucun controle (dev local ne casse pas) ;
- /health       -> toujours ouvert (probe liveness Railway).

Le token est lu au LOAD du module (DOC_ENGINE_TOKEN = os.environ.get(...)),
donc chaque test recharge `server` via importlib.reload apres avoir set/del
la variable d'environnement via monkeypatch.
"""

import importlib

import server


# Corps HTML valide (> 50 caracteres, sinon la route /pdf renvoie 400).
VALID_HTML = (
    "<html><body><h1>Document de test WeasyPrint</h1>"
    "<p>Contenu suffisamment long pour passer la garde des 50 caracteres.</p>"
    "</body></html>"
)


def _load(monkeypatch, token):
    """Recharge `server` avec (ou sans) DOC_ENGINE_TOKEN et renvoie un test client."""
    if token is None:
        monkeypatch.delenv("DOC_ENGINE_TOKEN", raising=False)
    else:
        monkeypatch.setenv("DOC_ENGINE_TOKEN", token)
    importlib.reload(server)
    return server.app.test_client()


def test_health_always_open(monkeypatch):
    client = _load(monkeypatch, "secret")
    resp = client.get("/health")
    assert resp.status_code == 200


def test_pdf_rejects_missing_bearer(monkeypatch):
    client = _load(monkeypatch, "secret")
    resp = client.post("/pdf", data=VALID_HTML)
    assert resp.status_code == 401


def test_pdf_rejects_wrong_bearer(monkeypatch):
    client = _load(monkeypatch, "secret")
    resp = client.post(
        "/pdf",
        data=VALID_HTML,
        headers={"Authorization": "Bearer wrong"},
    )
    assert resp.status_code == 401


def test_pdf_accepts_correct_bearer(monkeypatch):
    client = _load(monkeypatch, "secret")
    resp = client.post(
        "/pdf",
        data=VALID_HTML,
        headers={"Authorization": "Bearer secret"},
    )
    assert resp.status_code == 200


def test_no_token_dev_mode_open(monkeypatch):
    client = _load(monkeypatch, None)
    resp = client.post("/pdf", data=VALID_HTML)
    assert resp.status_code == 200
