-- scripts/migrate_add_ai_verify.sql
--
-- Adds the AI verification track (2026-06-10 design):
--   ai_verified     BIT NOT NULL DEFAULT 0  — set by the AI date-check batch
--   ai_verified_at  DATETIME2 NULL          — when the batch checked the row
--   ai_note         NVARCHAR(255) NULL      — audit: what the AI found/changed
--
-- Independent of the human verification_status workflow — the AI batch never
-- touches verification_status and the admin verify flow never touches these.
--
-- Idempotent: INFORMATION_SCHEMA guards make re-running a no-op.
--
-- Apply with:
--   sqlcmd -S localhost -d aqmar -E -i scripts\migrate_add_ai_verify.sql

USE aqmar;
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'martyrs'
      AND COLUMN_NAME = 'ai_verified'
)
BEGIN
    ALTER TABLE dbo.martyrs
        ADD ai_verified BIT NOT NULL CONSTRAINT DF_martyrs_ai_verified DEFAULT 0;
    PRINT 'Added dbo.martyrs.ai_verified';
END
ELSE
    PRINT 'dbo.martyrs.ai_verified already exists, skipping';
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'martyrs'
      AND COLUMN_NAME = 'ai_verified_at'
)
BEGIN
    ALTER TABLE dbo.martyrs ADD ai_verified_at DATETIME2 NULL;
    PRINT 'Added dbo.martyrs.ai_verified_at';
END
ELSE
    PRINT 'dbo.martyrs.ai_verified_at already exists, skipping';
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'martyrs'
      AND COLUMN_NAME = 'ai_note'
)
BEGIN
    ALTER TABLE dbo.martyrs ADD ai_note NVARCHAR(255) NULL;
    PRINT 'Added dbo.martyrs.ai_note';
END
ELSE
    PRINT 'dbo.martyrs.ai_note already exists, skipping';
GO
