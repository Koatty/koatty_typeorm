## Unreleased — Phase A–F review (2026-09-30)

## 4.0.0

### Patch Changes

- f0e9278: Close the second Phase A–F review: strict security config validation and environment resolution, explicit metrics trust, default WS Origin checks, hard-link-safe CLI writes and delimited tool arguments, DTO transformation and conservative schema diagnostics, privacy-safe telemetry, HTTP3 peer ownership and draining reference SSE service. MCP/LLM/Guard first-release major entries are in phase-f-audit-hardening. See docs/migration/phase-a-f-review-fixes.md. Do not treat local tests as release/client/provider acceptance.
- Updated dependencies [f0e9278]
- Updated dependencies [f0e9278]
- Updated dependencies [f0e9278]
- Updated dependencies [f0e9278]
  - koatty_core@2.7.0
  - koatty_container@4.1.0
  - koatty_lib@1.6.1
  - koatty_logger@3.1.2

Resolve logging defaults using KOATTY_ENV precedence and the shared security profile resolver at invocation time.

Migration: `docs/migration/phase-a-f-review-fixes.md` in the monorepo. No release has been applied.

# Changelog

## 3.0.0

### Patch Changes

- Updated dependencies
  - koatty_core@2.4.0
  - koatty_logger@3.1.0
  - koatty_container@4.0.0

## 2.0.0

### Minor Changes

- Phase B security hardening (koatty-hardening-and-ai-evolution-plan.md, ADR-101/102/103). Fail-closed defaults with a `security.legacyDefaults: true` rollback switch; see docs/migration/4.3.0.md for the full migration guide.

  Highlights:

  - SecurityProfile (strict/standard/development) exposed read-only as `app.security`, with a startup summary and per-item WARN when rolling back
  - body parsing failures return 400/413/415 instead of silently producing `{}`; body size limit follows the security profile (1mb in production)
  - DTO validation whitelist on by default (strict profile rejects unknown fields); `__proto__`/`constructor` keys never reach DTO instances
  - AOP aspect failures abort the business method unless opted out via `{ onError: 'log' }` or `app.security.aop.onAspectError`
  - After/AfterEach aspects receive the business result via `options.result`
  - GraphQL: profile-driven playground/introspection/depth limits, built-in depth rule, optional complexity package fails startup when configured but missing, CDN-free GraphiQL
  - uploads: profile-driven maxFiles/maxFields/maxFieldsSize, keepExtensions defaults off, array-aware temp cleanup, new `safeFilename` export
  - ops endpoints: minimal liveness body, /ready 503 while draining, /metrics behind the exposeMetrics policy (loopback/RFC1918/allowCidrs/token), Prometheus bound to 127.0.0.1, rateLimit middleware wired (default off)
  - request IDs validated (`[A-Za-z0-9._:-]{1,128}`), query fallback disabled, structured access logs, topology service header opt-in
  - WebSocket: profile maxPayload, perMessageDeflate off, Origin check, connection limits, error-message redaction, slow-consumer guard, timer cleanup on destroy
  - TLS minVersion TLSv1.2 by default; TypeORM production logs errors only with sensitive-parameter redaction; Swagger disabled in production by default
  - defect fixes: escapeHtml (&-escaping, valid entities), ReDoS-safe isNumberString, plugin run() executes once, bootstrap failures propagate, Redis default port 6379, gRPC ListServices, koatty_cli bin (CJS build), RedLocker.resetInstance, config() write loss, CLI sandbox + `apply` dry-run by default

### Patch Changes

- Updated dependencies
  - koatty_core@2.3.0
  - koatty_container@3.0.0
  - koatty_lib@1.6.0
  - koatty_logger@3.0.0

## 1.5.0

### Minor Changes

- build
- build

### Patch Changes

- Updated dependencies
- Updated dependencies
  - koatty_core@2.2.0
  - koatty_container@3.0.0
  - koatty_lib@1.5.0
  - koatty_logger@3.0.0

## 1.4.9

### Patch Changes

- build
- Phase 1: Critical bug fixes

  - **koatty-container**: Replace global.**KOATTY_IOC** with Symbol.for to prevent global namespace pollution (TASK-1-7)
  - **koatty-logger**: Fix incorrect log level mapping - warning should map to warn, not error (TASK-1-5)
  - **koatty-typeorm**: Remove hardcoded database credentials security vulnerability (TASK-1-3)
  - **koatty-typeorm**: Fix incorrect TypeORM event name 'Stop' -> 'beforeServerStop' (TASK-1-4)

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - koatty_container@2.0.9
  - koatty_core@2.1.10
  - koatty_lib@1.4.9
  - koatty_logger@2.8.5

