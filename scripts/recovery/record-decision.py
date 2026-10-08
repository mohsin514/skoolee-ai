#!/usr/bin/env python3
"""Record a human review alongside immutable rehearsal evidence; never execute a restore."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--report', type=Path, required=True)
parser.add_argument('--reviewer', required=True)
parser.add_argument('--release', required=True)
parser.add_argument('--ticket', required=True)
parser.add_argument('--decision', choices=['accept-synthetic-rehearsal', 'blocked'], required=True)
parser.add_argument('--notes', required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
report_bytes = args.report.read_bytes()
report = json.loads(report_bytes)
if args.decision == 'accept-synthetic-rehearsal':
    if report.get('status') != 'verified-awaiting-sign-off' or not report.get('checks') or not all(check['passed'] for check in report['checks']):
        parser.error('Cannot accept a blocked or unverified rehearsal')
for value in (args.reviewer, args.release, args.ticket, args.notes):
    if not value.strip():
        parser.error('Review fields must not be empty')
record = {'reviewer': args.reviewer, 'reviewedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
          'release': args.release, 'ticket': args.ticket, 'decision': args.decision, 'notes': args.notes,
          'reportSha256': hashlib.sha256(report_bytes).hexdigest(), 'destination': report['destination'],
          'actualRestoredPointUtc': report.get('actualRestoredPointUtc'),
          'productionRestoreAuthorized': False, 'schoolReopenAuthorized': False}
with args.output.open('x') as handle:
    json.dump(record, handle, indent=2)
    handle.write('\n')
print('Recorded review. Production restore and school reopening require the separate incident procedure.')
