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
    )
