# Front desk / receptionist audit — 25 October 2026

Independent dev branch. Today callbacks now follow the school's calendar instead of the browser's end of day, including midnight and daylight saving boundaries. A browser in Los Angeles correctly shows a Dubai callback due later on the Dubai school day and excludes the next day.

Validation: 38 distinct cases passed: 17 callback/visitor/time checks, 7 postal checks, 6 complaints checks and 8 certificate checks. Actions include idempotent call/parcel/check-in saves, failed-save draft retention, callback attempts/completion/reassignment, sensitive notes, namesakes, check-out, corrections/history, parcel handover/dispatch/delivery, confidential complaints/resolution/reopening, certificate preview/approval/issue/download/reissue/revocation and foreign-role/campus denial. English desktop and Arabic mobile captures passed; certificate PDFs were generated and rendered by the existing tests. Nine desk/library AI database cases passed, and the earlier live-provider baseline passed all 8 receptionist cases. Source TypeScript and targeted lint passed.

Several old fixtures had setup statements swallowed by inline comments; these are restored. A stale certificate assertion now checks the queue's actual translated status rather than a removed duplicate heading. No authorization boundaries were loosened.

Evidence remains outside git in the /tmp/sko465-evidence and other test-configured front-desk evidence folders. No real communications were sent. This does not certify hardware scanners, printers or external delivery providers.
