---
description: Save the current session as a named agent
---

Call the MCP tool `save_agent` with these arguments:

- `name`: the first word/token from $@ (the agent name, required)
- `description`: remaining text after the name from $@, if any (optional)
- `global`: true if the user passes `--global` anywhere in the invocation

Report the tool's response text verbatim to the user.
