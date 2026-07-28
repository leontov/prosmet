# Auth and tenancy

The Drizzle schema includes users, organizations and role-based memberships (`owner`, `admin`, `estimator`, `accountant`, `viewer`). Every project, thread, message, estimate, item, run and audit row includes `organization_id` for tenant scoping.

Better Auth is pinned as the selected provider, but registration/login/session screens and migration SQL are pending. Until that slice lands, the UI visibly labels the profile as local and must not be exposed as a multi-tenant public service.
