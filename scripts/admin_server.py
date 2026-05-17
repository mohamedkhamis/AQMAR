# scripts/admin_server.py
"""Entry point for the AQMAR admin portal — a thin uvicorn launcher around
src.admin_app.

Usage:
    python scripts/admin_server.py
    # → http://localhost:8000/

Env vars (all in .env):
    SQLSERVER_CONN_STR  — pyodbc conn string (see .env.example)
    ADMIN_TOKEN         — required for write endpoints (X-Admin-Token header)
"""
import sys
from pathlib import Path

# UTF-8 stdout so Arabic in row data doesn't crash Windows cp1252 console.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.admin_app import app, cfg


def main():
    import uvicorn
    print("=" * 70)
    print(" AQMAR admin server")
    print("=" * 70)
    print(f"  URL:           http://localhost:8000/")
    print(f"  API docs:      http://localhost:8000/docs")
    print(f"  SQL Server:    {'configured' if cfg.sqlserver_conn_str else 'NOT CONFIGURED (read endpoints will 500)'}")
    print(f"  ADMIN_TOKEN:   {'configured' if cfg.admin_token else 'NOT CONFIGURED (writes disabled)'}")
    print("=" * 70)
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
