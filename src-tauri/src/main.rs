#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use localradar_core::{DiscoverySnapshot, ServiceEntry, ServiceEvent};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

struct AppState {
    runtime: Mutex<RuntimeState>,
    settings_path: PathBuf,
}

struct RuntimeState {
    services: Vec<ServiceEntry>,
    recent_events: Vec<ServiceEvent>,
    resource_history: BTreeMap<String, Vec<ResourceSample>>,
    warnings: Vec<String>,
    scanned_at: String,
    auto_refresh: bool,
    refresh_seconds: u64,
    service_prefs: BTreeMap<String, ServicePreference>,
    filters: FilterSettings,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeSnapshot {
    services: Vec<ServiceEntry>,
    warnings: Vec<String>,
    scanned_at: String,
    recent_events: Vec<ServiceEvent>,
    resource_history: BTreeMap<String, Vec<ResourceSample>>,
    auto_refresh: bool,
    refresh_seconds: u64,
    hidden_count: usize,
    filters: FilterSettings,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResourceSample {
    observed_at: String,
    cpu_percent: Option<f32>,
    memory_mb: Option<u64>,
}

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServicePreference {
    alias: Option<String>,
    favorite: bool,
    hidden: bool,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    auto_refresh: bool,
    refresh_seconds: u64,
    service_prefs: BTreeMap<String, ServicePreference>,
    filters: FilterSettings,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FilterSettings {
    include_docker: bool,
    include_processes: bool,
    excluded_ports: Vec<u16>,
    excluded_process_keywords: Vec<String>,
}

impl Default for FilterSettings {
    fn default() -> Self {
        Self {
            include_docker: true,
            include_processes: true,
            excluded_ports: Vec::new(),
            excluded_process_keywords: Vec::new(),
        }
    }
}

#[tauri::command]
fn get_runtime_snapshot(state: tauri::State<'_, AppState>) -> RuntimeSnapshot {
    runtime_snapshot(&state.runtime.lock().expect("runtime state poisoned"))
}

#[tauri::command]
fn refresh_now(app: AppHandle) -> Result<RuntimeSnapshot, String> {
    Ok(scan_once(&app))
}

#[tauri::command]
fn update_scan_config(
    app: AppHandle,
    auto_refresh: bool,
    refresh_seconds: u64,
) -> RuntimeSnapshot {
    let bounded_interval = refresh_seconds.clamp(3, 60);
    let state = app.state::<AppState>();
    let mut runtime = state.runtime.lock().expect("runtime state poisoned");
    runtime.auto_refresh = auto_refresh;
    runtime.refresh_seconds = bounded_interval;
    persist_settings(&state.settings_path, &runtime);
    runtime_snapshot(&runtime)
}

#[tauri::command]
fn update_service_preference(
    app: AppHandle,
    service_key: String,
    alias: Option<String>,
    favorite: Option<bool>,
    hidden: Option<bool>,
) -> Result<RuntimeSnapshot, String> {
    let state = app.state::<AppState>();
    {
        let mut runtime = state.runtime.lock().expect("runtime state poisoned");
        let preference = runtime
            .service_prefs
            .entry(service_key)
            .or_insert_with(ServicePreference::default);

        if let Some(alias) = alias {
            let trimmed = alias.trim().to_string();
            preference.alias = if trimmed.is_empty() { None } else { Some(trimmed) };
        }

        if let Some(favorite) = favorite {
            preference.favorite = favorite;
        }

        if let Some(hidden) = hidden {
            preference.hidden = hidden;
        }

        let prefs = runtime.service_prefs.clone();
        apply_preferences(&mut runtime.services, &prefs);
        persist_settings(&state.settings_path, &runtime);
    }

    let snapshot = {
        let runtime = state.runtime.lock().expect("runtime state poisoned");
        runtime_snapshot(&runtime)
    };

    Ok(snapshot)
}

#[tauri::command]
fn update_filters(
    app: AppHandle,
    include_docker: bool,
    include_processes: bool,
    excluded_ports: Vec<u16>,
    excluded_process_keywords: Vec<String>,
) -> Result<RuntimeSnapshot, String> {
    let state = app.state::<AppState>();
    {
        let mut runtime = state.runtime.lock().expect("runtime state poisoned");
        runtime.filters = FilterSettings {
            include_docker,
            include_processes,
            excluded_ports,
            excluded_process_keywords: excluded_process_keywords
                .into_iter()
                .map(|item| item.trim().to_lowercase())
                .filter(|item| !item.is_empty())
                .collect(),
        };

        let filters = runtime.filters.clone();
        apply_filters(&mut runtime.services, &filters);
        persist_settings(&state.settings_path, &runtime);
    }

    let snapshot = scan_once(&app);
    Ok(snapshot)
}

#[tauri::command]
fn open_in_file_manager(path: String, reveal_parent: bool) -> Result<(), String> {
    let target = if reveal_parent {
        PathBuf::from(&path)
            .parent()
            .map(|parent| parent.to_path_buf())
            .unwrap_or_else(|| PathBuf::from(&path))
    } else {
        PathBuf::from(&path)
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(target);
        cmd
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(target);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(target);
        cmd
    };

    command
        .spawn()
        .map_err(|error| format!("Failed to open path in file manager: {error}"))?;

    Ok(())
}

#[tauri::command]
fn terminate_service(app: AppHandle, service_key: String) -> Result<RuntimeSnapshot, String> {
    let service = {
        let state = app.state::<AppState>();
        let runtime = state.runtime.lock().expect("runtime state poisoned");
        runtime
            .services
            .iter()
            .find(|service| service.service_key == service_key)
            .cloned()
    }
    .ok_or_else(|| "Service not found.".to_string())?;

    match service.source {
        localradar_core::ServiceSource::Process => {
            let pid = service
                .pid
                .ok_or_else(|| "This service does not have a killable process id.".to_string())?;

            terminate_pid(pid)?;
            thread::sleep(Duration::from_millis(500));
            Ok(scan_once(&app))
        }
        localradar_core::ServiceSource::Docker => {
            Err("Docker-backed services are not terminated from this button yet.".into())
        }
        localradar_core::ServiceSource::Manual => {
            Err("Manual services cannot be terminated from the app.".into())
        }
    }
}

fn main() {
    let settings_path = default_settings_path();
    let settings = load_settings(&settings_path);
    tauri::Builder::default()
        .manage(AppState {
            runtime: Mutex::new(RuntimeState {
                services: Vec::new(),
                recent_events: Vec::new(),
                resource_history: BTreeMap::new(),
                warnings: Vec::new(),
                scanned_at: "Waiting...".into(),
                auto_refresh: settings.auto_refresh,
                refresh_seconds: settings.refresh_seconds.max(3),
                service_prefs: settings.service_prefs,
                filters: settings.filters,
            }),
            settings_path,
        })
        .setup(|app| {
            let handle = app.handle().clone();
            setup_tray(&handle)?;
            scan_once(&handle);
            spawn_scanner(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_snapshot,
            refresh_now,
            update_scan_config,
            update_service_preference,
            update_filters,
            open_in_file_manager,
            terminate_service
        ])
        .run(tauri::generate_context!())
        .expect("failed to run LocalRadar desktop app");
}

fn terminate_pid(pid: u32) -> Result<(), String> {
    #[cfg(target_family = "unix")]
    {
        let status = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
            .map_err(|error| format!("Failed to run kill command: {error}"))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("Failed to terminate process {pid}."))
        }
    }

    #[cfg(target_family = "windows")]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T"])
            .status()
            .map_err(|error| format!("Failed to run taskkill: {error}"))?;

        if status.success() {
            Ok(())
        } else {
            Err(format!("Failed to terminate process {pid}."))
        }
    }
}

fn spawn_scanner(app: AppHandle) {
    thread::spawn(move || loop {
        let (enabled, refresh_seconds) = {
            let state = app.state::<AppState>();
            let runtime = state.runtime.lock().expect("runtime state poisoned");
            (runtime.auto_refresh, runtime.refresh_seconds)
        };

        if enabled {
            scan_once(&app);
            thread::sleep(Duration::from_secs(refresh_seconds));
        } else {
            thread::sleep(Duration::from_secs(1));
        }
    });
}

fn scan_once(app: &AppHandle) -> RuntimeSnapshot {
    let DiscoverySnapshot {
        services,
        warnings,
        scanned_at,
    } = localradar_core::discover_services();

    let state = app.state::<AppState>();
    let snapshot = {
        let mut runtime = state.runtime.lock().expect("runtime state poisoned");
        let mut services = services;
        apply_preferences(&mut services, &runtime.service_prefs);
        apply_filters(&mut services, &runtime.filters);
        let mut recent_events =
            localradar_core::diff_services(&runtime.services, &services, &scanned_at);
        update_resource_history(&mut runtime.resource_history, &services, &scanned_at);

        recent_events.extend(runtime.recent_events.clone());
        recent_events.truncate(30);

        runtime.services = services.clone();
        runtime.recent_events = recent_events.clone();
        runtime.warnings = warnings.clone();
        runtime.scanned_at = scanned_at.clone();

        runtime_snapshot(&runtime)
    };

    let _ = app.emit("scanner://snapshot", &snapshot);
    snapshot
}

fn runtime_snapshot(runtime: &RuntimeState) -> RuntimeSnapshot {
    RuntimeSnapshot {
        services: runtime.services.clone(),
        warnings: runtime.warnings.clone(),
        scanned_at: runtime.scanned_at.clone(),
        recent_events: runtime.recent_events.clone(),
        resource_history: runtime.resource_history.clone(),
        auto_refresh: runtime.auto_refresh,
        refresh_seconds: runtime.refresh_seconds,
        hidden_count: runtime.services.iter().filter(|service| service.is_hidden).count(),
        filters: runtime.filters.clone(),
    }
}

fn update_resource_history(
    history: &mut BTreeMap<String, Vec<ResourceSample>>,
    services: &[ServiceEntry],
    observed_at: &str,
) {
    let active_keys: Vec<String> = services
        .iter()
        .map(|service| service.service_key.clone())
        .collect();

    for service in services {
        let samples = history.entry(service.service_key.clone()).or_default();
        samples.push(ResourceSample {
            observed_at: observed_at.to_string(),
            cpu_percent: service.cpu_percent,
            memory_mb: service.memory_mb,
        });

        if samples.len() > 40 {
            let drain_count = samples.len() - 40;
            samples.drain(0..drain_count);
        }
    }

    history.retain(|key, _| active_keys.iter().any(|active_key| active_key == key));
}

fn apply_preferences(services: &mut [ServiceEntry], prefs: &BTreeMap<String, ServicePreference>) {
    for service in services {
        if let Some(pref) = prefs.get(&service.service_key) {
            if let Some(alias) = &pref.alias {
                service.name = alias.clone();
            }

            service.is_favorite = pref.favorite;
            service.is_hidden = pref.hidden;
        }
    }
}

fn apply_filters(services: &mut Vec<ServiceEntry>, filters: &FilterSettings) {
    services.retain(|service| {
        if !filters.include_docker && matches!(service.source, localradar_core::ServiceSource::Docker) {
            return false;
        }

        if !filters.include_processes
            && matches!(service.source, localradar_core::ServiceSource::Process)
        {
            return false;
        }

        if filters.excluded_ports.contains(&service.port) {
            return false;
        }

        if matches!(service.source, localradar_core::ServiceSource::Process) {
            let haystack = format!(
                "{} {} {}",
                service.name.to_lowercase(),
                service.title.clone().unwrap_or_default().to_lowercase(),
                service.detail.clone().unwrap_or_default().to_lowercase()
            );

            if filters
                .excluded_process_keywords
                .iter()
                .any(|keyword| !keyword.is_empty() && haystack.contains(keyword))
            {
                return false;
            }
        }

        true
    });
}

fn default_settings_path() -> PathBuf {
    let base = std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .unwrap_or_else(|| PathBuf::from("."));

    base.join(".localradar").join("settings.json")
}

fn load_settings(path: &PathBuf) -> AppSettings {
    match fs::read_to_string(path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| default_settings()),
        Err(_) => default_settings(),
    }
}

