# src/config.py
from dataclasses import dataclass
from dotenv import dotenv_values

@dataclass(frozen=True)
class Config:
    api_id: int
    api_hash: str
    phone: str
    two_fa_password: str
    channel_username: str
    session_path: str
    daily_run_hour: int
    # Supabase — kept as optional empty-string fields for back-compat with
    # tests + scripts that still import Config. All Supabase code paths will
    # be removed in Batch 7 once SQL Server is the canonical source.
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str
    supabase_storage_bucket: str
    # SQL Server — pyodbc connection string. Optional (empty) so the existing
    # pipeline keeps working pre-migration. Example value:
    #   DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=aqmar;
    #   Trusted_Connection=yes;TrustServerCertificate=yes
    sqlserver_conn_str: str
    # Admin API shared secret. The admin SPA sends this as `X-Admin-Token`
    # on write endpoints. Generate a long random string (e.g. via
    # `python -c "import secrets; print(secrets.token_urlsafe(32))"`).
    admin_token: str

def load_config(env_path: str = ".env") -> Config:
    raw = dotenv_values(env_path)
    return Config(
        api_id=int(raw["TELEGRAM_API_ID"]),
        api_hash=raw["TELEGRAM_API_HASH"],
        phone=raw["TELEGRAM_PHONE"],
        two_fa_password=raw.get("TELEGRAM_2FA_PASSWORD", ""),
        channel_username=raw["CHANNEL_USERNAME"],
        session_path=raw.get("SESSION_PATH", "session/aqmar"),
        daily_run_hour=int(raw.get("DAILY_RUN_HOUR", 9)),
        supabase_url=raw.get("SUPABASE_URL", ""),
        supabase_anon_key=raw.get("SUPABASE_ANON_KEY", ""),
        supabase_service_role_key=raw.get("SUPABASE_SERVICE_ROLE_KEY", ""),
        supabase_storage_bucket=raw.get("SUPABASE_STORAGE_BUCKET", "aqmar-photos"),
        sqlserver_conn_str=raw.get("SQLSERVER_CONN_STR", ""),
        admin_token=raw.get("ADMIN_TOKEN", ""),
    )
