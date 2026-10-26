# Ask Skoolee RAG implementation and QA

## Delivered

The knowledge library is available at `/ai/knowledge` and linked from Ask Skoolee. Managers can import or paste a document, edit its audience and expiry, save a draft, review and publish it, rebuild its index, and archive it. Source links open the exact published version. Editing withdraws the previous publication immediately. This library does not automatically ingest arbitrary application records or credentials.

The existing `assistant.app_knowledge` workflow tool now retrieves published evidence. Application capability questions retain the existing role-filtered catalogue fallback. Actions still execute through the existing authorized workflow tools; retrieved prose cannot grant permissions or execute database operations. RAG supplies evidence, not additional action coverage.

Ingestion uses overlapping chunks with exact character offsets. Semantic embeddings use `text-embedding-3-small` at 512 dimensions; keyword BM25 and semantic candidates are combined using reciprocal rank fusion. Retrieval enforces school, campus, role, publication and expiry filters before reading document contents. SQL tables also carry tenant RLS. Answers carry source/version citations and supporting quotes, with schema, exact-quote and numeric consistency validation. Invalid generated output and provider failure fall back to clearly labeled source excerpts. Missing evidence produces an explicit no-source response.

Source versions and access are checked again after generation and when historical chat receipts are read. Follow-up questions can retain the topic of the same actor's completed knowledge job; a new action is not automatically converted into a knowledge follow-up. Credentials are refused. App Owner generation records usage without consuming school AI credits.

## Configuration and limits

- Migration: `prisma/migrations/20261024120000_rag_knowledge/migration.sql`. Applied and recorded on the local application database; deploy this migration in other environments before release.
- Embeddings require the existing approved OpenAI configuration, `OPENAI_API_KEY`, and an unset, `auto`, or `openai` `AI_PROVIDER`. `RAG_EMBEDDINGS_ENABLED=false` disables semantic indexing and retrieval. Publish again to rebuild a keyword-only index when the provider recovers.
- Generation uses the existing application AI gateway and its configured provider. Disabling embeddings does not disable generation.
- TXT, Markdown and CSV extraction is local. PDF and image extraction requires the existing approved media provider and `SCHOOL_AI_MEDIA_EGRESS_APPROVED` configuration. Word files must first be exported as PDF. Imported text is always a draft for human review.
- Maximum 100 non-deleted documents per school, 80,000 characters per document, 60 chunks per document, six retrieved excerpts and two excerpts per document. Upload maximum 8 MB. Archived documents still count toward storage capacity; deletion is exposed through the management API.
- Vectors are stored in PostgreSQL arrays and ranked in the application within the bounded school corpus. This is not an unbounded vector database or a background indexing service. Larger deployments need a separate scalability evaluation and indexed vector storage.
- Identifier masking reduces known personal identifiers in provider inputs. It does not guarantee that every sensitive fact in arbitrary prose is detected. Publish only approved material.
- Quote validation is not a complete semantic entailment proof. Live model evaluation remains necessary, particularly for conflicting documents, multilingual paraphrases and prompt injection.

## QA results

The reproducible benchmark is `scripts/ai-workflows/rag-1000.ts`. It creates synthetic fixtures in the guarded isolated QA database and removes its fixtures afterward. It refuses to use an ordinary application database.

Final local run: **1,000 / 1,000 passed**, App Owner role, external calls disabled. Evidence: `test-results/rag-1000/2026-10-24T12-25-49-415Z/` contains cases, full responses and summary.

| Category | Queries | Result |
| --- | ---: | --- |
| Policy retrieval: 24 synthetic topics × 30 phrasings | 720 | Expected source and fact returned |
| Unsupported knowledge | 120 | No published source returned |
| Credential requests | 80 | Refused |
| Cross-school requests/injection attempts | 40 | No hidden source exposed |
| Other-role requests/injection attempts | 40 | No hidden source exposed |

The first local run passed 800/1,000: generic terms caused irrelevant excerpts on negative cases. Informative-term coverage and common-term filtering fixed those matches. A second run found one overly restrictive match; the corrected stopword handling passed the full benchmark. These are 1,000 distinct generated questions, not 1,000 independently authored business scenarios or a test of every owner mutation.

Additional validation:

