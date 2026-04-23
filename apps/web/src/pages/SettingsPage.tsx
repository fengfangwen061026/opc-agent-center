import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, Play, Settings, ShieldAlert, Square, Stethoscope } from "lucide-react";
import { ConnectionBadge, GlassCard, LiquidButton, StatusPill } from "@opc/ui";
import {
  exportBundle,
  applyRuntimeCleanup,
  checkIntegration,
  createRuntimeBackup,
  getHealth,
  getIntegrations,
  getRuntimeStateSummary,
  getServiceStatus,
  previewRuntimeCleanup,
  startIntegration,
  stopIntegration,
  runOpenClawDoctor,
  startOpenClawGateway,
  stopOpenClawGateway,
  testHermes,
  testObsidian,
} from "../lib/api";

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState("mock");
  const [gatewayUrl, setGatewayUrl] = useState("ws://127.0.0.1:18789");
  const [token, setToken] = useState("");
  const [testResult, setTestResult] = useState("");
  const [diagnosticOutput, setDiagnosticOutput] = useState("");
  const { data: health } = useQuery({ queryKey: ["health"], queryFn: getHealth });
  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: getIntegrations,
    refetchInterval: 5000,
  });
  const { data: serviceStatus } = useQuery({
    queryKey: ["service-status"],
    queryFn: () => getServiceStatus(true),
    refetchInterval: 5000,
  });
  const { data: runtimeSummary } = useQuery({
    queryKey: ["runtime-state-summary"],
    queryFn: getRuntimeStateSummary,
  });
  const serviceMutation = useMutation({
    mutationFn: async (action: "start" | "stop" | "doctor" | "obsidian" | "hermes") => {
      if (action === "start") return startOpenClawGateway();
      if (action === "stop") return stopOpenClawGateway();
      if (action === "doctor") return runOpenClawDoctor();
      if (action === "obsidian") return testObsidian();
      return testHermes();
    },
    onSuccess: (result) => {
      setDiagnosticOutput(JSON.stringify(result, null, 2));
      queryClient.invalidateQueries({ queryKey: ["service-status"] });
      queryClient.invalidateQueries({ queryKey: ["health"] });
    },
  });
  const integrationMutation = useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: "openclaw" | "hermes" | "obsidian" | "codex" | "claude-code";
      action: "check" | "start" | "stop";
    }) => {
      if (action === "start") return startIntegration(id);
      if (action === "stop") return stopIntegration(id);
      return checkIntegration(id);
    },
    onSuccess: (result) => {
      setDiagnosticOutput(JSON.stringify(result, null, 2));
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
    },
  });
  const runtimeMutation = useMutation({
    mutationFn: async (action: "backup" | "cleanup-preview" | "cleanup-apply") => {
      if (action === "backup") return createRuntimeBackup();
      if (action === "cleanup-apply") return applyRuntimeCleanup();
      return previewRuntimeCleanup();
    },
    onSuccess: (result) => {
      setDiagnosticOutput(JSON.stringify(result, null, 2));
      queryClient.invalidateQueries({ queryKey: ["runtime-state-summary"] });
    },
  });
  const remoteWarning =
    gatewayUrl.startsWith("ws://") &&
    !gatewayUrl.includes("127.0.0.1") &&
    !gatewayUrl.includes("localhost");

  async function exportData() {
    const bundle = await exportBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "opc-export.json";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className="opc-page-stack">
      <header className="opc-page-title">
        <span>本地优先控制台</span>
        <h1>设置</h1>
      </header>
      <GlassCard className="opc-settings-panel">
        <div className="opc-panel-heading">
          <strong>网关连接</strong>
          <ConnectionBadge label="网关" state={health?.gateway ?? "offline"} />
        </div>
        <label>
          模式
          <select onChange={(event) => setMode(event.target.value)} value={mode}>
            <option value="mock">mock</option>
            <option value="ws">ws</option>
            <option value="cli">cli</option>
          </select>
        </label>
        <label>
          网关 URL
          <input onChange={(event) => setGatewayUrl(event.target.value)} value={gatewayUrl} />
        </label>
        <label>
          Token
          <input onChange={(event) => setToken(event.target.value)} type="password" value={token} />
        </label>
        {remoteWarning ? (
          <p className="opc-warning-line">
            <ShieldAlert size={16} />
            远程网关应使用 wss/HTTPS、Tailscale 或其他受保护隧道。
          </p>
        ) : null}
        <div className="opc-action-row">
          <LiquidButton
            icon={<Settings size={16} />}
            onClick={() =>
              setTestResult(`模式 ${mode} 可用。Token 是否填写：${token ? "是" : "否"}`)
            }
          >
            测试连接
          </LiquidButton>
          <LiquidButton icon={<Download size={16} />} onClick={exportData} variant="secondary">
            导出数据
          </LiquidButton>
        </div>
        {testResult ? <p>{testResult}</p> : null}
      </GlassCard>
      <GlassCard className="opc-settings-panel">
        <div className="opc-panel-heading">
          <strong>本地服务编排</strong>
        </div>
        <p>
          OpenClaw、Hermes、Obsidian Local REST API 源码安装在 <code>external/</code>， Bridge
          会按环境变量选择真实 adapter，连接不可用时自动回落到 mock。
        </p>
        <dl className="opc-detail-grid">
          <div>
            <dt>安装</dt>
            <dd>pnpm services:install</dd>
          </div>
          <div>
            <dt>启动</dt>
            <dd>pnpm services:start</dd>
          </div>
          <div>
            <dt>OpenClaw</dt>
            <dd>CLI 已接入，Gateway daemon 需要单独配对启动。</dd>
          </div>
          <div>
            <dt>Obsidian</dt>
            <dd>插件已构建，需在 Obsidian 中启用并配置 token。</dd>
          </div>
        </dl>
      </GlassCard>
      <GlassCard className="opc-settings-panel">
        <div className="opc-panel-heading">
          <strong>Service Center</strong>
          <span>2.0 · 真实服务状态 / 配置缺失项 / 修复建议</span>
        </div>
        <div className="opc-card-grid">
          <GlassCard className="opc-agent-list-card">
            <strong>接入向导</strong>
            <p>1. 检测 OpenClaw / Hermes / Obsidian / Codex / Claude Code。</p>
            <p>2. 只把 token 写入本地 secrets，不进入前端、事件、日志或 Capsule。</p>
            <p>3. 真实 Codex/Claude 执行必须先审批，并限制 allowed roots 与隔离 workspace。</p>
            <p>4. Obsidian 只写 Review Queue create-only，写后 readback verify。</p>
          </GlassCard>
          <GlassCard className="opc-agent-list-card">
            <strong>运行时状态</strong>
            <dl className="opc-detail-grid">
              <div>
                <dt>Capsules</dt>
                <dd>{runtimeSummary?.counts.capsules ?? 0}</dd>
              </div>
              <div>
                <dt>Approvals</dt>
                <dd>{runtimeSummary?.counts.approvals ?? 0}</dd>
              </div>
              <div>
                <dt>Coding Runs</dt>
                <dd>{runtimeSummary?.counts.codingRuns ?? 0}</dd>
              </div>
              <div>
                <dt>Hermes Candidates</dt>
                <dd>{runtimeSummary?.counts.hermesCandidates ?? 0}</dd>
              </div>
            </dl>
            <div className="opc-action-row">
              <LiquidButton onClick={() => runtimeMutation.mutate("backup")} variant="secondary">
                创建运行时备份
              </LiquidButton>
              <LiquidButton
                onClick={() => runtimeMutation.mutate("cleanup-preview")}
                variant="ghost"
              >
                清理预览
              </LiquidButton>
              <LiquidButton onClick={() => runtimeMutation.mutate("cleanup-apply")} variant="ghost">
                执行安全清理
              </LiquidButton>
            </div>
          </GlassCard>
        </div>
        <div className="opc-card-grid">
          {integrations.map((integration) => (
            <GlassCard className="opc-agent-list-card" key={integration.id}>
              <div className="opc-panel-heading">
                <strong>{integration.label}</strong>
                <StatusPill
                  label={integrationStatusLabel(integration.status)}
                  status={
                    integration.status === "connected"
                      ? "connected"
                      : statusToPill(integration.status)
                  }
                />
              </div>
              <div className="opc-agent-list-card__meta">
                <span>mode: {integration.mode}</span>
                <span>{integration.version ?? "未探测版本"}</span>
              </div>
              <dl className="opc-detail-grid">
                <div>
                  <dt>能力</dt>
                  <dd>
                    {integration.capabilities
                      .map((capability) => `${capability.label}:${capability.status}`)
                      .join(" / ")}
                  </dd>
                </div>
                <div>
                  <dt>配置</dt>
                  <dd>{JSON.stringify(integration.redactedConfig).slice(0, 160)}</dd>
                </div>
              </dl>
              {integration.requiredActions.slice(0, 2).map((action) => (
                <p key={action.id}>
                  <strong>{action.label}</strong>
                  {action.command ? `：${action.command}` : null}
                </p>
              ))}
              <div className="opc-action-row">
                <LiquidButton
                  onClick={() =>
                    integrationMutation.mutate({ id: integration.id, action: "check" })
                  }
                  variant="secondary"
                >
                  重新检测
                </LiquidButton>
                {integration.id === "openclaw" ? (
                  <>
                    <LiquidButton
                      onClick={() =>
                        integrationMutation.mutate({ id: integration.id, action: "start" })
                      }
                      variant="ghost"
                    >
                      启动
                    </LiquidButton>
                    <LiquidButton
                      onClick={() =>
                        integrationMutation.mutate({ id: integration.id, action: "stop" })
                      }
                      variant="ghost"
                    >
                      停止
                    </LiquidButton>
                  </>
                ) : null}
              </div>
            </GlassCard>
          ))}
        </div>
      </GlassCard>
      <GlassCard className="opc-settings-panel">
        <div className="opc-panel-heading">
          <strong>Service Center 兼容视图</strong>
          <span>Phase 3 诊断 API</span>
        </div>
        <div className="opc-card-grid">
          <ServiceBlock
            details={[
              serviceStatus?.openclaw.version ?? "未探测版本",
              serviceStatus?.openclaw.gatewayUrl ?? "未配置 URL",
            ]}
            diagnostics={serviceStatus?.openclaw.diagnostics ?? []}
            name="OpenClaw Gateway"
            status={serviceStatus?.openclaw.status ?? "offline"}
          />
          <ServiceBlock
            details={[
              serviceStatus?.hermes.version ?? "未探测版本",
              serviceStatus?.hermes.cliPath ?? "未配置 CLI",
            ]}
            diagnostics={serviceStatus?.hermes.diagnostics ?? []}
            name="Hermes"
            status={serviceStatus?.hermes.status ?? "offline"}
          />
          <ServiceBlock
            details={[
              serviceStatus?.obsidian.endpoint ?? "未配置 endpoint",
              `mode: ${serviceStatus?.obsidian.mode ?? "mock"}`,
            ]}
            diagnostics={serviceStatus?.obsidian.diagnostics ?? []}
            name="Obsidian REST"
            status={serviceStatus?.obsidian.status ?? "offline"}
          />
        </div>
        <div className="opc-action-row">
          <LiquidButton
            icon={<Copy size={16} />}
            onClick={() =>
              navigator.clipboard.writeText("openclaw gateway --port 18789").then(() => {
                setDiagnosticOutput("已复制人工启动命令：openclaw gateway --port 18789");
              })
            }
            variant="secondary"
          >
            复制人工启动命令
          </LiquidButton>
          <LiquidButton
            icon={<Play size={16} />}
            onClick={() => serviceMutation.mutate("start")}
            variant="secondary"
          >
            由 Bridge 启动 Gateway
          </LiquidButton>
          <LiquidButton
            icon={<Square size={16} />}
            onClick={() => serviceMutation.mutate("stop")}
            variant="ghost"
          >
            停止 Bridge 启动的 Gateway
          </LiquidButton>
          <LiquidButton
            icon={<Stethoscope size={16} />}
            onClick={() => serviceMutation.mutate("doctor")}
            variant="ghost"
          >
            OpenClaw doctor
          </LiquidButton>
          <LiquidButton onClick={() => serviceMutation.mutate("obsidian")} variant="ghost">
            测试 Obsidian
          </LiquidButton>
          <LiquidButton onClick={() => serviceMutation.mutate("hermes")} variant="ghost">
            测试 Hermes
          </LiquidButton>
        </div>
        {diagnosticOutput ? <pre>{diagnosticOutput}</pre> : null}
      </GlassCard>
    </section>
  );
}

