import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ServiceCard } from "./components/ServiceCard";

type ServiceSource = "docker" | "process" | "manual";
type ServiceProtocol = "http" | "https" | "tcp";
type ServiceStatus = "online" | "starting" | "offline";

type ServiceEntry = {
  id: string;
  serviceKey: string;
  name: string;
  source: ServiceSource;
  protocol: ServiceProtocol;
  host: string;
  port: number;
  url: string;
  status: ServiceStatus;
  title?: string | null;
  detail?: string | null;
  tags: string[];
  isFavorite: boolean;
  isHidden: boolean;
  pid?: number | null;
  executablePath?: string | null;
  workingDirectory?: string | null;
  cpuPercent?: number | null;
  memoryMb?: number | null;
};

type DiscoverySnapshot = {
  services: ServiceEntry[];
  warnings: string[];
  scannedAt: string;
  recentEvents: ServiceEvent[];
  resourceHistory: Record<string, ResourceSample[]>;
  autoRefresh: boolean;
  refreshSeconds: number;
  hiddenCount: number;
  filters: FilterSettings;
};

type ResourceSample = {
  observedAt: string;
  cpuPercent?: number | null;
  memoryMb?: number | null;
};

type ServiceEvent = {
  kind: "added" | "removed" | "changed";
  serviceId: string;
  serviceName: string;
  source: ServiceSource;
  url: string;
  observedAt: string;
};

type FilterSettings = {
  includeDocker: boolean;
  includeProcesses: boolean;
  excludedPorts: number[];
  excludedProcessKeywords: string[];
};

type AppView = "services" | "activity" | "hidden" | "settings";
type ServiceFilter = "all" | "favorites";
type ServiceCategory = "all" | "docker" | "local" | "web" | "database" | "ai" | "tcp";
type Locale = "en" | "zh";

