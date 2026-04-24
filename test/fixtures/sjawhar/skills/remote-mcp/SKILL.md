---
name: remote-mcp
description: Remote MCP over HTTP.
mcp:
  upstream:
    type: remote
    url: https://mcp.example.com/mcp
    headers:
      Authorization: "Bearer ${UPSTREAM_TOKEN}"
---

Body for remote-mcp.
