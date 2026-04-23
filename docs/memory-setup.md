# Memory Setup

OPC Agent Center 的 Memory 层默认以 mock-first 运行。真实语义召回需要本机 Ollama 和 `nomic-embed-text` embedding 模型。

## 1. 安装 Ollama

安装入口：https://ollama.ai

安装后确认服务可用：

```bash
ollama --version
curl http://localhost:11434/api/tags
```

## 2. 拉取 embedding 模型

```bash
ollama pull nomic-embed-text
```

当前 Bridge 默认读取：

```bash
OLLAMA_URL=http://localhost:11434
EMBEDDING_MODEL=nomic-embed-text
```

## 3. LanceDB embedded 模式

Bridge 会在 adapter 层初始化本地 Memory 存储，默认目录：

```bash
~/.openclaw/memory/lancedb
```

这个目录已由 `.gitignore` 覆盖，不应提交到 Git。

## 4. OpenClaw plugin 配置片段

```json
{
  "plugins": {
    "slots": {
      "memory": "lancedb-memory"
    },
    "entries": {
      "active-memory": {
        "enabled": true,
        "config": {
          "contextMode": "message",
          "maxRecallResults": 8,
          "verbose": false
        }
      },
      "lancedb-memory": {
        "enabled": true,
        "config": {
          "dbPath": "~/.openclaw/memory/lancedb",
          "ollamaUrl": "http://localhost:11434",
          "embeddingModel": "nomic-embed-text",
          "autoCapture": true,
          "autoRecall": true
        }
      }
    }
  }
}
```

## 5. 降级行为

如果 Ollama 不可用或 `nomic-embed-text` 未安装，Bridge 自动使用 MockLanceDBAdapter。Memory CRUD、筛选、标签、Evolver 日志仍然可用；语义召回降级为关键词匹配，UI 会显示 fallback 提示。
