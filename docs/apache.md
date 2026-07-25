# Apache Reverse Proxy Configuration

This guide explains how to deploy PM2 Process Web UI behind an Apache reverse proxy.

## Basic Configuration

```apache
ProxyPass        /sistemas-info http://127.0.0.1:3005
ProxyPassReverse /sistemas-info http://127.0.0.1:3005
```

Then set `BASE_PATH=/sistemas-info` in the `.env` file.

## SSE (Server-Sent Events) Requirements

The application uses SSE for real-time updates. Apache buffers responses by default, which breaks SSE. To fix this, you need to disable buffering:

```apache
ProxyPass        /sistemas-info http://127.0.0.1:3005
ProxyPassReverse /sistemas-info http://127.0.0.1:3005

# Required for SSE to work correctly
ProxyIOBufferSize 0
SetEnv proxy-nokeepalive 1
```

Alternatively, you can also set these at the VirtualHost or Location level.

## Full Example

```apache
<VirtualHost *:443>
    ServerName example.com

    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem

    # Proxy headers for proper IP/protocol detection
    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-For %{REMOTE_ADDR}e

    # PM2 Process Web UI
    ProxyPass        /sistemas-info http://127.0.0.1:3005
    ProxyPassReverse /sistemas-info http://127.0.0.1:3005
    ProxyIOBufferSize 0
    SetEnv proxy-nokeepalive 1
</VirtualHost>
```

Make sure to also set `TRUST_PROXY=1` and `COOKIE_SECURE=always` in `.env` when running behind HTTPS.

## Why SSE instead of WebSockets?

- Works over standard HTTP (no protocol upgrade needed)
- Compatible with Apache without `mod_proxy_wstunnel`
- Automatic reconnection built into browsers
- Lower resource consumption
- Simpler implementation
- No special proxy configuration besides disabling buffering

## Troubleshooting

### Events not arriving in real-time (delayed/missing)
- Verify `ProxyIOBufferSize 0` is set
- Verify `SetEnv proxy-nokeepalive 1` is set
- Check that no other proxying layer is buffering (Cloudflare, nginx in front, etc.)

### Connection drops frequently
- Increase `ProxyTimeout` if needed
- Check Apache's `Timeout` directive
- Verify the server isn't rate-limiting SSE connections

### 401 Unauthorized on /api/events
- Ensure the session cookie is being passed through the proxy
- Check `TRUST_PROXY=1` in `.env`
- Verify cookie `Secure` settings match the protocol
