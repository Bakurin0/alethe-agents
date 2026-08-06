use std::fs;
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use zip::write::FileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::paths::{activity_stats_file_path, app_data_dir};
use crate::profiles::profile_data_dir_for_id;

/// Package local profile data into a zip at `target_path`.
/// Debug logs and temporary atomic-save artifacts are excluded.
#[tauri::command]
pub fn export_backup(app: AppHandle, target_path: String) -> Result<(), String> {
    export_backup_from_dir(app_data_dir(&app)?, target_path)
}

#[tauri::command]
pub fn export_profile_backup(
    app: AppHandle,
    profile_id: String,
    target_path: String,
) -> Result<(), String> {
    let dir = profile_data_dir_for_id(&app, &profile_id)?;
    export_backup_from_dir(dir, target_path)
}

fn export_backup_from_dir(dir: PathBuf, target_path: String) -> Result<(), String> {
    let target = PathBuf::from(target_path);
    let source_root = dir.canonicalize().map_err(|e| e.to_string())?;
    let target_parent = target
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if target_parent.starts_with(&source_root) {
        return Err("backup_inside_profile".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let file = fs::File::create(&target).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let opts = FileOptions::default().compression_method(CompressionMethod::Deflated);

    // projects.json (se existir)
    let projects = dir.join("projects.json");
    if projects.is_file() {
        zip.start_file("projects.json", opts)
            .map_err(|e| e.to_string())?;
        let bytes = fs::read(&projects).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    // Activity metrics belong to the profile and are included in the backup.
    let activity_stats = dir.join("activity-stats.json");
    if activity_stats.is_file() {
        zip.start_file("activity-stats.json", opts)
            .map_err(|e| e.to_string())?;
        let bytes = fs::read(&activity_stats).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    // Tokens do not leave this local profile unless the user explicitly exports it.
    let spotify_tokens = dir.join("spotify_tokens.json");
    if spotify_tokens.is_file() {
        zip.start_file("spotify_tokens.json", opts)
            .map_err(|e| e.to_string())?;
        let bytes = fs::read(&spotify_tokens).map_err(|e| e.to_string())?;
        zip.write_all(&bytes).map_err(|e| e.to_string())?;
    }

    // scrollback/*.bin
    let scrollback = dir.join("scrollback");
    if scrollback.is_dir() {
        for entry in fs::read_dir(&scrollback).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let name = path
                .file_name()
                .ok_or_else(|| "scrollback entry sem nome".to_string())?
                .to_string_lossy()
                .to_string();
            zip.start_file(format!("scrollback/{name}"), opts)
                .map_err(|e| e.to_string())?;
            let bytes = fs::read(&path).map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Replace local state with the contents of `source_path`. Remove existing
/// scrollback first so deleted PTY data is not retained.
/// preserva apenas o projects.json novo.
#[tauri::command]
pub fn import_backup(app: AppHandle, source_path: String) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // Limpa scrollback prévio
    let scrollback = dir.join("scrollback");
    if scrollback.exists() {
        let _ = fs::remove_dir_all(&scrollback);
    }
    let activity_stats = activity_stats_file_path(&app)?;
    if activity_stats.exists() {
        fs::remove_file(activity_stats).map_err(|e| e.to_string())?;
    }

    let file = fs::File::open(&source_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let entry_name = entry.name().to_string();

        // Sanitização: rejeita absolute paths e ".." pra evitar zip-slip
        if Path::new(&entry_name).is_absolute() || entry_name.contains("..") {
            continue;
        }

        let dest = dir.join(&entry_name);
        if entry.is_dir() {
            fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = fs::File::create(&dest).map_err(|e| e.to_string())?;
        io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        let _ = read_remaining(&mut entry); // garante consumir o resto do entry
    }

    Ok(())
}

fn read_remaining<R: Read>(r: &mut R) -> io::Result<u64> {
    io::copy(r, &mut io::sink())
}
