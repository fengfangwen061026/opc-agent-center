import type {
  ObsidianFile,
  ObsidianNote,
  ObsidianSearchResult,
  ObsidianStatus,
  WriteOptions,
} from "@opc/core";

export interface ObsidianAdapter {
  status(): Promise<ObsidianStatus>;
  list(path: string): Promise<ObsidianFile[]>;
  read(path: string): Promise<ObsidianNote>;
  write(path: string, content: string, options?: WriteOptions): Promise<void>;
  search(query: string): Promise<ObsidianSearchResult[]>;
}

const now = () => new Date().toISOString();

export class MockObsidianAdapter implements ObsidianAdapter {
  private notes = new Map<string, ObsidianNote>([
    [
      "08_Review_Queue/OpenClaw Skill Standards.md",
      {
        path: "08_Review_Queue/OpenClaw Skill Standards.md",
        title: "OpenClaw 技能规范",
        tags: ["openclaw", "skills"],
        updatedAt: "2026-04-22T13:46:20.000Z",
        content:
          "# OpenClaw 技能规范\n\n已暂存待审核的来源笔记。\n\n- Skill-first 执行\n- 每个智能体独立 allowlist\n- Capsule 输出契约\n",
      },
    ],
    [
      "06_Drafts/trends/2026-04-22-agent-os.md",
      {
        path: "06_Drafts/trends/2026-04-22-agent-os.md",
        title: "Agent OS 趋势简报",
        tags: ["agents", "research"],
        updatedAt: "2026-04-22T14:18:00.000Z",
        content:
          "# Agent OS 趋势简报\n\n个人 AI 操作系统的 mock 趋势简报。\n\n## 信号\n\n- 技能注册表正在变成可运行的记忆。\n- S3/S4 动作仍应默认走人类审批。\n",
      },
    ],
  ]);

  async status(): Promise<ObsidianStatus> {
    return {
      connected: true,
      mode: "mock",
      vaultName: "OPC Mock 仓库",
      pendingWrites: 0,
    };
  }

  async list(path: string): Promise<ObsidianFile[]> {
    const normalized = path.replace(/^\/+|\/+$/g, "");
    if (normalized) {
      return Array.from(this.notes.values())
        .filter((note) => note.path.startsWith(`${normalized}/`))
        .map((note) => ({
          path: note.path,
          name: note.path.split("/").at(-1) ?? note.title,
          type: "file",
        }));
    }
    return [
      { path: "00_Inbox", name: "00_Inbox", type: "folder", children: [] },
      { path: "01_Sources", name: "01_Sources", type: "folder", children: [] },
      { path: "06_Drafts", name: "06_Drafts", type: "folder", children: [] },
      {
        path: "08_Review_Queue",
        name: "08_Review_Queue",
        type: "folder",
        children: [
          {
            path: "08_Review_Queue/OpenClaw Skill Standards.md",
            name: "OpenClaw Skill Standards.md",
            type: "file",
          },
        ],
      },
    ];
  }

  async read(path: string): Promise<ObsidianNote> {
    const note = this.notes.get(decodeURIComponent(path));
    if (!note) throw new Error(`Note not found: ${path}`);
    return note;
  }

  async write(
    path: string,
    content: string,
    options: WriteOptions = { mode: "createOnly" },
  ): Promise<void> {
    const normalized = path.startsWith("08_Review_Queue/")
      ? path
      : `08_Review_Queue/${path.replace(/^\/+/, "")}`;
    if (options.mode === "createOnly" && this.notes.has(normalized)) {
      throw new Error(`笔记已存在：${normalized}`);
    }
    const existing = this.notes.get(normalized);
    const finalContent =
      options.mode === "appendOnly" && existing ? `${existing.content}\n${content}` : content;
    this.notes.set(normalized, {
      path: normalized,
      title: normalized.split("/").at(-1)?.replace(/\.md$/, "") ?? "未命名",
      content: finalContent,
      tags: [],
      updatedAt: now(),
    });
  }

