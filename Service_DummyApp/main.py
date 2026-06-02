import json
import os
from pathlib import Path
from xml.etree import ElementTree as ET

import yaml
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from starlette.requests import Request

app = FastAPI(title="Dummy App")
templates = Jinja2Templates(directory="templates")

CONFIG_FILE = Path(os.getenv("CONFIG_FILE", "/config/config_file"))
META_FILE = Path(os.getenv("META_FILE", "/config/meta.json"))


def _parse_env(text: str) -> dict:
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, _, v = line.partition("=")
            result[k.strip()] = v.strip()
    return result


def _parse_xml(text: str) -> dict:
    root = ET.fromstring(text)
    return {child.tag: (child.text or "") for child in root}


def _parse(raw: str, fmt: str) -> dict | None:
    try:
        if fmt in ("env", "properties"):
            return _parse_env(raw)
        if fmt == "json":
            return json.loads(raw)
        if fmt == "yaml":
            return yaml.safe_load(raw) or {}
        if fmt == "xml":
            return _parse_xml(raw)
    except Exception:
        return None
    return None


def _load():
    try:
        meta = json.loads(META_FILE.read_text()) if META_FILE.exists() else None
    except Exception:
        meta = None

    if not CONFIG_FILE.exists():
        return meta, None

    try:
        raw = CONFIG_FILE.read_text()
    except Exception:
        return meta, None

    if not raw.strip():
        return meta, None

    fmt = (meta or {}).get("format", "env")
    config = _parse(raw, fmt)
    return meta, config


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    meta, config = _load()
    rows = []
    if isinstance(config, dict):
        for k, v in config.items():
            rows.append((k, v if isinstance(v, str) else json.dumps(v)))
    return templates.TemplateResponse("index.html", {
        "request": request,
        "meta": meta,
        "rows": rows,
    })
