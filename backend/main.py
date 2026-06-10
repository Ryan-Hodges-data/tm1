import io
import os
import uuid
import sqlite3
from typing import Optional
from contextlib import contextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

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


# ── PDF helpers ──────────────────────────────────────────────────────────────

def _parse_start_time(time_str: str) -> int:
    h, *rest = time_str.split(":")
    m = int(rest[0]) if rest else 0
    return (int(h) % 12) * 60 + m


def _fmt(total_min: int) -> str:
    w = total_min % 720
    h, m = divmod(w, 60)
    return f"{12 if h == 0 else h}:{m:02d}"


def _build_timeline(slices: list, starting_time: str) -> list:
    cursor = _parse_start_time(starting_time)
    result = []

    def traverse(parent_id, depth):
        nonlocal cursor
        for s in sorted(
            [s for s in slices if s.get("parent_id") == parent_id],
            key=lambda s: s.get("order_index", 0),
        ):
            start = cursor
            if s.get("enabled") and s.get("duration_minutes", 0) > 0:
                cursor += s["duration_minutes"]
            result.append({**s, "depth": depth, "start_min": start, "end_min": cursor})
            traverse(s["id"], depth + 1)

    traverse(None, 0)
    return result


@app.get("/api/agenda/pdf")
def download_pdf():
    with get_db() as conn:
        slices = [row_to_slice(r) for r in conn.execute(
            "SELECT * FROM slices ORDER BY order_index"
        ).fetchall()]
        settings = {r["key"]: r["value"] for r in conn.execute(
            "SELECT key, value FROM settings"
        ).fetchall()}

    title = settings.get("title", "Meeting Agenda")
    start_time = settings.get("starting_time", "9:00")
    entries = _build_timeline(slices, start_time)

    # ── palette ──
    C_DARK   = colors.HexColor("#1e293b")
    C_MID    = colors.HexColor("#475569")
    C_LIGHT  = colors.HexColor("#94a3b8")
    C_BORDER = colors.HexColor("#e2e8f0")
    C_HEAD   = colors.HexColor("#f1f5f9")
    C_ALT    = colors.HexColor("#f8fafc")

    # ── styles ──
    def ps(name, **kw):
        return ParagraphStyle(name, **kw)

    s_title = ps("T", fontName="Helvetica-Bold", fontSize=22,
                 textColor=C_DARK, leading=28, spaceAfter=4)
    s_sub   = ps("S", fontName="Helvetica", fontSize=11,
                 textColor=C_MID, spaceAfter=0)
    s_head  = ps("H", fontName="Helvetica-Bold", fontSize=8,
                 textColor=C_MID, leading=10)
    s_cell  = ps("C", fontName="Helvetica", fontSize=10,
                 textColor=C_DARK, leading=14)
    s_dim   = ps("D", fontName="Helvetica-Oblique", fontSize=10,
                 textColor=C_LIGHT, leading=14)
    s_right = ps("R", fontName="Helvetica", fontSize=10,
                 textColor=C_DARK, leading=14, alignment=TA_RIGHT)
    s_right_dim = ps("RD", fontName="Helvetica-Oblique", fontSize=10,
                     textColor=C_LIGHT, leading=14, alignment=TA_RIGHT)

    # ── build story ──
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.9 * inch, rightMargin=0.9 * inch,
        topMargin=0.9 * inch, bottomMargin=0.9 * inch,
        title=title,
    )
    story = []

    story.append(Paragraph(title, s_title))
    story.append(Paragraph(f"Starting at {start_time}", s_sub))
    story.append(Spacer(1, 14))
    story.append(HRFlowable(width="100%", thickness=1, color=C_BORDER, spaceAfter=14))

    if not entries:
        story.append(Paragraph("No agenda items.", s_dim))
    else:
        COL = [1.55 * inch, 1.35 * inch, 2.3 * inch, 0.65 * inch]

        rows = [[
            Paragraph("TIME", s_head),
            Paragraph("ROLE", s_head),
            Paragraph("NAME", s_head),
            Paragraph("MIN", s_head),
        ]]
        alt_rows = []

        for i, e in enumerate(entries, start=1):
            off = not e.get("enabled") or e.get("duration_minutes", 0) == 0
            sc, sr = (s_dim, s_right_dim) if off else (s_cell, s_right)
            pad = " " * (e["depth"] * 4)  # non-breaking spaces for indent

            if off:
                time_str, dur_str = "—", "—"
            else:
                time_str = f"{_fmt(e['start_min'])} – {_fmt(e['end_min'])}"
                dur_str  = str(e.get("duration_minutes", ""))

            rows.append([
                Paragraph(pad + time_str, sc),
                Paragraph(e.get("role") or "", sc),
                Paragraph(e.get("user_name") or "", sc),
                Paragraph(dur_str, sr),
            ])
            if i % 2 == 0:
                alt_rows.append(("BACKGROUND", (0, i), (-1, i), C_ALT))

        tbl = Table(rows, colWidths=COL, repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, 0), C_HEAD),
            ("LINEBELOW",     (0, 0), (-1, 0), 1,   C_BORDER),
            ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
            ("LINEBELOW",     (0, 1), (-1, -1), 0.5, C_BORDER),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8, ),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8, ),
            ("TOPPADDING",    (0, 0), (-1, 0),  6, ),
            ("BOTTOMPADDING", (0, 0), (-1, 0),  6, ),
            ("TOPPADDING",    (0, 1), (-1, -1), 5, ),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 5, ),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            *alt_rows,
        ]))
        story.append(tbl)

        total = sum(
            e.get("duration_minutes", 0)
            for e in entries
            if e.get("enabled") and e.get("duration_minutes", 0) > 0
        )
        story.append(Spacer(1, 10))
        story.append(HRFlowable(width="100%", thickness=0.5, color=C_BORDER, spaceAfter=6))
        story.append(Paragraph(
            f"Total duration: <b>{total} minutes</b>",
            ps("F", fontName="Helvetica", fontSize=9, textColor=C_MID, alignment=TA_RIGHT),
        ))

    doc.build(story)
    buf.seek(0)
    safe = "".join(c if c.isalnum() or c in " _-" else "_" for c in title).strip()
    filename = f"{safe or 'agenda'}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
if os.path.isdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
