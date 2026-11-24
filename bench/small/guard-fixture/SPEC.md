# Admin guard

1. Every admin handler calls `requireRole(user, 'admin')` from `src/auth.js` before doing any work.
2. `requireRole(user, role)` throws an error with `status` 403 unless `user.roles` includes `role`.
3. Admin handlers are every function in `src/admin/` and every handler exported from `src/handlers/index.js`, whatever name it is exported under.
4. `src/health.js` is public. It takes no user and must stay open.
5. `src/legacy/` is a frozen v1 API. Do not change it.
