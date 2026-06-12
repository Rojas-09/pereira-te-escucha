# Plans Index — Pereira Te Escucha

Generated from `docs/PENDIENTES.md` and `docs/AUDIT.md` using shadcn/improve methodology.

Commit stamp: `git rev-parse --short HEAD` (run before executing any plan)

## Execution Order & Dependencies

| # | Plan | Phase | Depends On | Status |
|---|------|-------|------------|--------|
| 001 | CORS Production Hardening | 1 — Hardening Crítico | — | ☐ Pendiente |
| 002 | Remove Hardcoded API Fallback (App.tsx) | 1 — Hardening Crítico | — | ☐ Pendiente |
| 003 | HTTPS/SSL + Backend Deploy | 1 — Hardening Crítico | 001, 002 | ☐ Pendiente |
| 004 | Unify buildTrackingCode + UUID v4 | 2 — Arquitectura | — | ☐ Pendiente |
| 005 | Split server.js into Modules | 2 — Arquitectura | 003, 004 | ☐ Pendiente |
| 006 | Refactor App.tsx into Hooks/Components | 2 — Arquitectura | 005 | ☐ Pendiente |
| 007 | Worker Retry with Exponential Backoff | 2 — Arquitectura | 005 | ☐ Pendiente |
| 008 | Integration Tests for submit-anonymous | 3 — Testing | 005 | ☐ Pendiente |
| 009 | Expand validation.test.js Coverage | 3 — Testing | — | ☐ Pendiente |
| 010 | Make aceptarTratamiento Required in Zod | 3 — Testing | — | ☐ Pendiente |
| 011 | File Content Validation (Magic Numbers) | 4 — Seguridad | 005 | ☐ Pendiente |
| 012 | SHA-256 Attachment Hashing | 4 — Seguridad | 005 | ☐ Pendiente |
| 013 | Play Store: Account + Production Build | 5 — Publicación | 003 | ☐ Pendiente |
| 014 | Play Store: Privacy Policy + Assets | 5 — Publicación | — | ☐ Pendiente |
| 015 | Sentry + Crash Reporting | 5 — Publicación | — | ☐ Pendiente |
| 016 | Improve sanitizeText (Whitelist/DOMpurify) | 4 — Seguridad | 005 | ☐ Pendiente |
| 017 | Terms of Service Document + Publication | 5 — Publicación | 014 | ☐ Pendiente |

## Orden recomendado

```
Fase 1 (seguridad crítica)  → 001 → 002 → 003
Fase 2 (arquitectura)       → 004 → 005 → 006 → 007
Fase 3 (testing)            → 009 → 010 → 008
Fase 4 (seguridad archivos) → 016 → 011 → 012
Fase 5 (publicación)        → 014 → 017 → 013 → 015
```

## Notes
- Every plan is self-contained with exact file paths, code excerpts, and verification commands
- If reality doesn't match the plan, STOP and report — do not improvise
- Run `npm test` after each plan to verify no regressions
- Each plan must be executed independently by a separate agent session