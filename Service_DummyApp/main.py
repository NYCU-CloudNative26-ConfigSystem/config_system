import json
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

app = FastAPI(title="Dummy App")
templates = Jinja2Templates(directory="templates")

CONFIG_PATH = Path(os.getenv("CONFIG_PATH", "/config/payload.json"))


def _load_payload() -> dict | None:
    try:
        text = CONFIG_PATH.read_text()
        data = json.loads(text)
        return data if isinstance(data, dict) and data else None
    except Exception:
        return None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    payload = _load_payload()
    return templates.TemplateResponse("index.html", {"request": request, "payload": payload})
