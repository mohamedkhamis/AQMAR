import os
from src.config import load_config

def test_load_config_reads_env(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "TELEGRAM_API_ID=12345\n"
        "TELEGRAM_API_HASH=abc\n"
        "TELEGRAM_PHONE=+20111\n"
        "TELEGRAM_2FA_PASSWORD=pw\n"
        "CHANNEL_USERNAME=TestCh\n"
        "SESSION_PATH=sess/foo\n"
        "DAILY_RUN_HOUR=7\n"
    )
    cfg = load_config(env_path=str(env_file))
    assert cfg.api_id == 12345
    assert cfg.api_hash == "abc"
    assert cfg.phone == "+20111"
    assert cfg.two_fa_password == "pw"
    assert cfg.channel_username == "TestCh"
    assert cfg.session_path == "sess/foo"
    assert cfg.daily_run_hour == 7
