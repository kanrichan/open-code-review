// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 alibaba/open-code-review Contributors

import {
  buildDelegatePreviewArgs, buildReviewArgs, extractCliError, parseCliResult,
  parseDelegatePreview, parseLogLine, redactCliError,
} from '../cliParse';
import { ReviewMode } from '@shared/types';

describe('buildReviewArgs', () => {
  it('adds --format json in workspace mode', () => {
    expect(buildReviewArgs({ mode: ReviewMode.Workspace }))
      .toEqual(['review', '--format', 'json']);
  });

  it('adds --from and --to in branch mode', () => {
    expect(buildReviewArgs({ mode: ReviewMode.Branch, from: 'main', to: 'dev' }))
      .toEqual(['review', '--from', 'main', '--to', 'dev', '--format', 'json']);
  });

  it('adds --commit in commit mode', () => {
    expect(buildReviewArgs({ mode: ReviewMode.Commit, commit: 'abc123' }))
      .toEqual(['review', '--commit', 'abc123', '--format', 'json']);
  });

  it('SVN range mode passes both remote targets', () => {
    const options = {
      mode: ReviewMode.Branch,
      vcs: 'svn' as const,
      from: '120',
      to: '128',
      svnFromTarget: '^/trunk@HEAD',
      svnToTarget: '^/branches/feature@HEAD',
    };
    expect(buildReviewArgs(options)).toEqual([
      'review', '--from', '120', '--to', '128',
      '--svn-from-target', '^/trunk@HEAD',
      '--svn-to-target', '^/branches/feature@HEAD',
      '--format', 'json',
    ]);
    expect(buildDelegatePreviewArgs(options)).toEqual([
      'delegate', 'preview', '--from', '120', '--to', '128',
      '--svn-from-target', '^/trunk@HEAD',
      '--svn-to-target', '^/branches/feature@HEAD',
      '--format', 'json',
    ]);
  });

  it('appends --background for customPrompt', () => {
    expect(buildReviewArgs({ mode: ReviewMode.Workspace, customPrompt: '关注安全' })) // allow-non-english: fixture verifies Unicode prompt forwarding
      .toEqual(['review', '--format', 'json', '--background', '关注安全']); // allow-non-english: fixture verifies Unicode prompt forwarding
  });

  it('appends --concurrency for concurrency', () => {
    expect(buildReviewArgs({ mode: ReviewMode.Workspace, concurrency: 4 }))
      .toEqual(['review', '--format', 'json', '--concurrency', '4']);
  });
});

describe('parseDelegatePreview', () => {
  it('解析 SVN 密封端点和可审查文件', () => {
    const preview = parseDelegatePreview(JSON.stringify({
      vcs: 'svn',
      mode: 'range',
      resolved_base: '120',
      resolved_head: '128',
      exact_range: '120:128',
      resolved_base_peg: '130',
      resolved_head_peg: '130',
      reviewable_files: [
        { path: 'src/a.ts', status: 'modified' },
        { path: 'src/b.ts', status: 'unsupported' },
      ],
    }));
    expect(preview).toMatchObject({
      vcs: 'svn',
      mode: 'range',
      resolvedBase: '120',
      resolvedHead: '128',
      exactRange: '120:128',
      resolvedBasePeg: '130',
      resolvedHeadPeg: '130',
      reviewableFiles: [{ path: 'src/a.ts', status: 'modified' }],
    });
  });
});

describe('parseCliResult', () => {
  it('parses success, comments, and summary with camelCase fields', () => {
    const raw = JSON.stringify({
      status: 'success',
      comments: [{
        path: 'src/a.ts', content: 'bug', start_line: 10, end_line: 12,
        suggestion_code: 'fix', existing_code: 'old',
      }],
      summary: {
        files_reviewed: 2, comments: 1, total_tokens: 100,
        input_tokens: 80, output_tokens: 20, elapsed: '5s',
      },
    });
    const r = parseCliResult(raw);
    expect(r.status).toBe('success');
    expect(r.comments[0]).toEqual({
      path: 'src/a.ts', content: 'bug', startLine: 10, endLine: 12,
      suggestionCode: 'fix', existingCode: 'old', thinking: undefined,
    });
    expect(r.summary?.filesReviewed).toBe(2);
  });

  it('returns no comments for skipped status', () => {
    const raw = JSON.stringify({ status: 'skipped', message: 'No supported files changed.', comments: [] });
    const r = parseCliResult(raw);
    expect(r.status).toBe('skipped');
    expect(r.comments).toEqual([]);
  });

  it('ignores non-JSON noise before the JSON result', () => {
    const raw = '[ocr] some log\n{"status":"success","comments":[]}';
    const r = parseCliResult(raw);
    expect(r.status).toBe('success');
  });
});

describe('extractCliError', () => {
  it('prefers an Error: line and removes its prefix', () => {
    const stderr = '[ocr] starting\nError: llm request failed: 401 unauthorized\n';
    expect(extractCliError(stderr)).toBe('llm request failed: 401 unauthorized');
  });
  it('uses the last Error line when there are multiple errors', () => {
    const stderr = 'Error: first\nError: last';
    expect(extractCliError(stderr)).toBe('last');
  });
  it('uses the last non-empty line when there is no Error line', () => {
    expect(extractCliError('foo\nbar\n\n')).toBe('bar');
  });
  it('returns an empty string for empty stderr', () => {
    expect(extractCliError('')).toBe('');
  });
  it('从错误中移除带凭据或普通的 SVN URL', () => {
    expect(extractCliError("Error: svn failed for https://user:secret@example.test/repo/trunk@12\n"))
      .toBe('svn failed for [SVN target redacted]');
    expect(redactCliError("missing ^/branches/private@HEAD", ['^/branches/private@HEAD']))
      .toBe('missing [SVN target redacted]');
  });
});

describe('parseLogLine', () => {
  it('classifies a regular [ocr] line as info', () => {
    expect(parseLogLine('[ocr] Reviewing src/a.ts')).toEqual({ text: '[ocr] Reviewing src/a.ts', level: 'info' });
  });
  it('classifies a line containing Retrying as warn', () => {
    expect(parseLogLine('[llm] Retrying in 1.46s (attempt 1/3)').level).toBe('warn');
  });
  it('classifies a line containing WARNING as warn', () => {
    expect(parseLogLine('[ocr] WARNING [x] f: m').level).toBe('warn');
  });
  it('returns null for a blank line', () => {
    expect(parseLogLine('   ')).toBeNull();
  });
});
