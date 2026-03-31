# rss-groupchat-client

Example group chat client app with the RSS GroupChat Extension https://rss.ag/rss-groupchat-extension/

This Node.js app reads RSS feeds with group chat messages, sends messages via MetaWebLog API, and subscribes to rssCloud for real-time notifications when new messages arrive.

# Files

- `reallysimple-groupchat.diff` -- diff showing changes to support `groupchat:group` elements
- `reallysimple.js` -- modified reallysimple library with groupchat support
- `index.ts` -- the main app

# How-to

## Setup

```
npm install
```

## Configuration

Edit `index.ts` and set these values:

- `urlFeed` -- your RSS feed URL (copy from Social Web app: profile > "Copy feed link")
- `callbackDomain` -- the public domain where this app is reachable (e.g. `groupchat.socialweb.cloud`)
- `callbackPath` -- the path for rssCloud callbacks (default: `/notify`)

## Development mode (one-shot read + send)

```
npm run dev
```

## Production mode (persistent server with rssCloud)

Build and run:

```
npm run build
npm start
```

Or set the `PORT` environment variable (default: 4008):

```
PORT=4008 npm start
```

## What happens on startup

1. The HTTP server starts listening on the configured port
2. The feed is read and group chat summaries are printed
3. If the feed has a `<cloud>` element, the app subscribes to the rssCloud hub
4. The hub verifies the subscription by sending a challenge to `GET /notify?challenge=...`
5. The app responds with the challenge token to complete verification
6. Whenever the feed changes, the hub POSTs to `/notify` with the updated feed URL
7. The app re-reads the feed and prints the new messages
8. Re-subscription happens automatically every 24 hours

## Sending a message

Uncomment the `sendMessage()` call at the bottom of `index.ts` and set the message text and group ID:

```typescript
sendMessage("Hello from the RSS Group Chat Client!", "vlznfdfg");
```

## Deployment with systemd and Caddy

Example systemd service (`/etc/systemd/system/rss-groupchat-client.service`):

```ini
[Unit]
Description=RSS Group Chat Client Node.js App
After=network.target

[Service]
Type=simple
User=caddyuser
Group=caddyuser
WorkingDirectory=/var/www/rss-groupchat-client
Environment=NODE_ENV=production
Environment=PORT=4008
ExecStart=/usr/bin/node /var/www/rss-groupchat-client/dist/index.js
Restart=always
RestartSec=5
StandardOutput=append:/var/log/rss-groupchat-client.log
StandardError=append:/var/log/rss-groupchat-client-error.log

[Install]
WantedBy=multi-user.target
```

Example Caddyfile entry:

```
groupchat.socialweb.cloud {
    reverse_proxy localhost:4008
}
```

## rssCloud protocol flow

```
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│ This App │         │  rssCloud    │         │  Feed Host   │
│ (client) │         │  Hub         │         │  Server      │
└────┬─────┘         └──────┬───────┘         └──────┬───────┘
     │                      │                        │
     │  POST /pleaseNotify  │                        │
     │  (subscribe request) │                        │
     │─────────────────────>│                        │
     │                      │                        │
     │  GET /notify?        │                        │
     │  challenge=abc123    │                        │
     │<─────────────────────│                        │
     │                      │                        │
     │  "abc123"            │                        │
     │─────────────────────>│                        │
     │                      │                        │
     │  <notifyResult       │                        │
     │   success="true"/>   │                        │
     │<─────────────────────│                        │
     │                      │                        │
     │         ... time passes, someone sends a message ...
     │                      │                        │
     │                      │   POST /ping           │
     │                      │   (feed changed)       │
     │                      │<───────────────────────│
     │                      │                        │
     │  POST /notify        │                        │
     │  url=<feedUrl>       │                        │
     │<─────────────────────│                        │
     │                      │                        │
     │  Re-read feed        │                        │
     │──────────────────────────────────────────────>│
     │                      │                        │
     │  New messages!       │                        │
     │<──────────────────────────────────────────────│
     │                      │                        │
```