  async search(query: string): Promise<ObsidianSearchResult[]> {
    const q = query.toLowerCase();
    return Array.from(this.notes.values())
      .filter((note) => `${note.title}\n${note.content}`.toLowerCase().includes(q))
      .map((note) => ({
        path: note.path,
        title: note.title,
        excerpt: note.content.slice(0, 160),
        score: 1,
      }));
  }
}

export class LocalRestObsidianAdapter implements ObsidianAdapter {
  private pendingWrites = 0;

  constructor(
    private readonly apiUrl: string,
    private readonly token?: string,
  ) {}

  async status(): Promise<ObsidianStatus> {
    try {
      const response = await fetch(`${this.apiUrl}/`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      return {
        connected: response.ok,
        mode: "rest",
        apiUrl: this.apiUrl,
        pendingWrites: this.pendingWrites,
        lastError: response.ok ? undefined : response.statusText,
      };
    } catch (error) {
      return {
        connected: false,
        mode: "rest",
        apiUrl: this.apiUrl,
        pendingWrites: this.pendingWrites,
        lastError: error instanceof Error ? error.message : "Obsidian REST unavailable",
      };
    }
  }

  async list(path: string): Promise<ObsidianFile[]> {
    const response = await fetch(`${this.apiUrl}/vault/${encodeURIComponent(path)}`, {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`Obsidian list failed: ${response.statusText}`);
    const data = (await response.json()) as string[];
    return data.map((entry) => ({
      path: entry,
      name: entry.split("/").at(-1) ?? entry,
      type: entry.endsWith("/") ? "folder" : "file",
    }));
  }

  async read(path: string): Promise<ObsidianNote> {
    const response = await fetch(`${this.apiUrl}/vault/${encodeURIComponent(path)}`, {
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`Obsidian read failed: ${response.statusText}`);
    const content = await response.text();
    return {
      path,
      title: path.split("/").at(-1)?.replace(/\.md$/, "") ?? path,
      content,
      tags: [],
      updatedAt: now(),
      etag: response.headers.get("etag") ?? undefined,
    };
  }

  async write(
    path: string,
    content: string,
    options: WriteOptions = { mode: "createOnly" },
  ): Promise<void> {
    if (options.mode === "createOnly") {
      const existing = await fetch(`${this.apiUrl}/vault/${encodeURIComponent(path)}`, {
        method: "GET",
        headers: this.headers(),
      });
      if (existing.ok) throw new Error(`Obsidian note already exists: ${path}`);
      if (![404, 410].includes(existing.status)) {
        throw new Error(`Obsidian createOnly probe failed: ${existing.statusText}`);
      }
    }
    const method = options.mode === "appendOnly" ? "PATCH" : "PUT";
    const response = await fetch(`${this.apiUrl}/vault/${encodeURIComponent(path)}`, {
      method,
      headers: {
        ...this.headers(),
        "Content-Type": "text/markdown",
        ...(options.ifMatch ? { "If-Match": options.ifMatch } : {}),
      },
      body: content,
    });
    if (!response.ok) throw new Error(`Obsidian write failed: ${response.statusText}`);
  }

  async search(query: string): Promise<ObsidianSearchResult[]> {
    const response = await fetch(
      `${this.apiUrl}/search/simple/?query=${encodeURIComponent(query)}`,
      {
        headers: this.headers(),
      },
    );
    if (!response.ok) throw new Error(`Obsidian search failed: ${response.statusText}`);
    const data = (await response.json()) as Array<{ filename?: string; matches?: string[] }>;
    return data.map((item) => ({
      path: item.filename ?? "unknown.md",
      title: item.filename?.split("/").at(-1)?.replace(/\.md$/, "") ?? "Unknown",
      excerpt: item.matches?.[0] ?? "",
      score: 1,
    }));
  }

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {};
  }
}

export function createObsidianAdapter(config: {
  mode: "mock" | "rest";
  apiUrl?: string;
  token?: string;
}): ObsidianAdapter {
  if (config.mode === "rest" && config.apiUrl) {
    return new LocalRestObsidianAdapter(config.apiUrl, config.token);
  }
  return new MockObsidianAdapter();
}
