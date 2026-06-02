import json
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

app = FastAPI(title="Dummy App")
templates = Jinja2Templates(directory="templates")

CONFIG_FILE = Path(os.getenv("CONFIG_FILE", "/config/config_file"))
META_FILE = Path(os.getenv("META_FILE", "/config/meta.json"))


def _load():
    try:
        meta = json.loads(META_FILE.read_text()) if META_FILE.exists() else None
    except Exception:
        meta = None
    try:
        content = CONFIG_FILE.read_text() if CONFIG_FILE.exists() else None
        if content is not None and content.strip() in ("", "{}"):
            content = None
    except Exception:
        content = None
    return meta, content


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    meta, content = _load()
    return templates.TemplateResponse("index.html", {
        "request": request,
        "meta": meta,
        "content": content,
    })
