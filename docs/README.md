# cui: Common Agent UI (Archived)

> **This fork is archived.** Anthropic now offers official alternatives that cover all of cui's use cases. See below for migration guidance.

## What was cui?

A modern web UI for Claude Code agents, powered by [Claude Code SDK](https://claude.ai/code). It provided browser-based access to agent sessions, parallel background tasks, push notifications, and multi-model support.

The upstream project lives at [BMPixel/cui](https://github.com/BMPixel/cui).

## Why archived?

Anthropic has released official products that supersede cui's functionality:

| Need | Official Solution |
|------|-------------------|
| Browser-based coding without local setup | [Claude Code Web](https://claude.ai/code) -- cloud VM execution, async tasks, built-in diff view, parallel sessions |
| Access a local Claude Code session from phone/browser | [Remote Control](https://code.claude.com/docs/en/remote-control) -- `claude remote-control` or `/rc`, encrypted bridge, local execution |
| Long-running desktop tasks with mobile dispatch | [Cowork Dispatch](https://www.anthropic.com/products/claude-code) -- Claude Desktop persistent agent, phone-to-desktop task dispatch |

## Migration

- **Claude Code Web**: Go to [claude.ai/code](https://claude.ai/code), connect GitHub, submit tasks. Use `claude --remote` from terminal to start cloud sessions.
- **Remote Control**: Run `claude remote-control` in your project directory, scan the QR code with the Claude mobile app or open the session URL in a browser.
- **Cowork Dispatch**: Use Claude Desktop app, pair with your phone via QR code, dispatch tasks remotely.

## License

[MIT](LICENSE)
