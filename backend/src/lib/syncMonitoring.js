export function canRetrySyncRun(status) {
  return status === 'failed';
}

export function summarizeSyncRuns(runs) {
  return runs.reduce((summary, run) => {
    summary.total += 1;
    if (run.status === 'success') summary.successful += 1;
    if (run.status === 'failed') summary.failed += 1;
    if (run.status === 'running') summary.running += 1;
    summary.recordsSeen += Number(run.records_seen || 0);
    summary.recordsUpserted += Number(run.records_upserted || 0);
    summary.errors += Number(run.error_count || 0);
    return summary;
  }, {
    total: 0, successful: 0, failed: 0, running: 0,
    recordsSeen: 0, recordsUpserted: 0, errors: 0,
  });
}
