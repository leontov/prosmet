# Super-admin bootstrap

1. Open the deployed application once, then read the current owner identifier:

```bash
curl -c /tmp/prosmet.cookies https://kolibriai.online/api/identity
```

For the browser session, use DevTools Network on `/api/identity` or display the identifier in the profile settings.

2. On Primary, load the database environment and grant the role to that owner:

```bash
source "$HOME/.prosmet/database.env"
cd /path/to/prosmet
npm run admin:bootstrap -- \
  --owner 'guest:REPLACE_WITH_OWNER_ID' \
  --email 'owner@example.com'
```

3. Refresh the application. `/api/identity` must now return `"super_admin"` in `roles`. Provider connections and tenant UI manifests can then be changed from that same browser identity.

The command is idempotent and writes an auditable PostgreSQL membership. It does not create a reusable plaintext password or API key.