const MESSAGES = {
  en: {
    appSubtitle: "Local service monitor",
    workspace: "Workspace",
    scanner: "Scanner",
    notes: "Notes",
    noteCopy: "This view is optimized for fast local ops: scan, open, favorite, rename, hide.",
    online: "Online",
    tracked: "Tracked",
    favorites: "Favorites",
    recentAdds: "Recent Adds",
    status: "Status",
    interval: "Interval",
    hidden: "Hidden",
    lastScan: "Last Scan",
    active: "Active",
    paused: "Paused",
    services: "Services",
    activity: "Activity",
    settings: "Settings",
    manual: "Manual",
    autoRefresh: "Auto refresh",
    showHidden: "Show hidden",
    all: "All",
    refresh: "Refresh",
    scanning: "Scanning...",
    service: "Service",
    items: "items",
    portal: "Service Directory",
    portalDesc: "Browse discovered Docker mappings and local listeners.",
    noServices: "Start a Docker container or local web service, then refresh to populate the directory.",
    noActivity: "No service changes recorded yet. Start or stop a service to build a timeline.",
    noHidden: "No services are hidden right now.",
    inspectPrompt: "Select a service to inspect its details.",
    inspector: "Inspector",
    source: "Source",
    protocol: "Protocol",
    host: "Host",
    port: "Port",
    pid: "PID",
    cpu: "CPU",
    memory: "Memory",
    directory: "Directory",
    executable: "Executable",
    openFolder: "Open folder",
    showMore: "Show more",
    showLess: "Show less",
    unavailable: "Unavailable",
    address: "Address",
    description: "Description",
    tags: "Tags",
    addFavorite: "Add Favorite",
    removeFavorite: "Remove Favorite",
    rename: "Rename",
    hide: "Hide",
    unhide: "Unhide",
    terminateService: "Terminate service",
    hiddenServices: "Hidden Services",
    hiddenDesc: "Restore or inspect services hidden from the main portal.",
    hiddenRestoreDesc: "Restore services you removed from the main view.",
    recentActivity: "Recent Activity",
    recentActivityDesc: "Service additions, removals and changes observed by the scanner.",
    scannerSettings: "Scanner Settings",
    scannerSettingsDesc: "Control how LocalRadar watches your machine.",
    workspaceSummary: "Workspace Summary",
    workspaceSummaryDesc: "Current runtime and preference snapshot.",
    automaticScanning: "Automatic scanning",
    automaticScanningDesc: "Keep the Rust background scanner active and stream updates to the UI.",
    scanInterval: "Scan interval",
    scanIntervalDesc: "How often the native scanner refreshes Docker and localhost listeners.",
    warnings: "Warnings",
    resourceUsage: "Resource Usage",
    recentCpu: "Recent CPU",
    recentMemory: "Recent Memory",
    enabled: "Enabled",
    disabled: "Disabled",
    filterServices: "Service filter",
    categoryAll: "All Types",
    categoryDocker: "Docker",
    categoryLocal: "Local",
    categoryWeb: "Web",
    categoryDatabase: "Database",
    categoryAi: "AI",
    categoryTcp: "TCP",
    searchServices: "Search services",
    searchServicesPlaceholder: "Search by name, port, tag, or address",
    favorite: "Favorite",
    removeFavoriteLabel: "Remove favorite",
    addFavoriteLabel: "Add favorite",
    renameService: "Rename service",
    hideService: "Hide service",
    unhideService: "Unhide service",
    noMetadata: "No probe metadata yet.",
    eventAdded: "Added",
    eventRemoved: "Removed",
    eventChanged: "Changed",
    serviceRadar: "Service Radar",
    localServices: "Local Services",
    localServicesDesc: "Browse current local services with a list-and-inspector workflow.",
    eventStream: "Event Stream",
    recentActivityViewDesc: "Track service additions, removals, and detected changes over time.",
    visibility: "Visibility",
    hiddenServicesDesc: "Manage services removed from the main portal without losing their metadata.",
    preferences: "Preferences",
    settingsDesc: "Adjust scanner behavior and review how LocalRadar is configured locally.",
    language: "Language",
    filters: "Filters",
    filtersDesc: "Choose which services should be hidden from discovery results.",
    includeDocker: "Include Docker services",
    includeDockerDesc: "Show services discovered from Docker container port mappings.",
    includeProcesses: "Include local process services",
    includeProcessesDesc: "Show services discovered from local listening processes.",
    excludedPorts: "Excluded ports",
    excludedPortsDesc: "Comma-separated ports to hide, such as 5000,5432,631.",
    excludedKeywords: "Excluded process keywords",
    excludedKeywordsDesc: "Comma-separated keywords matched against local process services.",
    english: "English",
    chinese: "中文",
    copyForTcp: "For raw TCP services, browser launch is not guaranteed.",
    copyAddress: "Copy address",
    sourceDocker: "docker",
    sourceProcess: "process",
    sourceManual: "manual",
  },
  zh: {
    appSubtitle: "本地服务监控器",
    workspace: "工作区",
    scanner: "扫描器",
    notes: "说明",
    noteCopy: "这个界面优先服务本地运维操作：扫描、打开、收藏、重命名、隐藏。",
    online: "在线",
    tracked: "总数",
    favorites: "收藏",
    recentAdds: "最近新增",
    status: "状态",
    interval: "间隔",
    hidden: "隐藏",
    lastScan: "上次扫描",
    active: "运行中",
    paused: "已暂停",
    services: "服务",
    activity: "活动",
    settings: "设置",
    manual: "手动",
    autoRefresh: "自动刷新",
    showHidden: "显示隐藏项",
    all: "全部",
    refresh: "刷新",
    scanning: "扫描中...",
    service: "服务",
    items: "项",
    portal: "服务目录",
    portalDesc: "浏览已发现的 Docker 端口映射与本机监听服务。",
    noServices: "先启动一个 Docker 容器或本地 Web 服务，再刷新即可看到目录内容。",
    noActivity: "还没有记录到服务变化。启动或停止服务后，这里会出现时间线。",
    noHidden: "当前没有隐藏的服务。",
    inspectPrompt: "选择左侧一个服务以查看详细信息。",
    inspector: "检查器",
    source: "来源",
    protocol: "协议",
    host: "主机",
    port: "端口",
    pid: "PID",
    cpu: "CPU",
    memory: "内存",
    directory: "目录",
    executable: "可执行文件",
    openFolder: "打开目录",
    showMore: "展开",
    showLess: "收起",
    unavailable: "不可用",
    address: "地址",
    description: "说明",
    tags: "标签",
    addFavorite: "加入收藏",
    removeFavorite: "取消收藏",
    rename: "重命名",
    hide: "隐藏",
    unhide: "取消隐藏",
    terminateService: "结束服务",
    hiddenServices: "隐藏服务",
    hiddenDesc: "恢复或查看从主门户中隐藏的服务。",
    hiddenRestoreDesc: "恢复你从主视图里移除的服务。",
    recentActivity: "最近活动",
    recentActivityDesc: "扫描器观察到的新增、删除和变更事件。",
    scannerSettings: "扫描设置",
    scannerSettingsDesc: "控制 LocalRadar 如何监听你的本机环境。",
    workspaceSummary: "工作区摘要",
    workspaceSummaryDesc: "当前运行状态与偏好设置概览。",
    automaticScanning: "自动扫描",
    automaticScanningDesc: "保持 Rust 后台扫描器运行，并持续把更新推送到界面。",
    scanInterval: "扫描间隔",
    scanIntervalDesc: "后台扫描 Docker 与 localhost 监听端口的频率。",
    warnings: "警告",
    resourceUsage: "资源占用",
    recentCpu: "最近 CPU",
    recentMemory: "最近内存",
    enabled: "已启用",
    disabled: "已禁用",
    filterServices: "服务筛选",
    categoryAll: "全部类型",
    categoryDocker: "Docker",
    categoryLocal: "本机",
    categoryWeb: "Web",
    categoryDatabase: "数据库",
    categoryAi: "AI",
    categoryTcp: "TCP",
    searchServices: "搜索服务",
    searchServicesPlaceholder: "按名称、端口、标签或地址搜索",
    favorite: "已收藏",
    removeFavoriteLabel: "取消收藏",
    addFavoriteLabel: "加入收藏",
    renameService: "重命名服务",
    hideService: "隐藏服务",
    unhideService: "取消隐藏服务",
    noMetadata: "暂时没有探测到额外元信息。",
    eventAdded: "新增",
    eventRemoved: "移除",
    eventChanged: "变更",
    serviceRadar: "服务雷达",
    localServices: "本地服务",
    localServicesDesc: "用列表加详情检查器的方式浏览当前本机服务。",
    eventStream: "事件流",
    recentActivityViewDesc: "按时间查看服务新增、删除与变更。",
    visibility: "可见性",
    hiddenServicesDesc: "管理从主门户隐藏但仍保留记录的服务。",
    preferences: "偏好设置",
    settingsDesc: "调整扫描行为并查看 LocalRadar 的本地配置。",
    language: "语言",
    filters: "过滤器",
    filtersDesc: "选择哪些服务应该从发现结果中隐藏。",
    includeDocker: "包含 Docker 服务",
    includeDockerDesc: "显示从 Docker 容器端口映射发现的服务。",
    includeProcesses: "包含本机进程服务",
    includeProcessesDesc: "显示从本机监听进程发现的服务。",
    excludedPorts: "排除端口",
    excludedPortsDesc: "用逗号分隔要隐藏的端口，例如 5000,5432,631。",
    excludedKeywords: "排除进程关键字",
    excludedKeywordsDesc: "用逗号分隔要匹配并隐藏的本机进程关键字。",
    english: "English",
    chinese: "中文",
    copyForTcp: "原始 TCP 服务不一定能直接在浏览器中打开。",
    copyAddress: "复制地址",
    sourceDocker: "Docker",
    sourceProcess: "进程",
    sourceManual: "手动",
  },
} as const;