## 1.4.8

### Patch Changes

- Updated dependencies
  - koatty_container@2.0.8
  - koatty_core@2.1.9

## 1.4.7

### Patch Changes

- Updated dependencies
  - koatty_container@2.0.7
  - koatty_core@2.1.8

## 1.4.6

### Patch Changes

- Updated dependencies
  - koatty_container@2.0.6
  - koatty_core@2.1.6

## 1.4.5

### Patch Changes

- build
- Updated dependencies
  - koatty_container@2.0.5
  - koatty_lib@1.4.7
  - koatty_logger@2.8.3
  - koatty_core@2.1.5

## 1.4.4

### Patch Changes

- Updated dependencies
  - koatty_logger@2.8.2
  - koatty_container@2.0.4
  - koatty_core@2.1.4

## 1.4.3

### Patch Changes

- Updated dependencies
- Updated dependencies
  - koatty_container@2.0.3
  - koatty_core@2.1.3

## 1.4.2

### Patch Changes

- patch version bump for koatty, koatty_cacheable, koatty_config, koatty_container, koatty_core, koatty_exception, koatty_graphql, koatty_lib, koatty_loader, koatty_logger, koatty_proto, koatty_router, koatty_schedule, koatty_serve, koatty_store, koatty_trace, koatty_typeorm, koatty_validation
- Updated dependencies
  - koatty_container@2.0.2
  - koatty_core@2.1.2
  - koatty_lib@1.4.6
  - koatty_logger@2.4.2

## 1.4.1

### Patch Changes

- Updated dependencies
  - koatty_container@2.0.1
  - koatty_logger@2.4.1
  - koatty_core@2.1.1

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.4.0](https://github.com/koatty/koatty_typeorm/compare/v1.3.2...v1.4.0) (2025-06-11)

### Features

- add transaction decorator and examples ([b1f9931](https://github.com/koatty/koatty_typeorm/commit/b1f99316270f730486e5e48ed0e61a6076716565))
- enhance transaction manager with nested transactions, stats tracking, and timeout handling ([5d40c89](https://github.com/koatty/koatty_typeorm/commit/5d40c89dc8a5b3cd1db64cb7427ee4cc9007ddf3))

### [1.3.2](https://github.com/koatty/koatty_typeorm/compare/v1.3.1...v1.3.2) (2024-04-14)

### Bug Fixes

- timezone ([5791377](https://github.com/koatty/koatty_typeorm/commit/5791377fd9bcb474a2390dd231af9d50b0308049))

### [1.3.1](https://github.com/koatty/koatty_typeorm/compare/v1.3.0...v1.3.1) (2023-07-30)

### Bug Fixes

- rename ([56ef5d8](https://github.com/koatty/koatty_typeorm/commit/56ef5d83f9af83d1802c37188f50fd78f14385e2))

## [1.3.0](https://github.com/koatty/koatty_typeorm/compare/v1.2.2...v1.3.0) (2023-07-30)

### [1.2.2](https://github.com/koatty/koatty_typeorm/compare/v1.2.1...v1.2.2) (2023-07-29)

### [1.2.1](https://github.com/koatty/koatty_typeorm/compare/v1.2.0...v1.2.1) (2023-02-18)

## [1.2.0](https://github.com/koatty/koatty_typeorm/compare/v1.1.10...v1.2.0) (2023-01-13)

### [1.1.10](https://github.com/koatty/koatty_typeorm/compare/v1.1.8...v1.1.10) (2022-11-03)

### [1.1.8](https://github.com/koatty/koatty_typeorm/compare/v1.1.7...v1.1.8) (2022-05-27)

### [1.1.7](https://github.com/koatty/koatty_typeorm/compare/v1.1.6...v1.1.7) (2022-02-24)

### [1.1.6](https://github.com/koatty/koatty_typeorm/compare/v1.1.4...v1.1.6) (2021-12-01)

### [1.1.4](https://github.com/koatty/koatty_typeorm/compare/v1.1.2...v1.1.4) (2021-11-23)

### [1.1.2](https://github.com/koatty/koatty_typeorm/compare/v1.0.6...v1.1.2) (2021-11-20)

### 1.0.6 (2021-11-20)
