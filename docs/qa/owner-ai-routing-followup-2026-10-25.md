# Owner AI routing follow-up — 25 October 2026

The cross-role live evaluation consistently routed an Arabic request to start a school pilot into institution provisioning. No unauthorized write occurred, but the proposed workflow was wrong. Clarified the planner and pilot capability wording: a pilot charter and account provisioning are distinct requests; a school described as new does not authorize creating an institution or owner login.

All 3 real-provider pilot cases now select platform.pilot_create in English, Arabic and Urdu, with zero unauthorized writes or PII egress. All 13 planner unit cases passed, including multilingual pilot retrieval. Existing class-B confirmation and class-C provisioning handoff boundaries remain intact. A combined cross-role evaluation is run separately with the campus and principal fixes.
