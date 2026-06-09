import type { InitialPayload, ProjectSection, ReportConfig, SessionDetail } from "./types";

const BASE = "/api";

export async function fetchStatus(): Promise<ProjectSection[]> {
  const res = await fetch(`${BASE}/status`);
  if (!res.ok) throw new Error(`/api/status: ${res.status}`);
  return res.json();
}

export async function fetchProjects(): Promise<InitialPayload["projects"]> {
  const res = await fetch(`${BASE}/projects`);
  if (!res.ok) throw new Error(`/api/projects: ${res.status}`);
  return res.json();
}

export async function addProject(
  path: string,
  claudeDirs: string[],
): Promise<{ name: string; path: string }> {
  const res = await fetch(`${BASE}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, claudeDirs }),
  });
  if (!res.ok) throw new Error(`POST /api/projects: ${res.status}`);
  return res.json();
}

export async function removeProject(name: string): Promise<void> {
  const res = await fetch(`${BASE}/projects/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`DELETE /api/projects: ${res.status}`);
}

export async function updateClaudeDirs(
  name: string,
  claudeDirs: string[],
): Promise<void> {
  const res = await fetch(
    `${BASE}/projects/${encodeURIComponent(name)}/claude-dirs`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claudeDirs }),
    },
  );
  if (!res.ok) throw new Error(`PUT /api/projects/.../claude-dirs: ${res.status}`);
}

/** Toggle the per-project desktop-notification flag. */
export async function setNotifyEnabled(
  name: string,
  enabled: boolean,
): Promise<void> {
  const res = await fetch(
    `${BASE}/projects/${encodeURIComponent(name)}/notify`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
  );
  if (!res.ok) throw new Error(`PUT /api/projects/.../notify: ${res.status}`);
}

export async function fetchReportConfig(): Promise<ReportConfig> {
  const res = await fetch(`${BASE}/report-config`);
  if (!res.ok) throw new Error(`/api/report-config: ${res.status}`);
  return res.json();
}

export async function saveReportConfig(outputPath: string): Promise<void> {
  const res = await fetch(`${BASE}/report-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outputPath }),
  });
  if (!res.ok) throw new Error(`POST /api/report-config: ${res.status}`);
}

export async function generateReport(hours: number, today = false): Promise<{ ok: boolean; filePath: string; content: string }> {
  const res = await fetch(`${BASE}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hours, today }),
  });
  if (!res.ok) throw new Error(`POST /api/report: ${res.status}`);
  return res.json();
}

export async function toggleHiddenSession(sessionId: string): Promise<string[]> {
  const res = await fetch(`${BASE}/hidden-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) throw new Error(`POST /api/hidden-sessions: ${res.status}`);
  const data = await res.json();
  return data.hiddenSessions;
}

export async function browseFolder(): Promise<{ path: string | null }> {
  const res = await fetch(`${BASE}/browse`, { method: "POST" });
  if (!res.ok) throw new Error(`POST /api/browse: ${res.status}`);
  return res.json();
}

export async function fetchSessionDetail(
  sessionId: string,
  projectName: string,
  claudeDir: string,
): Promise<SessionDetail> {
  const params = new URLSearchParams({ project: projectName, claudeDir });
  const res = await fetch(
    `${BASE}/sessions/${encodeURIComponent(sessionId)}?${params}`,
  );
  if (!res.ok) throw new Error(`GET /api/sessions: ${res.status}`);
  return res.json();
}

/** Notification event pushed when an assistant turn finishes (stop_reason=end_turn) */
export interface TurnCompleteEvent {
  type: "turn-complete";
  sessionId: string;
  projectName: string;
  projectPath: string;
  claudeDir: string;
  turnUuid: string;
  preview: string;
  timestamp?: string;
}

/**
 * SSE subscription — calls onData on each unnamed payload event,
 * onTurnComplete on each named "turn-complete" event. Auto-reconnects.
 */
export function subscribeSSE(
  onData: (payload: InitialPayload) => void,
  onTurnComplete?: (event: TurnCompleteEvent) => void,
): () => void {
  let es: EventSource | null = null;
  let stopped = false;

  function connect() {
    if (stopped) return;
    es = new EventSource(`${BASE}/events`);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data) as InitialPayload;
      onData(data);
    };
    if (onTurnComplete) {
      es.addEventListener("turn-complete", (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data) as TurnCompleteEvent;
          onTurnComplete(parsed);
        } catch (e) {
          console.error("[sse] failed to parse turn-complete event", e);
        }
      });
    }
    es.onerror = () => {
      es?.close();
      if (!stopped) setTimeout(connect, 3000);
    };
  }

  connect();

  return () => {
    stopped = true;
    es?.close();
  };
}