export function App() {
  const [services, setServices] = useState<ServiceEntry[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [scannedAt, setScannedAt] = useState<string>("");
  const [recentEvents, setRecentEvents] = useState<ServiceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(5);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [selectedServiceKey, setSelectedServiceKey] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<AppView>("services");
  const [serviceFilter, setServiceFilter] = useState<ServiceFilter>("all");
  const [serviceCategory, setServiceCategory] = useState<ServiceCategory>("all");
  const [serviceQuery, setServiceQuery] = useState("");
  const [locale, setLocale] = useState<Locale>("en");
  const [resourceHistory, setResourceHistory] = useState<Record<string, ResourceSample[]>>({});
  const [filters, setFilters] = useState<FilterSettings>({
    includeDocker: true,
    includeProcesses: true,
    excludedPorts: [],
    excludedProcessKeywords: [],
  });
  const [excludedPortsInput, setExcludedPortsInput] = useState("");
  const [excludedKeywordsInput, setExcludedKeywordsInput] = useState("");
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const text = MESSAGES[locale];

  function applySnapshot(snapshot: DiscoverySnapshot) {
    setServices(snapshot.services);
    setWarnings(snapshot.warnings);
    setScannedAt(snapshot.scannedAt);
    setRecentEvents(snapshot.recentEvents);
    setResourceHistory(snapshot.resourceHistory);
    setAutoRefresh(snapshot.autoRefresh);
    setRefreshSeconds(snapshot.refreshSeconds);
    setHiddenCount(snapshot.hiddenCount);
    setFilters(snapshot.filters);
    setExcludedPortsInput(snapshot.filters.excludedPorts.join(", "));
    setExcludedKeywordsInput(snapshot.filters.excludedProcessKeywords.join(", "));
  }

  async function loadRuntimeSnapshot() {
    setLoading(true);
    setError(null);

    try {
      const snapshot = await invoke<DiscoverySnapshot>("get_runtime_snapshot");
      applySnapshot(snapshot);
    } catch (error) {
      console.error("Failed to load runtime snapshot", error);
      setError("Local discovery failed. Check Tauri logs and system permissions.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshNow() {
    setLoading(true);
    setError(null);

    try {
      const snapshot = await invoke<DiscoverySnapshot>("refresh_now");
      applySnapshot(snapshot);
    } catch (error) {
      console.error("Failed to refresh services", error);
      setError("Manual refresh failed. Check Tauri logs and system permissions.");
    } finally {
      setLoading(false);
    }
  }

  async function pushScanConfig(nextAutoRefresh: boolean, nextRefreshSeconds: number) {
    try {
      const snapshot = await invoke<DiscoverySnapshot>("update_scan_config", {
        autoRefresh: nextAutoRefresh,
        refreshSeconds: nextRefreshSeconds,
      });
      applySnapshot(snapshot);
    } catch (error) {
      console.error("Failed to update scan config", error);
      setError("Updating scan settings failed.");
    }
  }

  async function pushFilters(nextFilters: FilterSettings) {
    try {
      const snapshot = await invoke<DiscoverySnapshot>("update_filters", nextFilters);
      applySnapshot(snapshot);
    } catch (error) {
      console.error("Failed to update filters", error);
      setError(locale === "zh" ? "更新过滤规则失败。" : "Updating filters failed.");
    }
  }

  async function terminateService(service: ServiceEntry) {
    try {
      const snapshot = await invoke<DiscoverySnapshot>("terminate_service", {
        serviceKey: service.serviceKey,
      });
      applySnapshot(snapshot);
    } catch (error) {
      console.error("Failed to terminate service", error);
      setError(locale === "zh" ? "结束服务失败。" : "Terminating service failed.");
    }
  }

  useEffect(() => {
    const stored = window.localStorage.getItem("localradar-locale");
    if (stored === "en" || stored === "zh") {
      setLocale(stored);
      return;
    }

    if (navigator.language.toLowerCase().startsWith("zh")) {
      setLocale("zh");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("localradar-locale", locale);
  }, [locale]);

  useEffect(() => {
    void loadRuntimeSnapshot();
  }, []);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      const unlisten = await listen<DiscoverySnapshot>("scanner://snapshot", (event) => {
        if (disposed) {
          return;
        }

        applySnapshot(event.payload);
        setLoading(false);
      });

      unlistenRef.current = unlisten;
    })();

    return () => {
      disposed = true;

      if (unlistenRef.current) {
        void unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const onlineCount = services.filter((service) => service.status === "online").length;
  const realServices = services.filter((service) => !service.tags.includes("placeholder"));
  const filteredBaseServices = realServices.filter((service) => !service.isHidden);
  const visibleServices = filteredBaseServices.filter((service) => {
    if (serviceFilter === "favorites" && !service.isFavorite) {
      return false;
    }

    if (!matchesCategory(service, serviceCategory)) {
      return false;
    }

    if (!serviceQuery.trim()) {
      return true;
    }

    const query = serviceQuery.trim().toLowerCase();
    const haystack = [
      service.name,
      service.title ?? "",
      service.detail ?? "",
      service.host,
      service.url,
      String(service.port),
      service.workingDirectory ?? "",
      service.executablePath ?? "",
      ...service.tags,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
  const favoriteCount = realServices.filter((service) => service.isFavorite && !service.isHidden).length;
  const hiddenServices = realServices.filter((service) => service.isHidden);
  const recentAdded = recentEvents.filter((event) => event.kind === "added").length;
  const orderedServices = [...visibleServices].sort((left, right) => {
    if (left.isFavorite === right.isFavorite) {
      return left.name.localeCompare(right.name);
    }

    return left.isFavorite ? -1 : 1;
  });
  const selectedService =
    orderedServices.find((service) => service.serviceKey === selectedServiceKey) ?? orderedServices[0] ?? null;
  const formattedScannedAt = formatTimestamp(scannedAt, locale);
  const categoryOptions = [
    { key: "all" as const, label: text.categoryAll },
    { key: "docker" as const, label: text.categoryDocker },
    { key: "local" as const, label: text.categoryLocal },
    { key: "web" as const, label: text.categoryWeb },
    { key: "database" as const, label: text.categoryDatabase },
    { key: "ai" as const, label: text.categoryAi },
    { key: "tcp" as const, label: text.categoryTcp },
  ].map((option) => ({
    ...option,
    count: filteredBaseServices.filter((service) => matchesCategory(service, option.key)).length,
  }));
  const selectedResourceHistory = selectedService
    ? resourceHistory[selectedService.serviceKey] ?? []
    : [];
  const selectedVisibleTags = selectedService
    ? selectedService.tags.filter((tag) => !isSourceTag(tag, selectedService.source))
    : [];

  function sourceLabel(source: ServiceSource) {
    switch (source) {
      case "docker":
        return text.sourceDocker;
      case "process":
        return text.sourceProcess;
      case "manual":
        return text.sourceManual;
    }
  }

  async function mutateServicePreference(
    service: ServiceEntry,
    payload: { alias?: string; favorite?: boolean; hidden?: boolean },
  ) {
    try {
      const snapshot = await invoke<DiscoverySnapshot>("update_service_preference", {
        serviceKey: service.serviceKey,
        alias: payload.alias,
        favorite: payload.favorite,
        hidden: payload.hidden,
      });
      applySnapshot(snapshot);
    } catch (error) {
      console.error("Failed to update service preference", error);
      setError("Updating service preferences failed.");
    }
  }

  function renameService(service: ServiceEntry) {
    const nextName = window.prompt(text.renameService, service.name);
    if (nextName === null) {
      return;
    }

    void mutateServicePreference(service, { alias: nextName });
  }

  const viewMeta: Record<AppView, { eyebrow: string; title: string; description: string }> = {
    services: {
      eyebrow: text.serviceRadar,
      title: text.localServices,
      description: text.localServicesDesc,
    },
    activity: {
      eyebrow: text.eventStream,
      title: text.recentActivity,
      description: text.recentActivityViewDesc,
    },
    hidden: {
      eyebrow: text.visibility,
      title: text.hiddenServices,
      description: text.hiddenServicesDesc,
    },
    settings: {
      eyebrow: text.preferences,
      title: text.settings,
      description: text.settingsDesc,
    },
  };

  function parsePorts(input: string) {
    return input
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((value) => Number.isInteger(value) && value > 0 && value <= 65535);
  }

  function parseKeywords(input: string) {
    return input
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return (
    <main className="desktopShell">
      <aside className="sidebar">
        <div className="sidebarTop">
          <div className="appMark">
            <span className="appDot" />
            <div>
              <strong>LocalRadar</strong>
              <p>{text.appSubtitle}</p>
            </div>
          </div>

          <div className="sidebarBlock">
            <span className="sidebarLabel">{text.workspace}</span>
            <div className="sidebarStatList">
              <div>
                <span>{text.online}</span>
                <strong>{onlineCount}</strong>
              </div>
              <div>
                <span>{text.tracked}</span>
                <strong>{services.length}</strong>
              </div>
              <div>
                <span>{text.favorites}</span>
                <strong>{favoriteCount}</strong>
              </div>
              <div>
                <span>{text.recentAdds}</span>
                <strong>{recentAdded}</strong>
              </div>
            </div>
          </div>
        </div>

        <nav className="sidebarNav">
          <button
            className={`navItem ${currentView === "services" ? "navItem-active" : ""}`}
            onClick={() => setCurrentView("services")}
          >
            <span className="navItemLabel">
              <FolderIcon />
              {text.services}
            </span>
            <strong>{visibleServices.length}</strong>
          </button>
          <button
            className={`navItem ${currentView === "activity" ? "navItem-active" : ""}`}
            onClick={() => setCurrentView("activity")}
          >
            <span className="navItemLabel">
              <PulseIcon />
              {text.activity}
            </span>
            <strong>{recentEvents.length}</strong>
          </button>
          <button
            className={`navItem ${currentView === "hidden" ? "navItem-active" : ""}`}
            onClick={() => setCurrentView("hidden")}
          >
            <span className="navItemLabel">
              <EyeSlashMiniIcon />
              {text.hidden}
            </span>
            <strong>{hiddenCount}</strong>
          </button>
          <button
            className={`navItem ${currentView === "settings" ? "navItem-active" : ""}`}
            onClick={() => setCurrentView("settings")}
          >
            <span className="navItemLabel">
              <SettingsIcon />
              {text.settings}
            </span>
            <strong>{autoRefresh ? text.active : text.manual}</strong>
          </button>
        </nav>

        <div className="sidebarBlock">
          <span className="sidebarLabel">{text.scanner}</span>
          <div className="nativeList">
            <div className="nativeRow">
              <span>{text.status}</span>
              <span className={`liveBadge ${autoRefresh ? "liveBadge-on" : "liveBadge-off"}`}>
                {autoRefresh ? text.active : text.paused}
              </span>
            </div>
            <div className="nativeRow">
              <span>{text.interval}</span>
              <strong>{refreshSeconds}s</strong>
            </div>
            <div className="nativeRow">
              <span>{text.hidden}</span>
              <strong>{hiddenCount}</strong>
            </div>
            <div className="nativeRow">
              <span>{text.lastScan}</span>
              <strong>{formattedScannedAt}</strong>
            </div>
          </div>
        </div>

        <div className="sidebarBlock">
          <span className="sidebarLabel">{text.notes}</span>
          <p className="sidebarCopy">{text.noteCopy}</p>
        </div>
      </aside>

      <section className="workspace">
        <section className="workspaceHeader">
          <header className="titlebar">
            <div className="titlebarMain">
              <p className="titlebarEyebrow">{viewMeta[currentView].eyebrow}</p>
              <div className="titlebarHeading">
                <h1>{viewMeta[currentView].title}</h1>
                <p className="titlebarCopy">{viewMeta[currentView].description}</p>
              </div>
            </div>

            <div className="toolbarActions">
              <span className="scanStamp">{formattedScannedAt}</span>
              <button
                className="refreshButton refreshButton-icon"
                aria-label={loading ? text.scanning : text.refresh}
                title={loading ? text.scanning : text.refresh}
                onClick={() => void refreshNow()}
                disabled={loading}
              >
                <RefreshIcon />
              </button>
            </div>
          </header>

          {currentView === "services" ? (
            <section className="toolbarPanel">
              <div className="segmentedControl" role="tablist" aria-label={text.filterServices}>
                <button
                  className={serviceFilter === "all" ? "segment-active" : ""}
                  onClick={() => setServiceFilter("all")}
                >
                  {text.all}
                </button>
                <button
                  className={serviceFilter === "favorites" ? "segment-active" : ""}
                  onClick={() => setServiceFilter("favorites")}
                >
                  {text.favorites}
                </button>
              </div>

              <label className="searchControl searchControl-compact">
                <SearchIcon />
                <input
                  className="searchInput"
                  value={serviceQuery}
                  onChange={(event) => setServiceQuery(event.target.value)}
                  placeholder={text.searchServicesPlaceholder}
                />
              </label>
            </section>
          ) : null}
        </section>

        {currentView === "services" ? (
          <section className="splitLayout">
            <div className="primaryColumn">
              <section className="panel nativePanel">
                <div className="panelHeader">
                  <div>
                    <h2>{text.portal}</h2>
                    <p>{text.portalDesc}</p>
                  </div>
                </div>

                <div className="categoryBar categoryBar-panel" role="tablist" aria-label={text.filterServices}>
                  {categoryOptions.map((option) => (
                    <button
                      key={option.key}
                      className={`categoryChip ${serviceCategory === option.key ? "categoryChip-active" : ""}`}
                      onClick={() => setServiceCategory(option.key)}
                    >
                      <span>{option.label}</span>
                      <strong>{option.count}</strong>
                    </button>
                  ))}
                </div>

                {warnings.length > 0 ? (
                  <div className="warningList">
                    {warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}

                {error ? <div className="emptyState errorState">{error}</div> : null}

                {!error && visibleServices.length === 0 ? (
                  <div className="emptyState">
                    {text.noServices}
                  </div>
                ) : null}

                {!error && visibleServices.length > 0 ? (
                  <div className="serviceWorkbench">
                    <div className="serviceList">
                      <div className="listHeader">
                        <span>{text.service}</span>
                        <span>{orderedServices.length} {text.items}</span>
                      </div>
                      <div className="listBody">
                        {orderedServices.map((service) => (
                          <ServiceCard
                            key={service.id}
                            service={service}
                            selected={selectedService?.serviceKey === service.serviceKey}
                            onSelect={(target) => setSelectedServiceKey(target.serviceKey)}
                            onToggleFavorite={(target) =>
                              void mutateServicePreference(target, { favorite: !target.isFavorite })
                            }
                            onToggleHidden={(target) =>
                              void mutateServicePreference(target, { hidden: !target.isHidden })
                            }
                            onRename={renameService}
                            onCopyAddress={(value) => void copyToClipboard(value)}
                            labels={{
                              online: text.online,
                              starting: locale === "zh" ? "启动中" : "Starting",
                              offline: locale === "zh" ? "离线" : "Offline",
                              favorite: text.favorite,
                              removeFavorite: text.removeFavoriteLabel,
                              addFavorite: text.addFavoriteLabel,
                              renameService: text.renameService,
                              hideService: text.hideService,
                              unhideService: text.unhideService,
                              noMetadata: text.noMetadata,
                              docker: locale === "zh" ? "Docker" : "Docker",
                              local: locale === "zh" ? "Local" : "Local",
                              manual: text.manual,
                              copyAddress: text.copyAddress,
                            }}
                          />
                        ))}
                      </div>
                    </div>

                    <aside className="inspectorPanel">
                      {selectedService ? (
                        <>
                          <div className="inspectorHeader">
                            <div>
                              <p className="inspectorEyebrow">{text.inspector}</p>
                              <h3>{selectedService.name}</h3>
                            </div>
                            <span className={`status status-${selectedService.status}`}>
                              {selectedService.status === "online"
                                ? text.online
                                : selectedService.status === "starting"
                                  ? locale === "zh" ? "启动中" : "Starting"
                                  : locale === "zh" ? "离线" : "Offline"}
                            </span>
                          </div>

                          <div className="inspectorMeta">
                            <div className="inspectorRow">
                              <span>{text.source}</span>
                              <div className="inspectorValue">
                                <SourceBadge source={selectedService.source} locale={locale} compact />
                              </div>
                            </div>
                            <div className="inspectorRow">
                              <span>{text.protocol}</span>
                              <strong className="inspectorValue">{selectedService.protocol.toUpperCase()}</strong>
                            </div>
                            <div className="inspectorRow">
                              <span>{text.host}</span>
                              <strong className="inspectorValue">{selectedService.host}</strong>
                            </div>
                            <div className="inspectorRow">
                              <span>{text.port}</span>
                              <strong className="inspectorValue">{selectedService.port}</strong>
                            </div>
                            <div className="inspectorRow">
                              <span>{text.pid}</span>
                              <strong className="inspectorValue">{selectedService.pid ?? text.unavailable}</strong>
                            </div>
                            <div className="inspectorRow">
                              <span>{text.cpu}</span>
                              <strong className="inspectorValue">{formatCpu(selectedService.cpuPercent, text.unavailable)}</strong>
                            </div>
                            <div className="inspectorRow">
                              <span>{text.memory}</span>
                              <strong className="inspectorValue">{formatMemory(selectedService.memoryMb, text.unavailable)}</strong>
                            </div>
                          </div>

                          <div className="detailBlock">
                            <span className="sidebarLabel">{text.address}</span>
                            <div className="addressLine">
                              {selectedService.protocol === "tcp" ? (
                                <div>{selectedService.url}</div>
                              ) : (
                                <a href={selectedService.url} target="_blank" rel="noreferrer">
                                  {selectedService.url}
                                </a>
                              )}
                              <button
                                className="iconButton"
                                aria-label={text.copyAddress}
                                title={text.copyAddress}
                                onClick={() => void copyToClipboard(selectedService.url)}
                              >
                                <CopyIcon />
                              </button>
                            </div>
                            {selectedService.protocol === "tcp" ? <p>{text.copyForTcp}</p> : null}
                          </div>

                          <div className="detailBlock">
                            <span className="sidebarLabel">{text.description}</span>
                            <p>
                              {selectedService.title ??
                                selectedService.detail ??
                                text.noMetadata}
                            </p>
                          </div>

                          <div className="detailBlock">
                            <span className="sidebarLabel">{text.directory}</span>
                            <PathDetail
                              value={selectedService.workingDirectory}
                              unavailableLabel={text.unavailable}
                              expandLabel={text.showMore}
                              collapseLabel={text.showLess}
                              openLabel={text.openFolder}
                              onOpen={(value) => void openInFileManager(value, false)}
                            />
                          </div>

                          <div className="detailBlock">
                            <span className="sidebarLabel">{text.executable}</span>
                            <PathDetail
                              value={selectedService.executablePath}
                              unavailableLabel={text.unavailable}
                              expandLabel={text.showMore}
                              collapseLabel={text.showLess}
                              openLabel={text.openFolder}
                              onOpen={(value) => void openInFileManager(value, true)}
                            />
                          </div>

                          <div className="detailBlock">
                            <span className="sidebarLabel">{text.resourceUsage}</span>
                            <div className="resourceCharts">
                              <ResourceMetric
                                label={text.recentCpu}
                                value={formatCpu(selectedService.cpuPercent, text.unavailable)}
                                samples={selectedResourceHistory}
                                kind="cpu"
                              />
                              <ResourceMetric
                                label={text.recentMemory}
                                value={formatMemory(selectedService.memoryMb, text.unavailable)}
                                samples={selectedResourceHistory}
                                kind="memory"
                              />
                            </div>
                          </div>

                          {selectedVisibleTags.length > 0 ? (
                            <div className="detailBlock">
                              <span className="sidebarLabel">{text.tags}</span>
                              <div className="tagRow">
                                {selectedVisibleTags.map((tag) => (
                                  <span key={tag} className={`tag ${tagTone(tag)}`}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="detailActions">
                            {selectedService.source === "process" && selectedService.pid ? (
                              <button
                                className="iconButton iconButton-large iconButton-danger"
                                aria-label={text.terminateService}
                                title={text.terminateService}
                                onClick={() => void terminateService(selectedService)}
                              >
                                <StopIcon />
                              </button>
                            ) : null}
                            <button
                              className="iconButton iconButton-large"
                              aria-label={
                                selectedService.isFavorite ? text.removeFavorite : text.addFavorite
                              }
                              title={
                                selectedService.isFavorite ? text.removeFavorite : text.addFavorite
                              }
                              onClick={() =>
                                void mutateServicePreference(selectedService, {
                                  favorite: !selectedService.isFavorite,
                                })
                              }
                            >
                              <StarIcon filled={selectedService.isFavorite} />
                            </button>
                            <button
                              className="iconButton iconButton-large"
                              aria-label={text.rename}
                              title={text.rename}
                              onClick={() => renameService(selectedService)}
                            >
                              <EditIcon />
                            </button>
                            <button
                              className="iconButton iconButton-large"
                              aria-label={selectedService.isHidden ? text.unhide : text.hide}
                              title={selectedService.isHidden ? text.unhide : text.hide}
                              onClick={() =>
                                void mutateServicePreference(selectedService, {
                                  hidden: !selectedService.isHidden,
                                })
                              }
                            >
                              {selectedService.isHidden ? <EyeIcon /> : <EyeOffIcon />}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="emptyState">{text.inspectPrompt}</div>
                      )}
                    </aside>
                  </div>
                ) : null}
              </section>
            </div>

            <aside className="activityColumn">
              <section className="panel nativePanel fullHeight">
                <div className="panelHeader">
                  <div>
                    <h2>{text.activity}</h2>
                    <p>{text.recentActivityDesc}</p>
                  </div>
                </div>

                {recentEvents.length === 0 ? (
                  <div className="emptyState">{text.noActivity}</div>
                ) : (
                  <div className="timeline">
                    {recentEvents.slice(0, 8).map((event) => (
                      <article
                        key={`${event.kind}-${event.serviceId}-${event.observedAt}`}
                        className="timelineItem"
                      >
                        <div className={`timelineBadge timeline-${event.kind}`}>
                          {EVENT_LABEL(locale)[event.kind]}
                        </div>
                        <div className="timelineBody">
                          <h3>{event.serviceName}</h3>
                          <p>
                            <span className="timelineMetaWithBadge">
                              <SourceBadge source={event.source} locale={locale} compact />
                              <span>{formatTimestamp(event.observedAt, locale)}</span>
                            </span>
                          </p>
                          <div className="timelineLinkRow">
                            <a href={event.url} target="_blank" rel="noreferrer">
                              {event.url}
                            </a>
                            <button
                              className="iconButton"
                              aria-label={text.copyAddress}
                              title={text.copyAddress}
                              onClick={() => void copyToClipboard(event.url)}
                            >
                              <CopyIcon />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </section>
        ) : null}

        {currentView === "activity" ? (
          <section className="panel nativePanel">
            <div className="panelHeader">
              <div>
                <h2>{text.recentActivity}</h2>
                <p>{text.recentActivityDesc}</p>
              </div>
            </div>

            {recentEvents.length === 0 ? (
              <div className="emptyState">{text.noActivity}</div>
            ) : (
              <div className="timeline">
                {recentEvents.map((event) => (
                  <article
                    key={`${event.kind}-${event.serviceId}-${event.observedAt}`}
                    className="timelineItem"
                  >
                    <div className={`timelineBadge timeline-${event.kind}`}>
                      {EVENT_LABEL(locale)[event.kind]}
                    </div>
                    <div className="timelineBody">
                      <h3>{event.serviceName}</h3>
                      <p>
                        <span className="timelineMetaWithBadge">
                          <SourceBadge source={event.source} locale={locale} compact />
                          <span>{formatTimestamp(event.observedAt, locale)}</span>
                        </span>
                      </p>
                      <div className="timelineLinkRow">
                        <a href={event.url} target="_blank" rel="noreferrer">
                          {event.url}
                        </a>
                        <button
                          className="iconButton"
                          aria-label={text.copyAddress}
                          title={text.copyAddress}
                          onClick={() => void copyToClipboard(event.url)}
                        >
                          <CopyIcon />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {currentView === "hidden" ? (
          <section className="panel nativePanel">
            <div className="panelHeader">
              <div>
                <h2>{text.hiddenServices}</h2>
                <p>{text.hiddenDesc}</p>
              </div>
            </div>

            {hiddenServices.length === 0 ? (
              <div className="emptyState">{text.noHidden}</div>
            ) : (
              <div className="timeline compactTimeline">
                {hiddenServices.map((service) => (
                  <article key={service.serviceKey} className="timelineItem">
                    <div className="timelineBadge timeline-changed">{text.hidden}</div>
                    <div className="timelineBody">
                      <h3>{service.name}</h3>
                      <p>
                        <span className="timelineMetaWithBadge">
                          <SourceBadge source={service.source} locale={locale} compact />
                        <span>{service.url}</span>
                      </span>
                    </p>
                    </div>
                    <div className="timelineActions">
                      <button
                        className="iconButton iconButton-large"
                        aria-label={text.unhide}
                        title={text.unhide}
                        onClick={() => void mutateServicePreference(service, { hidden: false })}
                      >
                        <EyeIcon />
                      </button>
                      <button
                        className="iconButton iconButton-large"
                        aria-label={text.copyAddress}
                        title={text.copyAddress}
                        onClick={() => void copyToClipboard(service.url)}
                      >
                        <CopyIcon />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {currentView === "settings" ? (
          <section className="settingsLayout">
            <section className="panel nativePanel">
              <div className="panelHeader">
                <div>
                  <h2>{text.scannerSettings}</h2>
                  <p>{text.scannerSettingsDesc}</p>
                </div>
              </div>

              <div className="settingsGroup">
                <div className="settingRow">
                  <div>
                    <strong>{text.automaticScanning}</strong>
                    <p>{text.automaticScanningDesc}</p>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={autoRefresh}
                      onChange={(event) => void pushScanConfig(event.target.checked, refreshSeconds)}
                    />
                    <span>{autoRefresh ? text.enabled : text.disabled}</span>
                  </label>
                </div>

                <div className="settingRow">
                  <div>
                    <strong>{text.scanInterval}</strong>
                    <p>{text.scanIntervalDesc}</p>
                  </div>
                  <label className="intervalControl">
                    <select
                      value={refreshSeconds}
                      onChange={(event) =>
                        void pushScanConfig(autoRefresh, Number(event.target.value))
                      }
                      disabled={!autoRefresh}
                    >
                      <option value={3}>3s</option>
                      <option value={5}>5s</option>
                      <option value={10}>10s</option>
                      <option value={15}>15s</option>
                    </select>
                  </label>
                </div>

                <div className="settingRow">
                  <div>
                    <strong>{text.language}</strong>
                    <p>{locale === "zh" ? "切换界面语言。" : "Switch the interface language."}</p>
                  </div>
                  <div className="segmentedControl" role="tablist" aria-label={text.language}>
                    <button
                      className={locale === "en" ? "segment-active" : ""}
                      onClick={() => setLocale("en")}
                    >
                      {text.english}
                    </button>
                    <button
                      className={locale === "zh" ? "segment-active" : ""}
                      onClick={() => setLocale("zh")}
                    >
                      {text.chinese}
                    </button>
                  </div>
                </div>

                <div className="settingRow">
                  <div>
                    <strong>{text.filters}</strong>
                    <p>{text.filtersDesc}</p>
                  </div>
                </div>

                <div className="settingRow">
                  <div>
                    <strong>{text.includeDocker}</strong>
                    <p>{text.includeDockerDesc}</p>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={filters.includeDocker}
                      onChange={(event) =>
                        void pushFilters({
                          ...filters,
                          includeDocker: event.target.checked,
                        })
                      }
                    />
                    <span>{filters.includeDocker ? text.enabled : text.disabled}</span>
                  </label>
                </div>

                <div className="settingRow">
                  <div>
                    <strong>{text.includeProcesses}</strong>
                    <p>{text.includeProcessesDesc}</p>
                  </div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={filters.includeProcesses}
                      onChange={(event) =>
                        void pushFilters({
                          ...filters,
                          includeProcesses: event.target.checked,
                        })
                      }
                    />
                    <span>{filters.includeProcesses ? text.enabled : text.disabled}</span>
                  </label>
                </div>

                <div className="settingRow">
                  <div>
                    <strong>{text.excludedPorts}</strong>
                    <p>{text.excludedPortsDesc}</p>
                  </div>
                  <div className="settingsInputGroup">
                    <input
                      className="settingsInput"
                      value={excludedPortsInput}
                      onChange={(event) => setExcludedPortsInput(event.target.value)}
                      onBlur={() =>
                        void pushFilters({
                          ...filters,
                          excludedPorts: parsePorts(excludedPortsInput),
                        })
                      }
                      placeholder="5000, 5432"
                    />
                  </div>
                </div>

                <div className="settingRow">
                  <div>
                    <strong>{text.excludedKeywords}</strong>
                    <p>{text.excludedKeywordsDesc}</p>
                  </div>
                  <div className="settingsInputGroup">
                    <input
                      className="settingsInput"
                      value={excludedKeywordsInput}
                      onChange={(event) => setExcludedKeywordsInput(event.target.value)}
                      onBlur={() =>
                        void pushFilters({
                          ...filters,
                          excludedProcessKeywords: parseKeywords(excludedKeywordsInput),
                        })
                      }
                      placeholder="launchd, cupsd"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="panel nativePanel">
              <div className="panelHeader">
                <div>
                  <h2>{text.workspaceSummary}</h2>
                  <p>{text.workspaceSummaryDesc}</p>
                </div>
              </div>

              <div className="nativeList">
                <div className="nativeRow">
                  <span>{text.tracked}</span>
                  <strong>{services.length}</strong>
                </div>
                <div className="nativeRow">
                  <span>{text.favorites}</span>
                  <strong>{favoriteCount}</strong>
                </div>
                <div className="nativeRow">
                  <span>{text.hidden}</span>
                  <strong>{hiddenCount}</strong>
                </div>
                <div className="nativeRow">
                  <span>{text.warnings}</span>
                  <strong>{warnings.length}</strong>
                </div>
              </div>
            </section>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function EVENT_LABEL(locale: Locale): Record<ServiceEvent["kind"], string> {
  return locale === "zh"
    ? { added: "新增", removed: "移除", changed: "变更" }
    : { added: "Added", removed: "Removed", changed: "Changed" };
}

function SourceBadge({
  source,
  locale,
  compact = false,
}: {
  source: ServiceSource;
  locale: Locale;
  compact?: boolean;
}) {
  const label =
    source === "docker"
      ? "Docker"
      : source === "process"
        ? locale === "zh"
          ? "Local"
          : "Local"
        : locale === "zh"
          ? "手动"
          : "Manual";

  return (
    <span className={`source source-${source} ${compact ? "source-compact" : ""}`}>
      {source === "docker" ? <DockerIcon /> : source === "process" ? <LocalIcon /> : <ManualIcon />}
      {label}
    </span>
  );
}

function tagTone(tag: string) {
  const value = tag.toLowerCase();

  if (value.includes("docker") || value.includes("container")) {
    return "tag-docker";
  }
  if (value.includes("web") || value.includes("http") || value.includes("frontend")) {
    return "tag-web";
  }
  if (
    value.includes("db") ||
    value.includes("database") ||
    value.includes("postgres") ||
    value.includes("mysql") ||
    value.includes("redis")
  ) {
    return "tag-data";
  }
  if (value.includes("ai") || value.includes("ml") || value.includes("ollama")) {
    return "tag-ai";
  }
  if (value.includes("dev") || value.includes("tool")) {
    return "tag-dev";
  }

  return "tag-neutral";
}

function isSourceTag(tag: string, source: ServiceSource) {
  const value = tag.toLowerCase();

  if (source === "docker") {
    return value === "docker" || value === "container";
  }
  if (source === "process") {
    return value === "local" || value === "process";
  }
  if (source === "manual") {
    return value === "manual";
  }

  return false;
}

function matchesCategory(service: ServiceEntry, category: ServiceCategory) {
  if (category === "all") {
    return true;
  }

  const tags = service.tags.map((tag) => tag.toLowerCase());

  switch (category) {
    case "docker":
      return service.source === "docker";
    case "local":
      return service.source === "process";
    case "web":
      return (
        service.protocol === "http" ||
        service.protocol === "https" ||
        tags.some((tag) => ["web", "frontend", "http"].includes(tag))
      );
    case "database":
      return tags.some((tag) => ["database", "postgres", "mysql", "redis", "cache"].includes(tag));
    case "ai":
      return tags.some((tag) => ["ai", "ollama", "ml"].includes(tag));
    case "tcp":
      return service.protocol === "tcp";
  }
}

function formatTimestamp(raw: string, locale: Locale) {
  if (!raw || raw === "Waiting...") {
    return locale === "zh" ? "等待中..." : "Waiting...";
  }

  const normalized = raw.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatCpu(value: number | null | undefined, fallback: string) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return `${value.toFixed(1)}%`;
}

function formatMemory(value: number | null | undefined, fallback: string) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return `${value} MB`;
}

function ResourceMetric({
  label,
  value,
  samples,
  kind,
}: {
  label: string;
  value: string;
  samples: ResourceSample[];
  kind: "cpu" | "memory";
}) {
  const numericValues = samples
    .map((sample) => (kind === "cpu" ? sample.cpuPercent : sample.memoryMb))
    .filter((entry): entry is number => entry !== null && entry !== undefined && !Number.isNaN(entry));

  return (
    <div className="resourceMetric">
      <div className="resourceMetricHeader">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Sparkline values={numericValues} tone={kind} />
    </div>
  );
}

function Sparkline({
  values,
  tone,
}: {
  values: number[];
  tone: "cpu" | "memory";
}) {
  if (values.length === 0) {
    return <div className="sparklineEmpty" />;
  }

  const width = 220;
  const height = 44;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`sparkline sparkline-${tone}`}
      aria-hidden="true"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (error) {
    console.error("Failed to copy text", error);
  }
}

async function openInFileManager(path: string, revealParent: boolean) {
  try {
    await invoke("open_in_file_manager", {
      path,
      revealParent,
    });
  } catch (error) {
    console.error("Failed to open path in file manager", error);
  }
}

function PathDetail({
  value,
  unavailableLabel,
  expandLabel,
  collapseLabel,
  openLabel,
  onOpen,
}: {
  value?: string | null;
  unavailableLabel: string;
  expandLabel: string;
  collapseLabel: string;
  openLabel: string;
  onOpen: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!value) {
    return <p>{unavailableLabel}</p>;
  }

  const isLong = value.length > 72;

  return (
    <div className="pathDetail">
      <p className={`pathValue ${expanded ? "pathValue-expanded" : ""}`}>{value}</p>
      <div className="pathActions">
        {isLong ? (
          <button className="ghostButton pathToggle" onClick={() => setExpanded((current) => !current)}>
            {expanded ? collapseLabel : expandLabel}
          </button>
        ) : null}
        <button className="ghostButton pathToggle" onClick={() => onOpen(value)}>
          <FolderIcon />
          <span>{openLabel}</span>
        </button>
      </div>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M13 4.8V2.5h-2.3M13 8A5 5 0 1 1 7.6 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DockerIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M2.2 6.2h2v2h-2Zm2.4 0h2v2h-2Zm2.4 0h2v2H7Zm-2.4-2.3h2v1.8h-2Zm2.4 0h2v1.8H7Zm2.7 2.6h2.1c.7 0 1.2.6 1.1 1.3-.2 2.2-2 4-4.3 4H5.3C3.5 11.8 2 10.3 2 8.5V8h7.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LocalIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M3 3.2h10v6.3H3zM6.2 12.8h3.6M8 9.5v3.3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ManualIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M8 2.2v11.6M2.2 8h11.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M8 1.6 9.8 5.3l4 .5-2.9 2.8.8 4-3.7-2-3.6 2 .7-4L2.2 5.8l4-.5L8 1.6Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M3 11.8 11.8 3l1.3 1.3L4.3 13.1H3v-1.3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M10.8 4l1.2-1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M1.5 8s2.2-3.5 6.5-3.5S14.5 8 14.5 8s-2.2 3.5-6.5 3.5S1.5 8 1.5 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="1.9" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M1.5 8s2.2-3.5 6.5-3.5S14.5 8 14.5 8s-2.2 3.5-6.5 3.5S1.5 8 1.5 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M3 13 13 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <rect
        x="5"
        y="3"
        width="8"
        height="10"
        rx="1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M3 11V5.6C3 4.7 3.7 4 4.6 4H9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.4 10.4 13 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <rect
        x="3.2"
        y="3.2"
        width="9.6"
        height="9.6"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M1.8 4.5h4l1 1.2h7.4v5.8a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M1.5 8h2.7l1.5-3.2L8 11l1.8-4h4.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EyeSlashMiniIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M1.5 8s2.2-3.5 6.5-3.5S14.5 8 14.5 8s-2.2 3.5-6.5 3.5S1.5 8 1.5 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M3 13 13 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" className="iconSvg" aria-hidden="true">
      <path
        d="M8 2.2 9 3l1.5-.2.7 1.3 1.3.7-.2 1.5.8 1-.8 1 .2 1.5-1.3.7-.7 1.3-1.5-.2-1 .8-1-.8-1.5.2-.7-1.3-1.3-.7.2-1.5-.8-1 .8-1-.2-1.5 1.3-.7.7-1.3L7 3l1-.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}
