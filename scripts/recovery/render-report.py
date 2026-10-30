#!/usr/bin/env python3
"""Render a sanitized synthetic recovery report. Never reads logs, dumps or record contents."""
import argparse
import html
import json
from pathlib import Path
import re
from preflight import application_configuration


def render(report, reconciliation=None, manifest=None):
    if report.get('dataClass') != 'synthetic':
        raise ValueError('Only explicitly synthetic recovery evidence can be rendered')
    escape = lambda value: html.escape(str(value))
    source = report.get('source', {})
    status = report.get('status') == 'verified-awaiting-sign-off'
    title = 'Synthetic recovery verified' if status else 'Recovery verification blocked'
    color = '#087f6f' if status else '#b33b37'
    safe_hash = lambda value, size: value if isinstance(value, str) and re.fullmatch(r'[0-9a-f]{' + str(size) + '}', value) else 'Not recorded'
    checks = ''.join(f'<li><span class="result {"pass" if item.get("passed") is True else "fail"}">{"PASS" if item.get("passed") is True else "FAIL"}</span><span>{escape(item.get("name", "Unnamed check"))}</span></li>' for item in report.get('checks', [])[:100])
    counts = reconciliation if isinstance(reconciliation, dict) else {}
    selected = ('schools', 'campuses', 'students', 'marks', 'invoices', 'student_documents', 'workflow_events', 'workflow_jobs', 'workflow_effects')
    count_rows = ''.join(f'<tr><td>{escape(name)}</td><td>{escape(counts.get(name, {}).get("rows", "Not reconciled"))}</td></tr>' for name in selected)
    inputs = manifest if isinstance(manifest, dict) else {}
    migrations = sorted(key.split('/')[2] for key in inputs if re.fullmatch(r'prisma/migrations/[0-9]{14}_[a-z0-9_]+/migration\.sql', key))
    migration_range = f'{len(migrations)} migrations · {migrations[0]} → {migrations[-1]}' if migrations else 'Migration manifest unavailable'
    destination = report.get('destination', {})
    target = f'Disposable loopback PostgreSQL · port {destination.get("port")}' if destination.get('host') == '127.0.0.1' and isinstance(destination.get('port'), int) else 'Unverified destination'
    duration = lambda key: f'{report[key]:.3f} s' if isinstance(report.get(key), (int, float)) else 'Not verified'
    dirty = source.get('worktreeDirty') is not False
    readiness = report.get('environmentPreflight', {}).get('application', {})
    template = application_configuration({})
    states = {'missing', 'invalid', 'incomplete', 'disabled', 'configured-unverified', 'policy-review-required'}
    readiness_rows = []
    for group in ('fields', 'integrations'):
        observed = {item.get('name'): item.get('state') for item in readiness.get(group, []) if isinstance(item, dict)}
        for item in template[group]:
            state = observed.get(item['name'])
            state = state if state in states else 'not recorded'
            variables = item['name'] if group == 'fields' else ', '.join(item['variables'])
            readiness_rows.append(f'<tr><td>{escape(item.get("purpose", item["name"]))}<br><code>{escape(variables)}</code></td><td>{escape(state)}</td></tr>')
    readiness_section = '<section class="panel"><h2>Environment preflight</h2><p>The synthetic database/files rehearsal starts no application, provider SDK or worker. Missing app configuration is intentional here. Configuration presence never proves an integration is reachable, correctly scoped or healthy.</p><table><thead><tr><th>Purpose / variable names only</th><th>Configuration state</th></tr></thead><tbody>' + ''.join(readiness_rows) + '</tbody></table><p class="notice">Application and provider health: unverified. No live sandbox, credentials, remote project or cloud recovery is certified by this local result. Run environment-specific provider and application smoke checks before promotion.</p></section>'
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SKO-381 recovery evidence</title><style>
*{{box-sizing:border-box}}body{{margin:0;background:#f2f6f8;color:#18333e;font:16px/1.5 system-ui,sans-serif}}main{{max-width:1120px;margin:32px auto;padding:0 24px 36px}}header,.panel{{background:white;border:1px solid #d8e3e8;border-radius:16px;padding:24px;margin:16px 0}}header{{border-top:6px solid {color}}}h1{{font-size:32px;line-height:1.2;margin:8px 0}}h2{{font-size:20px;margin:0 0 12px}}.eyebrow{{font-size:12px;letter-spacing:.12em;font-weight:750;color:#536c77}}.subtle{{color:#536c77}}.notice{{background:#fff6df;border:1px solid #dfc681;border-radius:10px;padding:14px}}.grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}}.metric{{background:#edf5f6;padding:16px;border-radius:10px}}.metric strong{{display:block;font-size:24px;margin-top:5px}}code{{font-size:12px;overflow-wrap:anywhere}}dl{{display:grid;grid-template-columns:180px 1fr;gap:9px}}dt{{font-weight:650}}dd{{margin:0;min-width:0}}ol{{padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:8px 20px}}li{{display:flex;gap:10px;align-items:flex-start;font-size:13px;padding:8px 0;border-bottom:1px solid #edf1f4;overflow-wrap:anywhere}}.result{{font-size:10px;font-weight:800;letter-spacing:.04em;padding:3px 6px;border-radius:4px}}.pass{{background:#dcf3eb;color:#09634c}}.fail{{background:#fce7e6;color:#9e302b}}table{{width:100%;border-collapse:collapse}}td,th{{padding:6px 10px;text-align:left;border-bottom:1px solid #e8eef1;font-size:13px}}.columns{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}footer{{font-size:12px;color:#536c77}}@media(max-width:700px){{main{{padding:0 12px}}.grid,.columns,ol{{grid-template-columns:1fr}}dl{{grid-template-columns:1fr}}dd{{margin-bottom:10px}}h1{{font-size:26px}}}}@media print{{body{{background:white}}main{{margin:0;max-width:none}}.panel,header{{break-inside:avoid}}}}
</style></head><body><main><header><div class="eyebrow">SKO-381 · BACKUPS, RESTORE &amp; MIGRATION CHECKS</div><h1>{title}</h1><p class="subtle">{escape(target)} · Synthetic records and local files only · No notifications or workers executed</p><div class="notice">Human operator sign-off is pending. Production restore and school reopening are not authorized. {'This working tree contains uncommitted changes; these results are not evidence for promoting the named commit.' if dirty else 'Source is tied to the recorded clean commit; release approval remains separate.'}</div></header>
<section class="panel"><h2>Measured recovery evidence</h2><div class="grid"><div class="metric">Verified restore elapsed<strong>{duration('verifiedRestoreElapsedSeconds')}</strong></div><div class="metric">Backup age at restoration<strong>{duration('backupAgeSecondsAtRestore')}</strong></div><div class="metric">Total rehearsal elapsed<strong>{duration('elapsedSeconds')}</strong></div></div><p><b>Actual restored point (UTC):</b> {escape(report.get('actualRestoredPointUtc', 'Not recovered'))}</p><p class="subtle">Local restore time is an observation, not a promised RTO. The source was quiesced: record/hash reconciliation tests loss for this fixture. A production RPO requires incident and provider snapshot evidence.</p></section>
<section class="panel"><h2>Checks and discrepancies</h2><ol>{checks or '<li>No verification stage passed.</li>'}</ol><p class="subtle">Last stage: {escape(report.get('currentStage', 'not recorded'))}. Cleanup: {escape(report.get('cleanup', 'not recorded'))}.</p></section>
<section class="panel columns"><div><h2>Restored synthetic records</h2><p class="subtle">{len(counts)} application tables checked across all columns. Each table has a recorded count and content hash.</p><table><thead><tr><th>Table</th><th>Rows</th></tr></thead><tbody>{count_rows}</tbody></table></div><div><h2>Recovery limits</h2><p>Two schools, separate campuses, grades, invoices and two referenced file objects are included. Pending workflow state and a committed receipt are restored without executing an external effect.</p><p>Provider PITR, object-store access policies, encryption keys, deployed database roles, external payment/delivery reconciliation and controlled replay need environment-specific evidence.</p><p>Missing or corrupt files, damaged backups, record changes, schema changes and failed migrations must block readiness. A named human reviewer must assess the run and its limitations.</p></div></section>
{readiness_section}
<section class="panel"><h2>Reproducibility</h2><dl><dt>Commit</dt><dd><code>{safe_hash(source.get('commit'),40)}</code></dd><dt>Input manifest SHA-256</dt><dd><code>{safe_hash(source.get('inputsSha256'),64)}</code></dd><dt>Backup SHA-256</dt><dd><code>{safe_hash(report.get('databaseBackupSha256'),64)}</code></dd><dt>Schema / security SHA-256</dt><dd><code>{safe_hash(report.get('restoredSchemaSha256'),64)}</code></dd><dt>Migration range</dt><dd><code>{escape(migration_range)}</code></dd></dl></section><footer>Generated from whitelisted synthetic report fields, counts and hashes. Database rows, credentials, dumps and diagnostic logs are not embedded. Agent execution evidence; no human approval is claimed.</footer></main></body></html>'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = json.loads(args.report.read_text())
    def optional(name):
        path = args.report.parent / name
        return json.loads(path.read_text()) if path.is_file() else None
    content = render(report, optional('reconciliation.json'), optional('input-manifest.json'))
    with args.output.open('x') as output:
        output.write(content)
    print(f'Sanitized synthetic evidence rendered: {args.output}')


if __name__ == '__main__':
    main()
