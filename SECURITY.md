# Security Policy

## Reporting A Vulnerability

If you discover a security issue in SciDaVinci, please do not open a public issue with exploit details. Use GitHub private security advisories for the repository, or contact the maintainer through a private channel.

Please include:

- a short description of the vulnerability;
- steps to reproduce;
- potential impact;
- suggested fix or mitigation, if known.

## Sensitive Data

Never commit:

- model provider API keys;
- bot tokens or WebSocket secrets;
- local `~/.scidavinci/config.json` contents;
- chat/session history;
- generated media containing private data;
- raw unpublished research datasets.

Recommended local practices:

```bash
chmod 600 ~/.scidavinci/config.json
```

Use placeholders such as `YOUR_API_KEY` or environment variables in documentation and examples.

## Runtime Safety Notes

SciDaVinci inherits a tool-using agent runtime. Before using it with private data or production credentials:

- review enabled tools and channels;
- restrict channel access with allow lists;
- run the agent in a dedicated workspace;
- avoid running as root;
- prefer sandboxed execution for shell tools when available;
- review logs before sharing them.

## License

See [`LICENSE`](./LICENSE).