fn default_settings() -> AppSettings {
    AppSettings {
        auto_refresh: true,
        refresh_seconds: 5,
        service_prefs: BTreeMap::new(),
        filters: FilterSettings::default(),
    }
}

fn persist_settings(path: &PathBuf, runtime: &RuntimeState) {
    let settings = AppSettings {
        auto_refresh: runtime.auto_refresh,
        refresh_seconds: runtime.refresh_seconds,
        service_prefs: runtime.service_prefs.clone(),
        filters: runtime.filters.clone(),
    };

    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(content) = serde_json::to_string_pretty(&settings) {
        let _ = fs::write(path, content);
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open LocalRadar", true, None::<&str>)?;
    let refresh = MenuItem::with_id(app, "refresh", "Refresh Now", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle-scan", "Pause/Resume Scan", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &refresh, &toggle, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                let _ = show_main_window(app);
            }
            "refresh" => {
                let _ = scan_once(app);
            }
            "toggle-scan" => {
                let state = app.state::<AppState>();
                let mut runtime = state.runtime.lock().expect("runtime state poisoned");
                runtime.auto_refresh = !runtime.auto_refresh;
                persist_settings(&state.settings_path, &runtime);
                let snapshot = runtime_snapshot(&runtime);
                let _ = app.emit("scanner://snapshot", &snapshot);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = app.get_webview_window("main").expect("main window missing");
    let _ = window.show();
    let _ = window.set_focus();
    Ok(window)
}
