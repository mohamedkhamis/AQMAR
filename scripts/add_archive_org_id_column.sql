-- scripts/add_archive_org_id_column.sql
-- Adds the public-CDN identifier column used by the hybrid video-hosting plan
-- (docs/hybrid-video-hosting.md). NULLable because:
--   1. Not every row has a video mirrored to Archive.org yet (Phase 2 migration
--      is incremental — rows without a mirror fall back to the Telegram embed).
--   2. Some Telegram posts are photo-only and never get a video mirror.
--
-- IMPORTANT: archive_org_id is deliberately NOT added to
-- src.sqlserver_client.COLUMNS. The scraper's upsert UPDATE branch rewrites
-- every column in COLUMNS on re-scrape — including archive_org_id would WIPE
-- the mirror identifier the migration script set, exactly the trap that
-- verification_status avoids. The read path uses SELECT * so the column still
-- reaches the API + SPA without being in COLUMNS, and the mirror script does
-- its own targeted `UPDATE dbo.martyrs SET archive_org_id = ? WHERE msg_id = ?`.

USE [aqmar];
GO

-- Required for CREATE INDEX with a WHERE clause (filtered index). sqlcmd
-- doesn't set this ON by default, which fails the filtered index below.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.martyrs') AND name = 'archive_org_id'
)
BEGIN
    ALTER TABLE dbo.martyrs
    ADD archive_org_id NVARCHAR(120) NULL;

    PRINT 'Added archive_org_id column.';
END
ELSE
BEGIN
    PRINT 'archive_org_id column already exists. Skipping.';
END
GO

-- Filtered index for "find rows still needing a mirror" queries the migration
-- script runs (WHERE archive_org_id IS NULL). Filtered so it stays tiny.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_martyrs_archive_org_id' AND object_id = OBJECT_ID('dbo.martyrs')
)
BEGIN
    CREATE INDEX IX_martyrs_archive_org_id
        ON dbo.martyrs (archive_org_id)
        WHERE archive_org_id IS NOT NULL;

    PRINT 'Added index IX_martyrs_archive_org_id.';
END
GO
