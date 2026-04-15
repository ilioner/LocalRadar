type ServiceEntry = {
  id: string;
  serviceKey: string;
  name: string;
  source: "docker" | "process" | "manual";
  protocol: "http" | "https" | "tcp";
  host: string;
  port: number;
  url: string;
  status: "online" | "starting" | "offline";
  title?: string | null;
  detail?: string | null;
  tags: string[];
  isFavorite: boolean;
  isHidden: boolean;
};

type ServiceCardProps = {
  service: ServiceEntry;
  selected: boolean;
  onSelect: (service: ServiceEntry) => void;
  onToggleFavorite: (service: ServiceEntry) => void;
  onToggleHidden: (service: ServiceEntry) => void;
  onRename: (service: ServiceEntry) => void;
  labels: {
    online: string;
    starting: string;
    offline: string;
    favorite: string;
    removeFavorite: string;
    addFavorite: string;
    renameService: string;
    hideService: string;
    unhideService: string;
    noMetadata: string;
    docker: string;
    local: string;
    manual: string;
    copyAddress: string;
  };
  onCopyAddress: (value: string) => void;
};

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

function IconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button className="iconButton" aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function ServiceCard({
  service,
  selected,
  onSelect,
  onToggleFavorite,
  onToggleHidden,
  onRename,
  labels,
  onCopyAddress,
}: ServiceCardProps) {
  const visibleTags = service.tags.filter((tag) => {
    const value = tag.toLowerCase();
    if (service.source === "docker" && (value === "docker" || value === "container")) {
      return false;
    }
    if (service.source === "process" && (value === "local" || value === "process")) {
      return false;
    }
    if (service.source === "manual" && value === "manual") {
      return false;
    }
    return true;
  });

  return (
    <article
      className={`serviceCard serviceRow ${selected ? "serviceRow-selected" : ""}`}
      onClick={() => onSelect(service)}
    >
      <header className="serviceHeader">
        <div className="serviceTitleGroup">
          <div className={`sourceAvatar sourceAvatar-${service.source}`}>
            {service.source === "docker" ? <DockerIcon /> : service.source === "process" ? <LocalIcon /> : <ManualIcon />}
          </div>
          <div className="serviceTitleBlock">
          <h3>{service.name}</h3>
          <p>{service.title ?? service.detail ?? labels.noMetadata}</p>
          </div>
        </div>
        <div className="serviceHeaderMeta">
          {service.isFavorite ? <span className="favoritePill">{labels.favorite}</span> : null}
          <span className={`status status-${service.status}`}>{labels[service.status]}</span>
          <SourceBadge source={service.source} labels={labels} />
        </div>
      </header>

      <footer className="serviceFooter">
        <span className="endpointLabel">
          <span>
            {service.protocol.toUpperCase()} · {service.host}:{service.port}
          </span>
          <IconButton
            label={labels.copyAddress}
            onClick={(event) => {
              event.stopPropagation();
              onCopyAddress(`${service.host}:${service.port}`);
            }}
          >
            <CopyIcon />
          </IconButton>
        </span>
        {visibleTags.length > 0 ? (
          <div className="tagRow">
            {visibleTags.map((tag) => (
              <span key={tag} className={`tag ${tagTone(tag)}`}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        <div className="cardActions">
          <IconButton
            label={service.isFavorite ? labels.removeFavorite : labels.addFavorite}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite(service);
            }}
          >
            <StarIcon filled={service.isFavorite} />
          </IconButton>
          <IconButton
            label={labels.renameService}
            onClick={(event) => {
              event.stopPropagation();
              onRename(service);
            }}
          >
            <EditIcon />
          </IconButton>
          <IconButton
            label={service.isHidden ? labels.unhideService : labels.hideService}
            onClick={(event) => {
              event.stopPropagation();
              onToggleHidden(service);
            }}
          >
            {service.isHidden ? <EyeIcon /> : <EyeOffIcon />}
          </IconButton>
        </div>
      </footer>
    </article>
  );
}

function SourceBadge({
  source,
  labels,
}: {
  source: ServiceEntry["source"];
  labels: ServiceCardProps["labels"];
}) {
  const label =
    source === "docker" ? labels.docker : source === "process" ? labels.local : labels.manual;

  return (
    <span className={`source source-${source}`}>
      {source === "docker" ? <DockerIcon /> : source === "process" ? <LocalIcon /> : <ManualIcon />}
      {label}
    </span>
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
