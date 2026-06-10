import os
import uuid
import sqlite3
from typing import Optional
from contextlib import contextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

DATABASE_PATH = os.environ.get("DATABASE_PATH", "./agenda.db")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@contextmanager
def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS slices (
                id TEXT PRIMARY KEY,
                role TEXT DEFAULT '',
                user_name TEXT DEFAULT '',
                duration_minutes INTEGER DEFAULT 5,
                enabled INTEGER DEFAULT 1,
                parent_id TEXT,
                order_index INTEGER DEFAULT 0
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('starting_time', '9:00')"
        )
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('title', 'Meeting Agenda')"
        )


init_db()


def row_to_slice(row) -> dict:
    d = dict(row)
    d["enabled"] = bool(d["enabled"])
    return d


class SliceCreate(BaseModel):
    role: str = ""
    user_name: str = ""
    duration_minutes: int = 5
    enabled: bool = True
    parent_id: Optional[str] = None
    order_index: int = 0


class SliceUpdate(BaseModel):
    role: Optional[str] = None
    user_name: Optional[str] = None
    duration_minutes: Optional[int] = None
    enabled: Optional[bool] = None
    parent_id: Optional[str] = None
    order_index: Optional[int] = None


class ReorderItem(BaseModel):
    id: str
    parent_id: Optional[str]
    order_index: int


class SettingsUpdate(BaseModel):
    starting_time: Optional[str] = None
    title: Optional[str] = None


@app.get("/api/agenda")
def get_agenda():
    with get_db() as conn:
        slices = [row_to_slice(r) for r in conn.execute(
            "SELECT * FROM slices ORDER BY order_index"
        ).fetchall()]
        settings = {r["key"]: r["value"] for r in conn.execute(
            "SELECT key, value FROM settings"
        ).fetchall()}
    return {"slices": slices, "settings": settings}


@app.post("/api/slices")
def create_slice(data: SliceCreate):
    slice_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            "INSERT INTO slices (id, role, user_name, duration_minutes, enabled, parent_id, order_index) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (slice_id, data.role, data.user_name, data.duration_minutes,
             int(data.enabled), data.parent_id, data.order_index),
        )
        row = conn.execute("SELECT * FROM slices WHERE id = ?", (slice_id,)).fetchone()
    return row_to_slice(row)


@app.put("/api/slices/{slice_id}")
def update_slice(slice_id: str, data: SliceUpdate):
    with get_db() as conn:
        if not conn.execute("SELECT id FROM slices WHERE id = ?", (slice_id,)).fetchone():
            raise HTTPException(status_code=404, detail="Slice not found")

        fields = data.model_fields_set
        updates: dict = {}
        if "role" in fields:
            updates["role"] = data.role
        if "user_name" in fields:
            updates["user_name"] = data.user_name
        if "duration_minutes" in fields:
            updates["duration_minutes"] = data.duration_minutes
        if "enabled" in fields:
            updates["enabled"] = int(data.enabled)
        if "parent_id" in fields:
            updates["parent_id"] = data.parent_id
        if "order_index" in fields:
            updates["order_index"] = data.order_index

        if updates:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE slices SET {set_clause} WHERE id = ?",
                (*updates.values(), slice_id),
            )
        row = conn.execute("SELECT * FROM slices WHERE id = ?", (slice_id,)).fetchone()
    return row_to_slice(row)


@app.delete("/api/slices/{slice_id}")
def delete_slice(slice_id: str):
    with get_db() as conn:
        def delete_recursive(sid: str):
            children = conn.execute(
                "SELECT id FROM slices WHERE parent_id = ?", (sid,)
            ).fetchall()
            for child in children:
                delete_recursive(child["id"])
            conn.execute("DELETE FROM slices WHERE id = ?", (sid,))

        delete_recursive(slice_id)
    return {"ok": True}


@app.post("/api/reorder")
def reorder_slices(items: list[ReorderItem]):
    with get_db() as conn:
        for item in items:
            conn.execute(
                "UPDATE slices SET parent_id = ?, order_index = ? WHERE id = ?",
                (item.parent_id, item.order_index, item.id),
            )
    return {"ok": True}


@app.put("/api/settings")
def update_settings(data: SettingsUpdate):
    with get_db() as conn:
        if data.starting_time is not None:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('starting_time', ?)",
                (data.starting_time,),
            )
        if data.title is not None:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('title', ?)",
                (data.title,),
            )
        result = {r["key"]: r["value"] for r in conn.execute(
            "SELECT key, value FROM settings"
        ).fetchall()}
    return result


static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
