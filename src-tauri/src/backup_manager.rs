use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use anyhow::{anyhow, Result};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};
use crate::models::BackupRecord;
use crate::security::SecurityPolicy;

pub struct BackupManager;

impl BackupManager {
    /// Creates a zip backup of the server directory, excluding `backups/` and cache files
    pub fn create_backup(
        server_dir: &Path,
        server_id: &str,
        description: &str,
    ) -> Result<BackupRecord> {
        let backup_dir = server_dir.join("backups");
        std::fs::create_dir_all(&backup_dir)?;

        let timestamp = chrono::Utc::now().timestamp();
        let file_name = format!(
            "backup_{}_{}.zip",
            chrono::Utc::now().format("%Y%m%d_%H%M%S"),
            &uuid::Uuid::new_v4().to_string()[..8]
        );
        let zip_path = backup_dir.join(&file_name);

        let file = File::create(&zip_path)?;
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o755);

        let mut buffer = Vec::new();

        for entry in WalkDir::new(server_dir) {
            let entry = entry?;
            let path = entry.path();

            // Skip backups folder itself to avoid recursion
            if path.starts_with(&backup_dir) {
                continue;
            }

            // Skip temporary files and large cache directories
            let file_name_str = path.file_name().unwrap_or_default().to_string_lossy();
            if file_name_str.starts_with('.') || file_name_str == "cache" || file_name_str.ends_with(".tmp") {
                continue;
            }

            let relative_path = path.strip_prefix(server_dir)?;
            let relative_str = relative_path.to_string_lossy().replace('\\', "/");

            if relative_str.is_empty() {
                continue;
            }

            if path.is_dir() {
                zip.add_directory(&relative_str, options)?;
            } else if path.is_file() {
                zip.start_file(&relative_str, options)?;
                let mut f = File::open(path)?;
                buffer.clear();
                f.read_to_end(&mut buffer)?;
                zip.write_all(&buffer)?;
            }
        }

        zip.finish()?;

        let file_size = std::fs::metadata(&zip_path)?.len();

        Ok(BackupRecord {
            id: uuid::Uuid::new_v4().to_string(),
            server_id: server_id.to_string(),
            file_name,
            file_size_bytes: file_size,
            created_at: timestamp,
            description: description.to_string(),
        })
    }

    /// Restores a backup zip into the server directory
    pub fn restore_backup(server_dir: &Path, file_name: &str) -> Result<()> {
        SecurityPolicy::validate_file_name(file_name)?;
        let backup_path = server_dir.join("backups").join(file_name);
        let validated_zip = SecurityPolicy::validate_path_within_root(server_dir, &backup_path)?;

        if !validated_zip.exists() {
            return Err(anyhow!("Backup file not found: {:?}", file_name));
        }

        let file = File::open(&validated_zip)?;
        let mut archive = ZipArchive::new(file)?;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)?;
            let outpath = match file.enclosed_name() {
                Some(path) => server_dir.join(path),
                None => continue,
            };

            // Extra security check for zip slip vulnerability
            SecurityPolicy::validate_path_within_root(server_dir, &outpath)?;

            if file.is_dir() {
                std::fs::create_dir_all(&outpath)?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        std::fs::create_dir_all(p)?;
                    }
                }
                let mut outfile = File::create(&outpath)?;
                std::io::copy(&mut file, &mut outfile)?;
            }
        }

        Ok(())
    }

    /// Deletes a backup file
    pub fn delete_backup(server_dir: &Path, file_name: &str) -> Result<()> {
        SecurityPolicy::validate_file_name(file_name)?;
        let backup_path = server_dir.join("backups").join(file_name);
        let validated = SecurityPolicy::validate_path_within_root(server_dir, &backup_path)?;
        if validated.exists() {
            std::fs::remove_file(validated)?;
        }
        Ok(())
    }
}
