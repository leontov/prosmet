# Persistent production release

Deploy exact current `main` after fixing GitHub Runner orphan cleanup.

Acceptance requires the Node service on port 3200 to survive the deployment job cleanup, a second self-hosted job to verify that persistence, and a final GitHub-hosted external DNS/HTTPS plus desktop/mobile Chromium pass.