- Workflow database suite: 198 passed.
- Workflow unit suite: 93 passed.
- Final focused RAG unit/database suite: 10 passed, including same-actor follow-up isolation, stale citation withdrawal, concurrent edits, expired documents, cross-campus/role/school filtering, forbidden publishing and invalid generated citations.
- Authorization suite: 110 passed, two skipped.
- UI adoption suite: eight passed.
- Capability inventory check passed, while reporting the existing 660 capabilities not yet connected and 29 handlers awaiting inventory. RAG does not implement those missing actions.
- Focused lint passed.
- Full TypeScript check passed with an 8 GB Node heap. The default 4 GB run exhausted memory; it did not report a code diagnostic before stopping.
- Browser QA: App Owner opened the library, saved a synthetic owner-only draft, received no source when querying unpublished content, and archived the draft. Publication stayed disabled until review. Screenshot: `test-results/owner-audit/rag-knowledge-library.png`.

## Pending live evaluation

Update, 24 October 2026: the user explicitly approved the synthetic OpenAI benchmark. It was started, then interrupted when the user reported that ordinary conversation itself failed. The partial run completed 116 queries: 116 passed the expected-source/fact checks, 99 used synthesized responses and 17 used extractive fallback. This is not a completed 1,000-query live acceptance run. Evidence is in `test-results/rag-1000/2026-10-24T18-17-54-521Z/partial-summary.json`. Its two disposable QA schools were removed from the isolated database. Work shifted to the reproduced conversational failure described below.

The local 1,000-query run used actual retrieval/access/answer service code with embeddings disabled and extractive responses. It did **not** validate 1,000 live model generations, live semantic recall, or end-to-end execution of all owner actions.

Automatic approval review rejected the live run because the specific external synthetic document/query payload and OpenAI destination required explicit confirmation. Approval was requested; no live run was made or bypass attempted. Once approved, run the same benchmark with `RAG_LIVE_QA=true`, the isolated QA database/Redis, and the configured OpenAI account. Inspect each failed response and rerun after fixes before claiming live-model acceptance.

The preceding paragraph records the original approval block; the later explicit approval and partial run supersede its pending-approval status.

## Actual chat failure and repair

The user's Chrome conversation displayed `I want to talk with you` followed by `AI can't do this yet`. Browser QA also reproduced a simple greeting being converted to a generic action questionnaire. The planner rejected prose answers, its prompt discouraged general conversation, and the legacy `assistant.answer` execution gate was deliberately disabled. RAG retrieval did not address any of these failures.

The repair adds a separate `chat` planner outcome and a bounded conversational responder with current role guidance. A server-owned `assistant.conversation` receipt displays the reply without pretending it is a verified record lookup. This internal capability is not offered as a model-callable action. The disabled legacy answer capability stays disabled. Real actions retain their schema, evidence, permissions, confirmation and execution checks.

Recent conversational context is scoped to the same actor, school and role. Up to four preceding conversation turns feed the model; up to ten are restored in the UI after reload. Arbitrary action receipts and credentials are not copied into conversational history. Safe model clarification questions are now retained instead of replacing every question with the same generic request; questions requesting secrets use the safe fallback. Provider failures use the existing retry path.

The composer remains available while an operation awaits confirmation or handoff. Rate limiting now returns a separate HTTP 429 error rather than an AI-budget error; the per-five-minute limits are 60 messages for App Owner and 30 for other roles, with existing provider/credit controls retained.

Browser QA also found that replies below restored history were not automatically brought into view. Current conversational replies now scroll into view on completion/reopen. Bold emphasis is rendered safely as React text nodes. The final owner-specific discussion is captured in `test-results/owner-audit/conversation-repaired.png`.

Browser checks confirmed a natural response to the exact failed message, a school-routine brainstorming response, and transition to school preparation. School name, city, owner name and email were retained, and the email answer correctly advanced to the school-type question. The final state was an explicit review handoff, **not a created school**. The disposable preparation was stopped after verification. This repair does not convert all remaining handoff actions into autonomous chat execution.

Final focused database regression: 24 passed. Workflow unit regression: 95 passed. UI adoption: eight passed. Full TypeScript, focused lint and capability checks passed. Browser follow-up after reopening the conversation retained the school-routine topic. The live benchmark is incomplete and should not be described as fully passed.
