"""SQLite gateway helpers for the runtime knowledge base."""

from collections.abc import Iterator
from contextlib import contextmanager
import json
import sqlite3
from pathlib import Path
from threading import RLock
from typing import Any

SQLITE_BUSY_TIMEOUT_MS = 30_000
CURRENT_SCHEMA_VERSION = 3


class SQLiteGateway:
    """Lightweight SQLite gateway with serialized write transactions."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._write_lock = RLock()

    def initialize(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            cursor = connection.cursor()
            cursor.executescript(
                """
                PRAGMA journal_mode=WAL;
                PRAGMA synchronous=NORMAL;
                PRAGMA foreign_keys=ON;

                CREATE TABLE IF NOT EXISTS app_meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS model_config (
                    id TEXT PRIMARY KEY,
                    provider TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    llm_model TEXT NOT NULL,
                    embedding_model TEXT NOT NULL,
                    api_key TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS sources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    source_kind TEXT NOT NULL,
                    input_mode TEXT NOT NULL,
                    file_type TEXT,
                    storage_path TEXT,
                    strategy TEXT NOT NULL,
                    status TEXT NOT NULL,
                    summary TEXT,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS source_versions (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    version_number INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    activated_at TEXT,
                    updated_at TEXT NOT NULL,
                    UNIQUE(source_id, version_number),
                    FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS paragraphs (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    version_id TEXT NOT NULL,
                    position INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    knowledge_type TEXT NOT NULL,
                    token_count INTEGER NOT NULL DEFAULT 0,
                    vector_state TEXT NOT NULL DEFAULT 'pending',
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(source_id, version_id, position),
                    FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS entities (
                    id TEXT PRIMARY KEY,
                    display_name TEXT NOT NULL,
                    canonical_name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    appearance_count INTEGER NOT NULL DEFAULT 1,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS relations (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL DEFAULT '',
                    version_id TEXT NOT NULL DEFAULT '',
                    subject_entity_id TEXT NOT NULL,
                    predicate TEXT NOT NULL,
                    object_entity_id TEXT NOT NULL,
                    confidence REAL NOT NULL DEFAULT 1.0,
                    source_paragraph_id TEXT,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(subject_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
                    FOREIGN KEY(object_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
                    FOREIGN KEY(source_paragraph_id) REFERENCES paragraphs(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS paragraph_entities (
                    id TEXT PRIMARY KEY,
                    paragraph_id TEXT NOT NULL,
                    source_id TEXT NOT NULL DEFAULT '',
                    version_id TEXT NOT NULL DEFAULT '',
                    entity_id TEXT NOT NULL,
                    mention_count INTEGER NOT NULL DEFAULT 1,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(paragraph_id, entity_id),
                    FOREIGN KEY(paragraph_id) REFERENCES paragraphs(id) ON DELETE CASCADE,
                    FOREIGN KEY(entity_id) REFERENCES entities(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS paragraph_relations (
                    id TEXT PRIMARY KEY,
                    paragraph_id TEXT NOT NULL,
                    source_id TEXT NOT NULL DEFAULT '',
                    version_id TEXT NOT NULL DEFAULT '',
                    relation_id TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(paragraph_id, relation_id),
                    FOREIGN KEY(paragraph_id) REFERENCES paragraphs(id) ON DELETE CASCADE,
                    FOREIGN KEY(relation_id) REFERENCES relations(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS manual_relations (
                    id TEXT PRIMARY KEY,
                    subject_node_id TEXT NOT NULL,
                    predicate TEXT NOT NULL,
                    object_node_id TEXT NOT NULL,
                    weight REAL NOT NULL DEFAULT 1.0,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS import_jobs (
                    id TEXT PRIMARY KEY,
                    source TEXT NOT NULL,
                    input_mode TEXT NOT NULL,
                    strategy TEXT NOT NULL,
                    status TEXT NOT NULL,
                    current_step TEXT NOT NULL,
                    progress REAL NOT NULL DEFAULT 0,
                    total_files INTEGER NOT NULL DEFAULT 0,
                    completed_files INTEGER NOT NULL DEFAULT 0,
                    failed_files INTEGER NOT NULL DEFAULT 0,
                    total_chunks INTEGER NOT NULL DEFAULT 0,
                    completed_chunks INTEGER NOT NULL DEFAULT 0,
                    failed_chunks INTEGER NOT NULL DEFAULT 0,
                    message TEXT,
                    error TEXT,
                    params TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    started_at TEXT,
                    finished_at TEXT,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS import_job_files (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    source_id TEXT,
                    name TEXT NOT NULL,
                    source_kind TEXT NOT NULL,
                    input_mode TEXT NOT NULL,
                    strategy TEXT NOT NULL,
                    status TEXT NOT NULL,
                    current_step TEXT NOT NULL,
                    progress REAL NOT NULL DEFAULT 0,
                    total_chunks INTEGER NOT NULL DEFAULT 0,
                    completed_chunks INTEGER NOT NULL DEFAULT 0,
                    failed_chunks INTEGER NOT NULL DEFAULT 0,
                    storage_path TEXT,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(job_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
                    FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS import_job_chunks (
                    id TEXT PRIMARY KEY,
                    job_id TEXT NOT NULL,
                    file_id TEXT NOT NULL,
                    paragraph_id TEXT,
                    chunk_index INTEGER NOT NULL,
                    chunk_type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    step TEXT NOT NULL,
                    progress REAL NOT NULL DEFAULT 0,
                    content_preview TEXT,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(job_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
                    FOREIGN KEY(file_id) REFERENCES import_job_files(id) ON DELETE CASCADE,
                    FOREIGN KEY(paragraph_id) REFERENCES paragraphs(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_message_at TEXT
                );

                CREATE TABLE IF NOT EXISTS chat_messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    turn_index INTEGER NOT NULL DEFAULT 0,
                    citations TEXT NOT NULL DEFAULT '[]',
                    scope TEXT NOT NULL DEFAULT '{}',
                    sources TEXT NOT NULL DEFAULT '[]',
                    execution TEXT NOT NULL DEFAULT '{}',
                    retrieval_trace TEXT NOT NULL DEFAULT '{}',
                    highlighted_node_ids TEXT NOT NULL DEFAULT '[]',
                    highlighted_edge_ids TEXT NOT NULL DEFAULT '[]',
                    error TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS record_rows (
                    id TEXT PRIMARY KEY,
                    paragraph_id TEXT NOT NULL UNIQUE,
                    source_id TEXT NOT NULL,
                    version_id TEXT NOT NULL DEFAULT '',
                    worksheet_name TEXT NOT NULL,
                    worksheet_key TEXT NOT NULL,
                    row_index INTEGER NOT NULL,
                    record_key TEXT NOT NULL,
                    entity_name TEXT NOT NULL,
                    content TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(paragraph_id) REFERENCES paragraphs(id) ON DELETE CASCADE,
                    FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS record_cells (
                    id TEXT PRIMARY KEY,
                    record_row_id TEXT NOT NULL,
                    column_name TEXT NOT NULL,
                    normalized_column_name TEXT NOT NULL,
                    cell_value TEXT NOT NULL,
                    normalized_value TEXT NOT NULL,
                    is_indexed INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(record_row_id) REFERENCES record_rows(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_paragraphs_source_id ON paragraphs(source_id);
                CREATE INDEX IF NOT EXISTS idx_source_versions_source_status ON source_versions(source_id, status);
                CREATE INDEX IF NOT EXISTS idx_entities_canonical_name ON entities(canonical_name);
                CREATE INDEX IF NOT EXISTS idx_relations_subject_entity_id ON relations(subject_entity_id);
                CREATE INDEX IF NOT EXISTS idx_relations_object_entity_id ON relations(object_entity_id);
                CREATE INDEX IF NOT EXISTS idx_relations_source_paragraph_id ON relations(source_paragraph_id);
                CREATE INDEX IF NOT EXISTS idx_paragraph_entities_entity_id ON paragraph_entities(entity_id);
                CREATE INDEX IF NOT EXISTS idx_paragraph_entities_paragraph_id ON paragraph_entities(paragraph_id);
                CREATE INDEX IF NOT EXISTS idx_paragraph_relations_relation_id ON paragraph_relations(relation_id);
                CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_record_rows_source_id ON record_rows(source_id);
                CREATE INDEX IF NOT EXISTS idx_record_rows_worksheet_key ON record_rows(worksheet_key);
                CREATE INDEX IF NOT EXISTS idx_record_rows_record_key ON record_rows(record_key);
                CREATE INDEX IF NOT EXISTS idx_record_cells_lookup ON record_cells(normalized_column_name, normalized_value);
                CREATE INDEX IF NOT EXISTS idx_record_cells_row_id ON record_cells(record_row_id);
                """
            )
            self._apply_migrations(connection)
            self._ensure_runtime_indexes(connection)
            connection.commit()

    def get_schema_version(self) -> int:
        with self._connect() as connection:
            return self._read_schema_version(connection)

    def check_read_write(self) -> None:
        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute("SELECT 1")
            connection.rollback()
        finally:
            connection.close()

    def backup_to(self, target_path: Path) -> None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as source_connection:
            destination_connection = sqlite3.connect(target_path)
            try:
                source_connection.backup(destination_connection)
                destination_connection.commit()
            finally:
                destination_connection.close()

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        """返回串行化的写事务上下文。"""

        with self._write_lock:
            connection = self._connect()
            try:
                connection.execute("BEGIN IMMEDIATE")
                yield connection
                connection.commit()
            except Exception:
                connection.rollback()
                raise
            finally:
                connection.close()

    def fetch_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(sql, params).fetchone()
        if row is None:
            return None
        return self._row_to_dict(row)

    def fetch_all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(sql, params).fetchall()
        return [self._row_to_dict(row) for row in rows]

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        with self._write_lock, self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(sql, params)
            connection.commit()

    def dump_json(self, payload: dict[str, Any] | None) -> str:
        return json.dumps(payload or {}, ensure_ascii=False, sort_keys=True)

    def load_json(self, raw_value: str | None) -> dict[str, Any]:
        if not raw_value:
            return {}
        try:
            loaded = json.loads(raw_value)
        except json.JSONDecodeError:
            return {}
        return loaded if isinstance(loaded, dict) else {}

    def load_json_value(self, raw_value: str | None, *, default: Any) -> Any:
        if not raw_value:
            return default
        try:
            loaded = json.loads(raw_value)
        except json.JSONDecodeError:
            return default
        return loaded

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, timeout=SQLITE_BUSY_TIMEOUT_MS / 1000)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute(f"PRAGMA busy_timeout={SQLITE_BUSY_TIMEOUT_MS}")
        return connection

    def _apply_migrations(self, connection: sqlite3.Connection) -> None:
        current_version = self._read_schema_version(connection)
        if current_version < 1:
            self._write_schema_version(connection, 1)
            current_version = 1
        if current_version < 2:
            connection.executescript(
                """
                CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
                CREATE INDEX IF NOT EXISTS idx_manual_relations_subject_node_id ON manual_relations(subject_node_id);
                CREATE INDEX IF NOT EXISTS idx_manual_relations_object_node_id ON manual_relations(object_node_id);
                CREATE INDEX IF NOT EXISTS idx_import_job_files_status ON import_job_files(status);
                """
            )
            self._write_schema_version(connection, 2)
            current_version = 2
        if current_version < 3:
            self._migrate_to_v3(connection)
            self._write_schema_version(connection, 3)

    def _ensure_runtime_indexes(self, connection: sqlite3.Connection) -> None:
        connection.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_paragraphs_source_version ON paragraphs(source_id, version_id);
            CREATE INDEX IF NOT EXISTS idx_relations_source_version ON relations(source_id, version_id);
            CREATE INDEX IF NOT EXISTS idx_paragraph_entities_source_version ON paragraph_entities(source_id, version_id);
            CREATE INDEX IF NOT EXISTS idx_paragraph_relations_source_version ON paragraph_relations(source_id, version_id);
            CREATE INDEX IF NOT EXISTS idx_record_rows_source_version ON record_rows(source_id, version_id);
            """
        )

    def _read_schema_version(self, connection: sqlite3.Connection) -> int:
        row = connection.execute(
            "SELECT value FROM app_meta WHERE key = ?",
            ("schema_version",),
        ).fetchone()
        if row is None:
            return 0
        try:
            return int(row["value"])
        except (TypeError, ValueError):
            return 0

    def _write_schema_version(self, connection: sqlite3.Connection, version: int) -> None:
        connection.execute(
            """
            INSERT INTO app_meta (key, value)
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            ("schema_version", str(version)),
        )

    def _migrate_to_v3(self, connection: sqlite3.Connection) -> None:
        connection.commit()
        connection.execute("PRAGMA foreign_keys=OFF")
        try:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS source_versions (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    version_number INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    activated_at TEXT,
                    updated_at TEXT NOT NULL,
                    UNIQUE(source_id, version_number),
                    FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
                );
                """
            )
            self._ensure_column(connection, "record_rows", "version_id", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(connection, "relations", "source_id", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(connection, "relations", "version_id", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(connection, "paragraph_entities", "source_id", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(connection, "paragraph_entities", "version_id", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(connection, "paragraph_relations", "source_id", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(connection, "paragraph_relations", "version_id", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(connection, "chat_messages", "scope", "TEXT NOT NULL DEFAULT '{}'")
            self._ensure_column(connection, "chat_messages", "sources", "TEXT NOT NULL DEFAULT '[]'")

            self._rebuild_paragraphs_table(connection)

            source_rows = connection.execute(
                "SELECT id, created_at, updated_at FROM sources ORDER BY created_at ASC"
            ).fetchall()
            for row in source_rows:
                source_id = str(row["id"])
                legacy_version_id = f"{source_id}:legacy"
                connection.execute(
                    """
                    INSERT OR IGNORE INTO source_versions (
                        id, source_id, version_number, status, metadata, created_at, activated_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        legacy_version_id,
                        source_id,
                        1,
                        "active",
                        "{}",
                        str(row["created_at"]),
                        str(row["updated_at"]),
                        str(row["updated_at"]),
                    ),
                )

            connection.execute(
                """
                UPDATE paragraphs
                SET version_id = CASE
                    WHEN TRIM(COALESCE(version_id, '')) = '' THEN source_id || ':legacy'
                    ELSE version_id
                END
                """
            )
            connection.execute(
                """
                UPDATE record_rows
                SET version_id = COALESCE(
                    NULLIF(record_rows.version_id, ''),
                    (
                        SELECT paragraphs.version_id
                        FROM paragraphs
                        WHERE paragraphs.id = record_rows.paragraph_id
                    ),
                    record_rows.source_id || ':legacy'
                )
                """
            )
            connection.execute(
                """
                UPDATE relations
                SET source_id = COALESCE(
                    NULLIF(relations.source_id, ''),
                    (
                        SELECT paragraphs.source_id
                        FROM paragraphs
                        WHERE paragraphs.id = relations.source_paragraph_id
                    ),
                    json_extract(relations.metadata, '$.source_id'),
                    ''
                )
                """
            )
            connection.execute(
                """
                UPDATE relations
                SET version_id = COALESCE(
                    NULLIF(relations.version_id, ''),
                    (
                        SELECT paragraphs.version_id
                        FROM paragraphs
                        WHERE paragraphs.id = relations.source_paragraph_id
                    ),
                    CASE
                        WHEN TRIM(COALESCE(relations.source_id, '')) = '' THEN ''
                        ELSE relations.source_id || ':legacy'
                    END
                )
                """
            )
            connection.execute(
                """
                UPDATE paragraph_entities
                SET source_id = COALESCE(
                    NULLIF(paragraph_entities.source_id, ''),
                    (
                        SELECT paragraphs.source_id
                        FROM paragraphs
                        WHERE paragraphs.id = paragraph_entities.paragraph_id
                    ),
                    ''
                ),
                    version_id = COALESCE(
                        NULLIF(paragraph_entities.version_id, ''),
                        (
                            SELECT paragraphs.version_id
                            FROM paragraphs
                            WHERE paragraphs.id = paragraph_entities.paragraph_id
                        ),
                        ''
                    )
                """
            )
            connection.execute(
                """
                UPDATE paragraph_relations
                SET source_id = COALESCE(
                    NULLIF(paragraph_relations.source_id, ''),
                    (
                        SELECT paragraphs.source_id
                        FROM paragraphs
                        WHERE paragraphs.id = paragraph_relations.paragraph_id
                    ),
                    ''
                ),
                    version_id = COALESCE(
                        NULLIF(paragraph_relations.version_id, ''),
                        (
                            SELECT paragraphs.version_id
                            FROM paragraphs
                            WHERE paragraphs.id = paragraph_relations.paragraph_id
                        ),
                        ''
                    )
                """
            )
            connection.executescript(
                """
                CREATE INDEX IF NOT EXISTS idx_paragraphs_source_version ON paragraphs(source_id, version_id);
                CREATE INDEX IF NOT EXISTS idx_source_versions_source_status ON source_versions(source_id, status);
                CREATE INDEX IF NOT EXISTS idx_relations_source_version ON relations(source_id, version_id);
                CREATE INDEX IF NOT EXISTS idx_paragraph_entities_source_version ON paragraph_entities(source_id, version_id);
                CREATE INDEX IF NOT EXISTS idx_paragraph_relations_source_version ON paragraph_relations(source_id, version_id);
                CREATE INDEX IF NOT EXISTS idx_record_rows_source_version ON record_rows(source_id, version_id);
                """
            )
        finally:
            connection.commit()
            connection.execute("PRAGMA foreign_keys=ON")

    def _ensure_column(self, connection: sqlite3.Connection, table_name: str, column_name: str, column_sql: str) -> None:
        if self._column_exists(connection, table_name, column_name):
            return
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")

    def _column_exists(self, connection: sqlite3.Connection, table_name: str, column_name: str) -> bool:
        rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
        return any(str(row["name"]) == column_name for row in rows)

    def _rebuild_paragraphs_table(self, connection: sqlite3.Connection) -> None:
        has_version_id = self._column_exists(connection, "paragraphs", "version_id")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS paragraphs_v3 (
                id TEXT PRIMARY KEY,
                source_id TEXT NOT NULL,
                version_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                content TEXT NOT NULL,
                knowledge_type TEXT NOT NULL,
                token_count INTEGER NOT NULL DEFAULT 0,
                vector_state TEXT NOT NULL DEFAULT 'pending',
                metadata TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(source_id, version_id, position),
                FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE
            );
            """
        )
        if has_version_id:
            connection.execute(
                """
                INSERT OR REPLACE INTO paragraphs_v3 (
                    id, source_id, version_id, position, content, knowledge_type, token_count,
                    vector_state, metadata, created_at, updated_at
                )
                SELECT
                    id, source_id, COALESCE(version_id, ''), position, content, knowledge_type,
                    token_count, vector_state, metadata, created_at, updated_at
                FROM paragraphs
                """
            )
        else:
            connection.execute(
                """
                INSERT OR REPLACE INTO paragraphs_v3 (
                    id, source_id, version_id, position, content, knowledge_type, token_count,
                    vector_state, metadata, created_at, updated_at
                )
                SELECT
                    id, source_id, '', position, content, knowledge_type,
                    token_count, vector_state, metadata, created_at, updated_at
                FROM paragraphs
                """
            )
        connection.executescript(
            """
            DROP TABLE paragraphs;
            ALTER TABLE paragraphs_v3 RENAME TO paragraphs;
            CREATE INDEX IF NOT EXISTS idx_paragraphs_source_id ON paragraphs(source_id);
            CREATE INDEX IF NOT EXISTS idx_paragraphs_source_version ON paragraphs(source_id, version_id);
            """
        )

    def _row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        payload = dict(row)
        for field_name in ("metadata", "params"):
            if field_name in payload:
                payload[field_name] = self.load_json(payload[field_name])
        for field_name, default in (
            ("citations", []),
            ("scope", {}),
            ("sources", []),
            ("execution", {}),
            ("retrieval_trace", {}),
            ("highlighted_node_ids", []),
            ("highlighted_edge_ids", []),
        ):
            if field_name in payload:
                payload[field_name] = self.load_json_value(payload[field_name], default=default)
        return payload

