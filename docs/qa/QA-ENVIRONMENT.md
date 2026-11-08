# Local QA environment: ports and base URLs (SKAI-1268)

The local regression harness reads every port and origin from environment variables. The defaults are the
historical values, so an existing setup keeps working; set the variables to run on free ports beside other
sessions.

| Variable | Default | Used by |
| --- | --- | --- |
| `QA_DB_PORT` | `55438` | Isolated PostgreSQL cluster. `scripts/qa/isolated-env.sh` uses it when no port is given, and the database guards of the browser and database suites accept only `127.0.0.1:$QA_DB_PORT/postgres`. |
| `QA_APP_URL` | `http://localhost:$QA_APP_PORT` | Origin of the app under test, for suites that use `qaAppUrl()` in `tests/support/qa-env.ts`. A suite's own `*_TEST_APP` variable (for example `CHAT_TEST_APP`) still wins. |
| `QA_APP_PORT` | `3107` | Port part of the default `QA_APP_URL`. |
| `QA_FAKE_S3_PORT` | `55441` | Fake S3 store started by `tests/chat/reliability.browser.test.ts`. Run the app with `S3_ENDPOINT=http://127.0.0.1:$QA_FAKE_S3_PORT`. |
| `QA_DB_NAME`, `QA_DB_USER` | each suite's own (`sko201`, `sko223`, `postgres`, …) | Suites with their own dedicated fixture database (SKAI-1792): `tests/locale/*`, `tests/jobs/*`, `tests/corrections`, `tests/academic/api.test.ts`, `tests/assignments`, `tests/states`, `tests/report-versions`. They now read `QA_DB_PORT` with their historical port as the default, plus these two. Unset, every guard is the same as before. |
| `QA_INTEGRATION_RECEIVER_PORT`, `QA_INTEGRATION_BLOCKED_PORT` | `55463`, `55464` | `tests/integrations` receiver and the refused plain-HTTP webhook port; start the app with `INTEGRATION_TEST_ALLOWED_HOSTS=127.0.0.1:$QA_INTEGRATION_RECEIVER_PORT`. |
| `SCHOOL_AI_TEST_ORIGIN`, `ONBOARDING_TEST_ORIGIN`, `LOCALE_TEST_APP`, `CORRECTIONS_TEST_APP`, `JOBS_TEST_APP`, `OUTBOX_TEST_APP`, `STANDALONE_TEST_APP` | `http://localhost:3106`, `:3110`, `:3201`, `127.0.0.1:3213`, `:3223`, `127.0.0.1:3220`, `:3107` | App origin for the school-AI specs, onboarding specs and configs, locale checks, corrections, jobs, outbox and standalone suites. The jobs guards also accept `QA_APP_PORT`. |

## Port ranges

- PostgreSQL clusters: `554xx`, except the fake-provider ports below.
- Fake providers (in-process, bound by the suite): `55441` (chat S3, `QA_FAKE_S3_PORT`), `55442` (assignments S3), `55465` (identity IdP).
  `isolated-env.sh` refuses these ports, so a database can no longer take a fake provider's port.
- App servers: `3xxx`. Pick a free one per session and pass it with `QA_APP_URL` (or the suite's `*_TEST_APP`).

## Failing early

- `isolated-env.sh up` stops with exit code 3 and names the process (`lsof`) when the port is already held by something other than that cluster.
- Suites that bind a fake provider call `assertPortFree()` first and fail before any test runs with the port, its purpose, the current owner and the variable to change.

## Example: a second harness beside the default one

```bash
export QA_DB_PORT=55436 QA_APP_URL=http://localhost:3197 QA_FAKE_S3_PORT=55447
scripts/qa/isolated-env.sh up "$QA_DB_PORT" postgres --schema
# start the app on 3197 with DATABASE_URL/DIRECT_URL from the line above and S3_ENDPOINT=http://127.0.0.1:55447
DATABASE_URL=postgresql://$USER@127.0.0.1:55436/postgres node --import tsx --test tests/chat/reliability.browser.test.ts
```

Suites with their own `*_TEST_APP` default (3106/3107/3108 and others) still need that variable set when the app is
not on the default port; moving them to `qaAppUrl()` is follow-up work.

## Lane notes (SKAI-1797)

- School-AI browser specs sign their own session tokens with `QA_AUTH_SECRET` (default: the fixed CI test secret). Against a lane app, set `QA_AUTH_SECRET="$AUTH_SECRET"` after `eval "$(qa.sh env f)"`, and point `SCHOOL_AI_TEST_ORIGIN` at that app.
- `tests/assignments/assignments.browser.test.ts` uploads to its own fake S3 on `127.0.0.1:55442`. Lane apps start without S3, so upload and feedback time out there. Start the app with `S3_ENDPOINT=http://127.0.0.1:55442 S3_BUCKET_NAME=synthetic-only S3_REGION=us-east-1 S3_ACCESS_KEY_ID=synthetic S3_SECRET_ACCESS_KEY=synthetic`, and the suite passes 6/6.
