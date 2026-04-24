---
name: slack-bot-like
description: Claude-style MCP with command + args + env.
mcp:
  slack:
    command: secrets
    args: ["SLACK_MCP_XOXP_TOKEN", "--", "slack-mcp-server"]
    env:
      SLACK_MCP_ADD_MESSAGE_TOOL: "true"
      SOPS_AGE_KEY: "${SOPS_AGE_KEY}"
---

Body for slack-bot-like.
