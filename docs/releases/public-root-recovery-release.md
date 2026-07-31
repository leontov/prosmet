# Public root recovery release

Deploy exact main SHA `b68d377dd483dc9614fb3f90b38b85ce47aedd60`.

Acceptance requires:

- `https://kolibriai.online/` returns HTTP 200 and the Vite root marker;
- `https://kolibriai.online/api/health` returns the exact main SHA;
- the application and Caddy survive runner cleanup;
- every resolved IPv4 serves both root and health;
- desktop and mobile Chromium pass against the live HTTPS origin.
