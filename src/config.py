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
    # SQL Server — pyodbc connection string. Example value:
    #   DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=aqmar;
    #   Trusted_Connection=yes;TrustServerCertificate=yes
    sqlserver_conn_str: str
    # Admin API shared secret. The admin SPA sends this as `X-Admin-Token`
    # on write endpoints. Generate a long random string with:
    #   python -c "import secrets; print(secrets.token_urlsafe(32))"
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
        sqlserver_conn_str=raw.get("SQLSERVER_CONN_STR", ""),
        admin_token=raw.get("ADMIN_TOKEN", ""),
    )
