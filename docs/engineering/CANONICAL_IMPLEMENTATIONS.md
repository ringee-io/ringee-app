# Canonical implementations

The existing owner of a responsibility. **Search here before creating anything.**
Adding a second implementation of one of these is a defect, not a refactor.

## Tenancy and identity

| Responsibility                        | Owner                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| Ownership context from a request user | `createOwnershipContext` — `packages/platform/src/auth/ownership.types.ts`   |
| Prisma filter for a workspace         | `buildOwnershipFilter` — same file                                           |
| Ownership fields on create            | `buildOwnershipData` — same file                                             |
| Member narrowing on list endpoints    | `resolveMemberFilter` — same file                                            |
| Analytics scoping                     | `createDashboardContext` — same file                                         |
| Current user in a controller          | `@CurrentUser()` — `platform/src/auth/clerk/current.user.ts`                 |
| Org-admin gate                        | `@OrgAdminOnly()` / `OrgAdminGuard` — `platform/src/auth/org-admin.guard.ts` |
| Staff gate                            | `@SuperAdminOnly()` — `apps/backend/src/api/guards/super-admin.guard.ts`     |
| Client-side role state                | `useOrgRole()` — `packages/frontend-shared/src/hooks/use-org-role.ts`        |

## Money

| Responsibility                         | Owner                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Any balance mutation                   | `CreditService` — `packages/services/src/services/credit.service.ts`       |
| Idempotent debit                       | `CreditRepository.consumeOnce`                                             |
| Idempotent grant                       | `CreditRepository.grantOnce`                                               |
| Idempotent purchase                    | `CreditRepository.topupOnce`                                               |
| Debit ref for an already-incurred cost | `incurredCostDebitRef` — `services/credit.service.ts`                      |
| Balance policy thresholds              | `services/credit-policy.ts` (call gate **and** alerts read these)          |
| Low-balance alerts                     | `CreditBalanceAlertService` — `services/credit-balance-alert.service.ts`   |
| Call price from provider cost          | `calculateCallCharge` — `services/call-cost.util.ts`                       |
| Margin env parsing                     | `readProfitMultiplier` — same file                                         |
| AI token pricing                       | `computeTokenCost` / `isModelPriced` — `platform/src/ai-agents/pricing.ts` |
| Stripe API access                      | `StripeService` — `platform/src/stripe/stripe.service.ts`                  |

## Telephony

| Responsibility                        | Owner                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Any provider command                  | `TelephonyService` — `platform/src/telephony/telephony.service.ts`                   |
| Telnyx API calls                      | `TelnyxService` — `platform/src/telephony/telnyx/` (only importer of the SDK)        |
| Telnyx webhook signature              | `TelnyxWebhookVerifier`                                                              |
| Provider failure → readable reason    | `describeTelnyxError` — `platform/src/telephony/telnyx/telnyx.error.ts`              |
| Carrier event → Ringee event          | `TelnyxEventNormalizer` — `platform/src/telephony/telnyx/telnyx.event.normalizer.ts` |
| Inbound event contract                | `TelephonyEvent` — `platform/src/telephony/interfaces/telephony.event.ts`            |
| Call lifecycle & `Call.status`        | `CallService.handleTelephonyEvent`                                                   |
| One call at a time                    | `ConcurrentCallGuardService` — `services/security/`                                  |
| Stale call cleanup                    | `StaleCallSweeperService` — same folder                                              |
| Killing a user's live calls           | `ActiveCallTerminationService` — same folder                                         |
| Telnyx state → Ringee state (browser) | `packages/dialer-core/src/engine/state-map.ts`                                       |
| WebRTC engine                         | `packages/dialer-core/src/engine/telnyx-engine.ts`                                   |
| Campaign dial loop                    | `DialerOrchestrationService`                                                         |
| Lead claiming                         | `CampaignLeadRepository.lockNextLead`                                                |
| Calling-window / DNC checks           | `ComplianceService`                                                                  |
| Caller-ID selection with rotation     | `CallerIdRotationService`                                                            |
| Caller-ID verification                | `CallerIdService`                                                                    |
| Calling rates (cached table)          | `TelephonyRateService`                                                               |
| Dialer campaign authorization         | `CampaignService.assertDialableCampaign` / `assertCampaignInWorkspace`               |
| Workspace encryption key (read)       | `EncryptionKeyService`                                                               |
| Mobile reads + their visibility check | `MobileReadService`                                                                  |
| Clerk user/org sync                   | `UserService.syncFromClerk`, `OrganizationService.syncFromClerk`                     |
| Push-token registration               | `UserDeviceService.registerPushToken`                                                |

## AI voice agents

