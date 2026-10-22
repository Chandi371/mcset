use crate::models::{BackupRecord, OperationRecord, ServerProfile, ServerType};
use anyhow::{Result, anyhow};
use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(&db_path)
            .map_err(|e| anyhow!("Failed to open SQLite database at {:?}: {}", db_path, e))?;

        let db = Database {
            conn: Arc::new(Mutex::new(conn)),
        };

        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();

        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                server_type TEXT NOT NULL,
                minecraft_version TEXT NOT NULL,
                java_path TEXT,
                min_ram_mb INTEGER NOT NULL,
                max_ram_mb INTEGER NOT NULL,
                jvm_flags TEXT NOT NULL,
                server_dir TEXT NOT NULL,
                jar_file TEXT NOT NULL,
                port INTEGER NOT NULL,
                eula_accepted INTEGER NOT NULL DEFAULT 0,
                autostart INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS backups (
                id TEXT PRIMARY KEY,
                server_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_size_bytes INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                description TEXT NOT NULL,
                FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS operation_history (
                id TEXT PRIMARY KEY,
                server_id TEXT,
                operation_type TEXT NOT NULL,
                details TEXT NOT NULL,
                success INTEGER NOT NULL,
                timestamp INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )?;

        Ok(())
    }

    pub fn insert_server(&self, profile: &ServerProfile) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let server_type_str = serde_json::to_string(&profile.server_type)?
            .trim_matches('"')
            .to_string();

        conn.execute(
            "INSERT INTO servers (
                id, name, server_type, minecraft_version, java_path,
                min_ram_mb, max_ram_mb, jvm_flags, server_dir, jar_file,
                port, eula_accepted, autostart, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                profile.id,
                profile.name,
                server_type_str,
                profile.minecraft_version,
                profile.java_path,
                profile.min_ram_mb,
                profile.max_ram_mb,
                profile.jvm_flags,
                profile.server_dir,
                profile.jar_file,
                profile.port,
                if profile.eula_accepted { 1 } else { 0 },
                if profile.autostart { 1 } else { 0 },
                profile.created_at,
                profile.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn update_server(&self, profile: &ServerProfile) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let server_type_str = serde_json::to_string(&profile.server_type)?
            .trim_matches('"')
            .to_string();

        conn.execute(
            "UPDATE servers SET
                name = ?2,
                server_type = ?3,
                minecraft_version = ?4,
                java_path = ?5,
                min_ram_mb = ?6,
                max_ram_mb = ?7,
                jvm_flags = ?8,
                jar_file = ?9,
                port = ?10,
                eula_accepted = ?11,
                autostart = ?12,
                updated_at = ?13
            WHERE id = ?1",
            params![
                profile.id,
                profile.name,
                server_type_str,
                profile.minecraft_version,
                profile.java_path,
                profile.min_ram_mb,
                profile.max_ram_mb,
                profile.jvm_flags,
                profile.jar_file,
                profile.port,
                if profile.eula_accepted { 1 } else { 0 },
                if profile.autostart { 1 } else { 0 },
                profile.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_server(&self, server_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM servers WHERE id = ?1", params![server_id])?;
        conn.execute(
            "DELETE FROM backups WHERE server_id = ?1",
            params![server_id],
        )?;
        Ok(())
    }

    pub fn get_server(&self, server_id: &str) -> Result<Option<ServerProfile>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, server_type, minecraft_version, java_path,
                    min_ram_mb, max_ram_mb, jvm_flags, server_dir, jar_file,
                    port, eula_accepted, autostart, created_at, updated_at
             FROM servers WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![server_id])?;
        if let Some(row) = rows.next()? {
            let type_str: String = row.get(2)?;
            let server_type: ServerType =
                serde_json::from_str(&format!("\"{}\"", type_str)).unwrap_or(ServerType::Paper);

            Ok(Some(ServerProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                server_type,
                minecraft_version: row.get(3)?,
                java_path: row.get(4)?,
                min_ram_mb: row.get(5)?,
                max_ram_mb: row.get(6)?,
                jvm_flags: row.get(7)?,
                server_dir: row.get(8)?,
                jar_file: row.get(9)?,
                port: row.get(10)?,
                eula_accepted: row.get::<_, i32>(11)? != 0,
                autostart: row.get::<_, i32>(12)? != 0,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn list_servers(&self) -> Result<Vec<ServerProfile>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, server_type, minecraft_version, java_path,
                    min_ram_mb, max_ram_mb, jvm_flags, server_dir, jar_file,
                    port, eula_accepted, autostart, created_at, updated_at
             FROM servers ORDER BY created_at DESC",
        )?;

        let rows = stmt.query_map([], |row| {
            let type_str: String = row.get(2)?;
            let server_type: ServerType =
                serde_json::from_str(&format!("\"{}\"", type_str)).unwrap_or(ServerType::Paper);

            Ok(ServerProfile {
                id: row.get(0)?,
                name: row.get(1)?,
                server_type,
                minecraft_version: row.get(3)?,
                java_path: row.get(4)?,
                min_ram_mb: row.get(5)?,
                max_ram_mb: row.get(6)?,
                jvm_flags: row.get(7)?,
                server_dir: row.get(8)?,
                jar_file: row.get(9)?,
                port: row.get(10)?,
                eula_accepted: row.get::<_, i32>(11)? != 0,
                autostart: row.get::<_, i32>(12)? != 0,
                created_at: row.get(13)?,
                updated_at: row.get(14)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn insert_backup(&self, record: &BackupRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO backups (id, server_id, file_name, file_size_bytes, created_at, description)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                record.id,
                record.server_id,
                record.file_name,
                record.file_size_bytes as i64,
                record.created_at,
                record.description,
            ],
        )?;
        Ok(())
    }

    pub fn list_backups(&self, server_id: &str) -> Result<Vec<BackupRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, server_id, file_name, file_size_bytes, created_at, description
             FROM backups WHERE server_id = ?1 ORDER BY created_at DESC",
        )?;

        let rows = stmt.query_map(params![server_id], |row| {
            Ok(BackupRecord {
                id: row.get(0)?,
                server_id: row.get(1)?,
                file_name: row.get(2)?,
                file_size_bytes: row.get::<_, i64>(3)? as u64,
                created_at: row.get(4)?,
                description: row.get(5)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn delete_backup(&self, backup_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM backups WHERE id = ?1", params![backup_id])?;
        Ok(())
    }

    pub fn record_operation(
        &self,
        server_id: Option<&str>,
        operation_type: &str,
        details: &str,
        success: bool,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();

        conn.execute(
            "INSERT INTO operation_history (id, server_id, operation_type, details, success, timestamp)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                server_id,
                operation_type,
                details,
                if success { 1 } else { 0 },
                now
            ],
        )?;
        Ok(())
    }

    pub fn list_operations(&self, server_id: Option<&str>) -> Result<Vec<OperationRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut list = Vec::new();

        if let Some(sid) = server_id {
            let mut stmt = conn.prepare(
                "SELECT id, server_id, operation_type, details, success, timestamp
                 FROM operation_history WHERE server_id = ?1 ORDER BY timestamp DESC LIMIT 100",
            )?;
            let rows = stmt.query_map(params![sid], |row| {
                Ok(OperationRecord {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    operation_type: row.get(2)?,
                    details: row.get(3)?,
                    success: row.get::<_, i32>(4)? != 0,
                    timestamp: row.get(5)?,
                })
            })?;
            for r in rows {
                list.push(r?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, server_id, operation_type, details, success, timestamp
                 FROM operation_history ORDER BY timestamp DESC LIMIT 100",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(OperationRecord {
                    id: row.get(0)?,
                    server_id: row.get(1)?,
                    operation_type: row.get(2)?,
                    details: row.get(3)?,
                    success: row.get::<_, i32>(4)? != 0,
                    timestamp: row.get(5)?,
                })
            })?;
            for r in rows {
                list.push(r?);
            }
        }

        Ok(list)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }
}