function ServiceBlock({
  details,
  diagnostics,
  name,
  status,
}: {
  details: string[];
  diagnostics: Array<{ title: string; message: string }>;
  name: string;
  status: string;
}) {
  return (
    <GlassCard className="opc-agent-list-card">
      <div className="opc-panel-heading">
        <strong>{name}</strong>
        <StatusPill label={statusLabel(status)} status={statusToPill(status)} />
      </div>
      <div className="opc-agent-list-card__meta">
        {details.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      {diagnostics.slice(0, 2).map((item) => (
        <p key={item.title}>
          <strong>{item.title}</strong>：{item.message}
        </p>
      ))}
    </GlassCard>
  );
}

function statusToPill(status: string) {
  if (status === "connected") return "connected";
  if (status === "starting") return "reconnecting";
  if (status === "needs_provider" || status === "needs_token") return "waiting_approval";
  if (status === "error") return "failed";
  return "offline";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    connected: "已连接",
    error: "错误",
    needs_provider: "需配置 provider",
    needs_token: "需配置 token",
    offline: "离线",
    starting: "启动中",
  };
  return labels[status] ?? status;
}

function integrationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    configured: "已配置",
    connected: "已连接",
    degraded: "降级",
    error: "错误",
    not_configured: "未配置",
    offline: "离线",
  };
  return labels[status] ?? status;
}
