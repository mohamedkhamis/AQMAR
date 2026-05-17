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


def test_load_config_reads_sqlserver_conn_str(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "TELEGRAM_API_ID=12345\n"
        "TELEGRAM_API_HASH=abc\n"
        "TELEGRAM_PHONE=+20111\n"
        "TELEGRAM_2FA_PASSWORD=pw\n"
        "CHANNEL_USERNAME=TestCh\n"
        "SESSION_PATH=sess/foo\n"
        "DAILY_RUN_HOUR=7\n"
        "SQLSERVER_CONN_STR=DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost;DATABASE=aqmar;Trusted_Connection=yes\n"
    )
    cfg = load_config(env_path=str(env_file))
    assert "ODBC Driver 17" in cfg.sqlserver_conn_str
    assert "DATABASE=aqmar" in cfg.sqlserver_conn_str


def test_load_config_sqlserver_conn_str_defaults_to_empty(tmp_path):
    """Backwards compatible: missing SQLSERVER_CONN_STR shouldn't break setups."""
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
    assert cfg.sqlserver_conn_str == ""


def test_load_config_admin_token(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "TELEGRAM_API_ID=12345\n"
        "TELEGRAM_API_HASH=abc\n"
        "TELEGRAM_PHONE=+20111\n"
        "TELEGRAM_2FA_PASSWORD=pw\n"
        "CHANNEL_USERNAME=TestCh\n"
        "SESSION_PATH=sess/foo\n"
        "DAILY_RUN_HOUR=7\n"
        "ADMIN_TOKEN=s3cr3t-t0k3n-xyz\n"
    )
    cfg = load_config(env_path=str(env_file))
    assert cfg.admin_token == "s3cr3t-t0k3n-xyz"


def test_load_config_admin_token_defaults_to_empty(tmp_path):
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
    assert cfg.admin_token == ""
