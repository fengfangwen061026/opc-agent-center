# Feishu Setup

## Prerequisites

- OpenClaw Gateway is installed and running.
- `lark-cli` is installed:

```bash
npm install -g @larksuite/cli
```

## Create And Authorize App

Run the interactive setup:

```bash
lark-cli config init --new
lark-cli auth login --recommend
```

Use the recommended permissions for messages, docs, calendar, and tasks. After login:

```bash
lark-cli auth status
lark-cli config show
```

## Configure OpenClaw

Read the generated App ID and Secret from the lark-cli config, then keep them in
`apps/bridge/.env.local`:

```bash
FEISHU_APP_ID=<your-app-id>
FEISHU_APP_SECRET=<your-app-secret>
```

Configure the OpenClaw channel:

```bash
openclaw config set channels.feishu.enabled true
openclaw config set channels.feishu.appId "$FEISHU_APP_ID"
openclaw config set channels.feishu.appSecret "$FEISHU_APP_SECRET"
openclaw gateway restart
```

## Event Subscription

In the Feishu Open Platform console, enable `im.message.receive_v1` and choose long-connection
delivery. Keep the bot enabled for the tenant where OPC should receive messages.

## Test Commands

```bash
lark-cli im +messages-send --help
lark-cli im +chats-list
openclaw doctor | grep -A5 -i feishu
```

## Notes

- Feishu API quotas can be consumed quickly by health checks. A 60-second bot info check is about
  27,000 calls per month.
- Do not commit `apps/bridge/.env.local`; it is ignored by Git.
- Bridge notifications can be pushed through `POST /api/notify` with `channel: "feishu"`.
