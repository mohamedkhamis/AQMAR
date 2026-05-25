-- scripts/migrate_add_featured_frame.sql
--
-- Adds dbo.martyrs.featured_frame_path (Phase 1 of the cover-image feature,
-- 2026-05-25). NVARCHAR(500) matches the existing photo_path column. Holds
-- ONE absolute frame path (a single token from frame_paths) — the frame the
-- admin picked as the "cover" for this row.
--
-- Idempotent: INFORMATION_SCHEMA guard means re-running this is a no-op.
--
-- Apply with:
--   sqlcmd -S localhost -d aqmar -E -i scripts\migrate_add_featured_frame.sql
-- or:
--   python -c "from src.config import load_config; from src.sqlserver_client import make_conn; c=make_conn(load_config()); c.cursor().execute(open('scripts/migrate_add_featured_frame.sql').read()); c.commit()"

USE aqmar;
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'martyrs'
      AND COLUMN_NAME = 'featured_frame_path'
)
BEGIN
    ALTER TABLE dbo.martyrs ADD featured_frame_path NVARCHAR(500) NULL;
    PRINT 'Added dbo.martyrs.featured_frame_path';
END
ELSE
    PRINT 'dbo.martyrs.featured_frame_path already exists, skipping';
GO