| Responsibility                        | Owner                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Any voice-agent provider command      | `VoiceAgentProviderService` — `platform/src/voice-agents/`               |
| Organization-only module access       | `assertVoiceAgentAccess` — `services/voice-agents/voice-agent-access.ts` |
| Provider assistant ⇄ Ringee config    | `telnyx.voice-agent.mapper.ts` (+ spec)                                  |
| What an agent type _is_               | `services/voice-agents/blueprints/*` + `VoiceAgentBlueprintRegistry`     |
| Agent CRUD + assistant sync           | `VoiceAgentService` — `services/voice-agents/voice-agent.service.ts`     |
| Starting an agent call (all surfaces) | `VoiceAgentCallService.startCall`                                        |
| Conversation events → result          | `VoiceAgentResultService`                                                |
| AI usage settlement                   | `VoiceAgentBillingService` (BILL-020)                                    |
| Agent tool callbacks                  | `VoiceAgentToolService`                                                  |
| Human-support notification delivery   | `VoiceAgentHumanSupportService`                                          |
| Knowledge bases                       | `VoiceAgentKnowledgeService` + `TelnyxKnowledgeStore`                    |
| Browser test sessions                 | `VoiceAgentTestSessionService` (AGENT-005)                               |
| Agent company context (AGENT-007)     | `CompanyProfileService.resolveForAgent`                                  |
| Voice sample playback                 | `VoiceAgentService.previewVoice` → `renderVoicePreview`                  |
| Curated voice list                    | `curateVoices` — `platform/src/voice-agents/voices.catalog.ts`           |
| Model behind each user choice         | `resolveVoiceAgentModel` — `platform/src/voice-agents/models.catalog.ts` |
| BYO LLM key verification              | `LlmCredentialVerifier`                                                  |
| Bookable slots for an agent           | `CalendarService.getBookableSlots` (strict; AGENT-002)                   |
| Fetching a user-supplied web page     | `requirePublicUrl` — `services/voice-agents/public-url.ts`               |
| Create / edit surface (full screen)   | `AgentScreen` + `useAgentDraft` — `features/ai-voice-agents/`            |

## Phone numbers

| Responsibility                             | Owner                                                                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Browser-side normalize / validate / format | `packages/dialer-core/src/phone/normalize.ts` (libphonenumber)                                                                    |
| Finding numbers in page text               | `packages/dialer-core/src/phone/detect.ts`                                                                                        |
| Country calling code for a keypad          | `countryCallingCode` — `normalize.ts`                                                                                             |
| Server-side normalize + CRM matching       | `normalizePhoneE164`, `phoneSuffix`, `phoneMatchesSuffix` — `platform/src/crm/phone.ts` (libphonenumber, with a lenient fallback) |
| E.164 validation in agent schemas          | `E164_REGEX` — `packages/agent/src/schemas/common.ts`                                                                             |

Two normalizers exist because they run in different places; both are
libphonenumber-backed and agree. The server one additionally keeps a lenient
fallback for the unparseable values CRM records hold. **Do not add a third** —
pick the one matching your runtime.

## Background work

| Responsibility          | Owner                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| Starting durable work   | `OrchestratorService` — `platform/src/temporal/`                  |
| Workflow names & inputs | `platform/src/temporal/contracts.ts` (zero-import)                |
| Workflow definitions    | `apps/orchestrator/src/temporal/workflows.ts` (type-only imports) |
| Periodic jobs           | `apps/orchestrator/src/temporal/schedules.ts`                     |

## Data access

| Responsibility        | Owner                                                          |
| --------------------- | -------------------------------------------------------------- |
| All Prisma access     | repositories in `packages/database/src/database/repositories/` |
| Prisma client / types | `@ringee/database` (re-exports `@prisma/client`)               |
| Transactions          | `prisma.$transaction` inside a repository, not a service       |

## Frontend

| Responsibility                 | Owner                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| Client HTTP                    | `useApi()` → `ApiClient` — `frontend-shared/src/hooks/use.api.ts`, `lib/api.ts`         |
| Server-component HTTP          | `apiServer` — `frontend-shared/src/lib/api.server.ts`                                   |
| Device identity                | `getRingeeDeviceId` / `DEVICE_ID_HEADER` — `frontend-shared/src/realtime/device-id`     |
| UI primitives                  | `frontend-shared/src/components/ui`                                                     |
| Form controls                  | `frontend-shared/src/components/forms/form-*`                                           |
| Tables                         | `useDataTable` + `config/data-table.ts`                                                 |
| Admin page gate                | `RoleGuard` — `frontend-shared/src/components/role-guard.tsx`                           |
| Realtime user events           | `frontend-shared/src/realtime/user-events-client.ts`                                    |
| Campaign disposition write     | `useDisposeLead` — `apps/frontend/src/features/dialer/hooks/use-dispose-lead.ts`        |
| Campaign outcome buttons       | `DispositionGrid` — `apps/frontend/src/features/dialer/components/disposition-grid.tsx` |
| Validation 400 → `fields` map  | `validationExceptionFactory` — `apps/backend/src/api/validation-error.ts`               |
| `ApiError` → sentence / fields | `describeApiError`, `fieldErrorsFrom` — `features/ai-voice-agents/lib/api-error.ts`     |

## Security primitives

| Responsibility             | Owner                                                             |
| -------------------------- | ----------------------------------------------------------------- |
| Integration API keys       | `platform/src/custom-integrations/api-key.util.ts`                |
| Public API key guard       | `apps/backend/src/api/guards/custom-integration-api-key.guard.ts` |
| Outbound webhook signing   | `platform/src/custom-integrations/webhook-signing.util.ts`        |
| Event catalogue (in & out) | `platform/src/custom-integrations/event-spec.ts`                  |
| Publishable keys           | `platform/src/sdk/publishable-key.ts`                             |
| SDK session / OTP / origin | `platform/src/sdk/*`, `services/sdk/*`                            |
| Magic-link tokens          | `services/call-session/call-session-access-token.service.ts`      |
| Encryption at rest         | `CryptoService` — `platform/src/crypto/`                          |

## Provider registries

Adding a provider means registering it, not branching on a string:

- CRM — `platform/src/crm/registry.ts` + `providers/*`
- Enrichment — `platform/src/enrichment/registry.ts` + `providers/*`
- AI — `platform/src/ai-agents/ai-provider.registry.ts` + `providers/*`
- Storage — `platform/src/upload/upload.factory.ts`
- Email — `platform/src/email/email.interface.ts` + providers
- Telephony — `TelephonyService.getServiceProvider()`
