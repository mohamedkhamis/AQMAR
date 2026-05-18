-- scripts/setup_sqlserver_schema.sql
--
-- AQMAR SQL Server schema. Run against the `aqmar` database:
--
--   sqlcmd -S localhost -d aqmar -E -i scripts\setup_sqlserver_schema.sql
--
-- OR via the Python script:
--
--   python scripts\setup_sqlserver_schema.py
--
-- Idempotent — safe to re-run. Uses IF NOT EXISTS guards everywhere.
--
-- Tables created:
--   martyrs           main table; every scraped row lives here, with a
--                     verification_status that the admin updates
--   publish_versions  log of each export-to-JSON publish, with row count
--
-- The admin verification workflow:
--   1. scraper writes new rows with verification_status='unverified'
--   2. admin reviews via the SPA, edits any field, marks 'verified'
--   3. export_to_json.py reads only verified rows for publishing
-- =============================================================================

USE aqmar;
GO

-- =============================================================================
-- MAIN TABLE
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'martyrs')
BEGIN
    CREATE TABLE dbo.martyrs (
        msg_id              INT             NOT NULL PRIMARY KEY,
        name                NVARCHAR(255)   NULL,
        name_normalized     NVARCHAR(255)   NULL,
        birth_date          DATE            NULL,
        martyrdom_date      DATE            NULL,
        city                NVARCHAR(100)   NULL,
        military_rank       NVARCHAR(100)   NULL,
        weapon              NVARCHAR(100)   NULL,
        battalion           NVARCHAR(100)   NULL,
        brigade             NVARCHAR(100)   NULL,
        photo_path          NVARCHAR(500)   NULL,
        -- Semicolon-separated list of OCR source frames extracted from the
        -- Telegram video (e.g. "data/frames/922_28.jpg;data/frames/922_30.jpg").
        -- Shown to the admin in the edit form so they can compare what OCR
        -- saw vs what landed in the structured columns.
        frame_paths         NVARCHAR(MAX)   NULL,
        posted_date         DATETIME2       NULL,
        message_link        NVARCHAR(500)   NULL,
        extraction_status   NVARCHAR(50)    NULL,    -- 'complete', 'partial_birth', etc.
        duplicate_status    NVARCHAR(50)    NULL,

        -- Verification workflow (the whole point of this DB)
        verification_status NVARCHAR(20)    NOT NULL DEFAULT 'unverified',
            -- one of: 'unverified', 'verified', 'rejected'
        verified_at         DATETIME2       NULL,
        verified_by         NVARCHAR(100)   NULL,

        -- Original OCR output preserved even after admin edits (audit trail).
        -- Lets you compare "what OCR said" vs "what admin corrected to".
        -- 255 chars on the date fields too: OCR catastrophes sometimes bleed
        -- entire caption sentences into the date field (e.g. msg 282/295 in
        -- the May 2026 migration), and we want to preserve enough text for
        -- the admin to understand what went wrong.
        ocr_name            NVARCHAR(255)   NULL,
        ocr_birth_date      NVARCHAR(255)   NULL,
        ocr_martyrdom_date  NVARCHAR(255)   NULL,

        -- Standard audit timestamps
        created_at          DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        updated_at          DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),

        -- Constraint: verification_status must be one of the three allowed values
        CONSTRAINT CK_martyrs_verification_status
            CHECK (verification_status IN ('unverified', 'verified', 'rejected'))
    );

    -- Trigger to auto-update updated_at on row modification
    EXEC('
        CREATE TRIGGER dbo.trg_martyrs_updated_at
        ON dbo.martyrs
        AFTER UPDATE
        AS
        BEGIN
            SET NOCOUNT ON;
            UPDATE dbo.martyrs
            SET updated_at = SYSUTCDATETIME()
            FROM dbo.martyrs m
            INNER JOIN inserted i ON m.msg_id = i.msg_id;
        END
    ');

    -- Indexes for the SPA''s filter / sort dimensions
    CREATE INDEX IX_martyrs_birth        ON dbo.martyrs (birth_date);
    CREATE INDEX IX_martyrs_martyrdom    ON dbo.martyrs (martyrdom_date);
    CREATE INDEX IX_martyrs_verification ON dbo.martyrs (verification_status);
    CREATE INDEX IX_martyrs_posted       ON dbo.martyrs (posted_date DESC);

    PRINT 'Created dbo.martyrs (with trigger + 4 indexes)';
END
ELSE
    PRINT 'dbo.martyrs already exists, skipping';
GO

-- =============================================================================
-- PUBLISH VERSIONS TABLE
-- =============================================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'publish_versions')
BEGIN
    CREATE TABLE dbo.publish_versions (
        version         INT             IDENTITY(1,1) PRIMARY KEY,
        published_at    DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
        row_count       INT             NOT NULL,
        note            NVARCHAR(500)   NULL
    );
    PRINT 'Created dbo.publish_versions';
END
ELSE
    PRINT 'dbo.publish_versions already exists, skipping';
GO

-- =============================================================================
-- Quick sanity check
-- =============================================================================

SELECT 'martyrs'          AS table_name, COUNT(*) AS rows FROM dbo.martyrs
UNION ALL
SELECT 'publish_versions' AS table_name, COUNT(*) AS rows FROM dbo.publish_versions;
GO
