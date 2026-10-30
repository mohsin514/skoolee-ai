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
