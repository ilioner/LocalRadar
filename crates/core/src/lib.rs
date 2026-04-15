use serde::Serialize;
use std::collections::BTreeMap;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceEntry {
    pub id: String,
    pub service_key: String,
    pub name: String,
    pub source: ServiceSource,
    pub protocol: ServiceProtocol,
    pub host: String,
    pub port: u16,
    pub url: String,
    pub status: ServiceStatus,
    pub title: Option<String>,
    pub detail: Option<String>,
    pub tags: Vec<String>,
    pub is_favorite: bool,
    pub is_hidden: bool,
    pub pid: Option<u32>,
    pub executable_path: Option<String>,
    pub working_directory: Option<String>,
    pub cpu_percent: Option<f32>,
    pub memory_mb: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceSource {
    Docker,
    Process,
    Manual,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceProtocol {
    Http,
    Https,
    Tcp,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceStatus {
    Online,
    Starting,
    Offline,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySnapshot {
    pub services: Vec<ServiceEntry>,
    pub warnings: Vec<String>,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceEvent {
    pub kind: ServiceEventKind,
    pub service_id: String,
    pub service_name: String,
    pub source: ServiceSource,
    pub url: String,
    pub observed_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ServiceEventKind {
    Added,
    Removed,
    Changed,
}

pub fn discover_services() -> DiscoverySnapshot {
    let mut warnings = Vec::new();
    let mut deduped: BTreeMap<String, ServiceEntry> = BTreeMap::new();

    match docker::discover() {
        Ok(services) => merge_services(&mut deduped, services),
        Err(error) => warnings.push(error),
    }

    match local_listeners::discover() {
        Ok(services) => merge_services(&mut deduped, services),
        Err(error) => warnings.push(error),
    }

    let services = if deduped.is_empty() {
        fallback_services()
    } else {
        deduped.into_values().collect()
    };

    DiscoverySnapshot {
        services,
        warnings,
        scanned_at: iso_timestamp_now(),
    }
}

pub fn diff_services(previous: &[ServiceEntry], current: &[ServiceEntry], observed_at: &str) -> Vec<ServiceEvent> {
    let previous_map = service_index(previous);
    let current_map = service_index(current);
    let mut events = Vec::new();

    for (key, service) in &current_map {
        match previous_map.get(key) {
            None => events.push(ServiceEvent {
                kind: ServiceEventKind::Added,
                service_id: service.id.clone(),
                service_name: service.name.clone(),
                source: service.source.clone(),
                url: service.url.clone(),
                observed_at: observed_at.to_string(),
            }),
            Some(previous_service) if service_changed(previous_service, service) => {
                events.push(ServiceEvent {
                    kind: ServiceEventKind::Changed,
                    service_id: service.id.clone(),
                    service_name: service.name.clone(),
                    source: service.source.clone(),
                    url: service.url.clone(),
                    observed_at: observed_at.to_string(),
                });
            }
            _ => {}
        }
    }

    for (key, service) in &previous_map {
        if !current_map.contains_key(key) {
            events.push(ServiceEvent {
                kind: ServiceEventKind::Removed,
                service_id: service.id.clone(),
                service_name: service.name.clone(),
                source: service.source.clone(),
                url: service.url.clone(),
                observed_at: observed_at.to_string(),
            });
        }
    }

    events
}

fn service_index(services: &[ServiceEntry]) -> BTreeMap<String, ServiceEntry> {
    services
        .iter()
        .cloned()
        .map(|service| {
            (
                format!("{}:{}:{}", service.host, service.port, service.protocol.as_str()),
                service,
            )
        })
        .collect()
}

fn service_changed(previous: &ServiceEntry, current: &ServiceEntry) -> bool {
    previous.name != current.name
        || previous.status.as_str() != current.status.as_str()
        || previous.title != current.title
        || previous.detail != current.detail
}

fn merge_services(target: &mut BTreeMap<String, ServiceEntry>, services: Vec<ServiceEntry>) {
    for service in services {
        let key = format!("{}:{}:{}", service.host, service.port, service.protocol.as_str());
        target.entry(key).or_insert(service);
    }
}

fn iso_timestamp_now() -> String {
    #[cfg(target_family = "unix")]
    {
        if let Ok(output) = Command::new("date")
            .args(["+%Y-%m-%dT%H:%M:%S%z"])
            .output()
        {
            if output.status.success() {
                return String::from_utf8_lossy(&output.stdout).trim().to_string();
            }
        }
    }

    "unknown".into()
}

fn fallback_services() -> Vec<ServiceEntry> {
    vec![ServiceEntry {
        id: "welcome".into(),
        service_key: "127.0.0.1:0:http".into(),
        name: "LocalRadar".into(),
        source: ServiceSource::Manual,
        protocol: ServiceProtocol::Http,
        host: "127.0.0.1".into(),
        port: 0,
        url: "http://127.0.0.1".into(),
        status: ServiceStatus::Offline,
        title: Some("No services discovered yet".into()),
        detail: Some("Connect Docker or start a localhost service to populate the portal.".into()),
        tags: vec!["placeholder".into()],
        is_favorite: false,
        is_hidden: false,
        pid: None,
        executable_path: None,
        working_directory: None,
        cpu_percent: None,
        memory_mb: None,
    }]
}

impl ServiceProtocol {
    pub fn as_str(&self) -> &'static str {
        match self {
            ServiceProtocol::Http => "http",
            ServiceProtocol::Https => "https",
            ServiceProtocol::Tcp => "tcp",
        }
    }
}

impl ServiceStatus {
    fn as_str(&self) -> &'static str {
        match self {
            ServiceStatus::Online => "online",
            ServiceStatus::Starting => "starting",
            ServiceStatus::Offline => "offline",
        }
    }
}

mod docker {
    use super::{ServiceEntry, ServiceProtocol, ServiceSource, ServiceStatus};
    use serde::Deserialize;
    use std::process::Command;

    #[derive(Debug, Deserialize)]
    struct DockerContainer {
        #[serde(rename = "ID")]
        id: String,
        #[serde(rename = "Names")]
        names: String,
        #[serde(rename = "Image")]
        image: String,
        #[serde(rename = "Ports")]
        ports: String,
        #[serde(rename = "State")]
        state: String,
    }

    pub fn discover() -> Result<Vec<ServiceEntry>, String> {
        let output = Command::new("docker")
            .args(["ps", "--format", "{{json .}}"])
            .output()
            .map_err(|_| "Docker CLI not available; Docker discovery skipped.".to_string())?;

        if !output.status.success() {
            return Err("Docker command failed; Docker discovery skipped.".into());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut services = Vec::new();

        for line in stdout.lines().filter(|line| !line.trim().is_empty()) {
            let container: DockerContainer = serde_json::from_str(line)
                .map_err(|_| "Failed to parse Docker container output.".to_string())?;

            for mapping in parse_ports(&container.ports) {
                services.push(ServiceEntry {
                    id: format!("docker-{}-{}", container.id, mapping.port),
                    service_key: format!("{}:{}:{}", mapping.host, mapping.port, mapping.protocol.as_str()),
                    name: container.names.clone(),
                    source: ServiceSource::Docker,
                    protocol: mapping.protocol,
                    host: mapping.host,
                    port: mapping.port,
                    url: mapping.url,
                    status: if container.state.eq_ignore_ascii_case("running") {
                        ServiceStatus::Online
                    } else {
                        ServiceStatus::Starting
                    },
                    title: Some(container.image.clone()),
                    detail: Some("Discovered from Docker port mapping".into()),
                    tags: Vec::new(),
                    is_favorite: false,
                    is_hidden: false,
                    pid: None,
                    executable_path: None,
                    working_directory: None,
                    cpu_percent: None,
                    memory_mb: None,
                });
            }
        }

        Ok(services)
    }

    struct PortMapping {
        host: String,
        port: u16,
        protocol: ServiceProtocol,
        url: String,
    }

    fn parse_ports(raw: &str) -> Vec<PortMapping> {
        raw.split(',')
            .filter_map(|segment| {
                let part = segment.trim();
                let arrow = part.find("->")?;
                let left = part[..arrow].trim();
                let right = part[arrow + 2..].trim();

                let container_protocol = if right.ends_with("/tcp") {
                    ServiceProtocol::Tcp
                } else {
                    ServiceProtocol::Http
                };

                let host_part = left.rsplit(':').next()?;
                let port = host_part.parse::<u16>().ok()?;
                let protocol = infer_protocol(port, &container_protocol);
                let host = "127.0.0.1".to_string();

                Some(PortMapping {
                    url: format!("{}://{}:{}", protocol.as_str(), host, port),
                    host,
                    port,
                    protocol,
                })
            })
            .collect()
    }

    fn infer_protocol(port: u16, fallback: &ServiceProtocol) -> ServiceProtocol {
        match port {
            443 | 8443 => ServiceProtocol::Https,
            80 | 3000 | 4173 | 5173 | 8000 | 8080 | 8081 | 8888 => ServiceProtocol::Http,
            _ => match fallback {
                ServiceProtocol::Tcp => ServiceProtocol::Tcp,
                _ => ServiceProtocol::Http,
            },
        }
    }
}

mod local_listeners {
    use super::{ServiceEntry, ServiceProtocol, ServiceSource, ServiceStatus};
    use std::collections::BTreeMap;
    use std::process::Command;

    #[derive(Clone)]
    struct ProcessMetadata {
        executable_path: Option<String>,
        working_directory: Option<String>,
        cpu_percent: Option<f32>,
        memory_mb: Option<u64>,
    }

    pub fn discover() -> Result<Vec<ServiceEntry>, String> {
        let output = run_listener_command()?;

        if !output.status.success() {
            return Err("Listener discovery command failed.".into());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut services = BTreeMap::new();
        let mut metadata_cache = BTreeMap::new();

        for line in stdout.lines().skip(1) {
            if let Some(mut service) = parse_listener(line) {
                if let Some(pid) = service.pid {
                    let metadata = metadata_cache
                        .entry(pid)
                        .or_insert_with(|| inspect_process(pid));

                    service.executable_path = metadata.executable_path.clone();
                    service.working_directory = metadata.working_directory.clone();
                    service.cpu_percent = metadata.cpu_percent;
                    service.memory_mb = metadata.memory_mb;
                }

                let key = format!("{}:{}", service.host, service.port);
                services.entry(key).or_insert(service);
            }
        }

        Ok(services.into_values().collect())
    }

    #[cfg(target_family = "windows")]
    fn run_listener_command() -> Result<std::process::Output, String> {
        Err("Windows listener discovery is not implemented yet.".into())
    }

    #[cfg(not(target_family = "windows"))]
    fn run_listener_command() -> Result<std::process::Output, String> {
        Command::new("lsof")
            .args(["-nP", "-iTCP", "-sTCP:LISTEN"])
            .output()
            .map_err(|_| "lsof not available; local listener discovery skipped.".to_string())
    }

    fn parse_listener(line: &str) -> Option<ServiceEntry> {
        let columns: Vec<&str> = line.split_whitespace().collect();
        if columns.len() < 9 {
            return None;
        }

        let process_name = columns[0].to_string();
        let pid = columns.get(1)?.parse::<u32>().ok();
        let endpoint = if matches!(columns.last(), Some(&"(LISTEN)")) {
            columns.get(columns.len().saturating_sub(2))?.trim()
        } else {
            columns.last()?.trim()
        };
        let port_segment = endpoint.rsplit(':').next()?;
        let port = port_segment.parse::<u16>().ok()?;
        let host = if endpoint.starts_with("*:") || endpoint.starts_with("[::]") {
            "127.0.0.1".to_string()
        } else {
            endpoint
                .rsplit_once(':')
                .map(|(host, _)| host.trim_start_matches('[').trim_end_matches(']').to_string())
                .filter(|host| !host.is_empty())
                .unwrap_or_else(|| "127.0.0.1".to_string())
        };
        let protocol = infer_protocol(port);

        Some(ServiceEntry {
            id: format!("process-{}-{}", process_name.to_lowercase(), port),
            service_key: format!("{}:{}:{}", host, port, protocol.as_str()),
            name: classify_name(&process_name, port),
            source: ServiceSource::Process,
            protocol: protocol.clone(),
            host: host.clone(),
            port,
            url: format!("{}://{}:{}", protocol.as_str(), host, port),
            status: ServiceStatus::Online,
            title: Some(process_name),
            detail: Some("Detected from local listening sockets".into()),
            tags: classify_tags(port),
            is_favorite: false,
            is_hidden: false,
            pid,
            executable_path: None,
            working_directory: None,
            cpu_percent: None,
            memory_mb: None,
        })
    }

    fn inspect_process(pid: u32) -> ProcessMetadata {
        ProcessMetadata {
            executable_path: read_executable_path(pid),
            working_directory: read_working_directory(pid),
            cpu_percent: read_cpu_percent(pid),
            memory_mb: read_memory_mb(pid),
        }
    }

    fn read_executable_path(pid: u32) -> Option<String> {
        let output = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "command="])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let command = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if command.is_empty() {
            None
        } else {
            command.split_whitespace().next().map(|value| value.to_string())
        }
    }

    fn read_working_directory(pid: u32) -> Option<String> {
        let output = Command::new("lsof")
            .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        String::from_utf8_lossy(&output.stdout)
            .lines()
            .find_map(|line| line.strip_prefix('n'))
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
    }

    fn read_cpu_percent(pid: u32) -> Option<f32> {
        let output = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "%cpu="])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<f32>()
            .ok()
    }

    fn read_memory_mb(pid: u32) -> Option<u64> {
        let output = Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "rss="])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let rss_kb = String::from_utf8_lossy(&output.stdout)
            .trim()
            .parse::<u64>()
            .ok()?;

        Some(rss_kb / 1024)
    }

    fn infer_protocol(port: u16) -> ServiceProtocol {
        match port {
            443 | 8443 => ServiceProtocol::Https,
            80 | 3000 | 4173 | 5000 | 5173 | 8000 | 8080 | 8081 | 8888 => ServiceProtocol::Http,
            _ => ServiceProtocol::Tcp,
        }
    }

    fn classify_name(process_name: &str, port: u16) -> String {
        match port {
            5432 => "PostgreSQL".into(),
            6379 => "Redis".into(),
            11434 => "Ollama".into(),
            3000 | 4173 | 5173 => format!("{} Dev Server", process_name),
            _ => process_name.to_string(),
        }
    }

    fn classify_tags(port: u16) -> Vec<String> {
        match port {
            5432 => vec!["database".into()],
            6379 => vec!["cache".into()],
            11434 => vec!["ai".into()],
            3000 | 4173 | 5173 | 8000 | 8080 | 8081 | 8888 => vec!["web".into()],
            _ => Vec::new(),
        }
    }
}
