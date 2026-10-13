---
description: Run OCR in delegation mode — OCR handles file selection and rules, the host agent performs the actual review.
---

Invoke OpenCodeReview (OCR) in delegation mode. OCR determines which files to review and provides review rules; you perform the actual code review using your own capabilities.

## Workflow

### Step 1: Preview

```bash
ocr delegate preview [user-args]
```

- Default (no user arguments): workspace mode (staged + unstaged + untracked).
- If the user provides `--commit` or `-c`: pass through as-is.
- If the user provides `--from` and `--to`: pass through as-is.
- (Optional) Provide `--background "context"` or `-b "context"` for business context.
- If `ocr` is not found, install it: `npm i -g @alibaba-group/open-code-review`.

This outputs mode/ref metadata and the reviewable file list.

### Step 2: Get Rules

Pass all reviewable file paths to get their review checklists:

```bash
ocr delegate rule <path1> <path2> ...
```

### Step 3: Get Diffs and Review

Choose the diff command using the VCS, mode, and refs from Step 1. Use `git --no-pager` for every Git call during the review.

The diff commands disable external diff programs, text conversion, and color to produce plain patches.

**Git range mode** (merge_base provided in preview output):
```bash
git --no-pager diff --no-ext-diff --no-textconv --no-color <merge_base>..<to> -- "<path>"
```

**Git commit mode**:
```bash
git --no-pager show --no-ext-diff --no-textconv --no-color <commit> -- "<path>"
```

**SVN range or commit mode** uses the numeric endpoints returned by preview. Read the selected URL from `svn info --xml --non-interactive --depth empty -- .`, then resolve its historical URL at each endpoint before diffing:
```bash
svn info --xml --non-interactive --revision <resolved_base> -- <selected-url>@<resolved_base>
svn info --xml --non-interactive --revision <resolved_head> -- <selected-url>@<resolved_head>
svn diff --non-interactive --git --internal-diff --show-copies-as-adds --old <base-url-from-info>@<resolved_base> --new <head-url-from-info>@<resolved_head>
svn cat --non-interactive --revision <resolved_head> -- <head-url-from-info>/<url-escaped-path>@<resolved_head>
```

For an explicit remote-path range, retain the two validated input targets only in runtime memory: delegate JSON deliberately does not echo them. Resolve each with `svn info --xml --non-interactive --revision <operative-revision> -- <target-url>@<resolved-peg>`, then diff the two returned historical URLs with `--notice-ancestry`. Never invent Git merge-base semantics for SVN.

**Workspace mode**:
```bash
# Git tracked files
git --no-pager diff --no-ext-diff --no-textconv --no-color HEAD -- "<path>"
# SVN versioned files
svn diff --git --internal-diff --show-copies-as-adds -- <path>
# New untracked/unversioned files — read directly (entire file is new code)
cat "<path>"
```

To read context:

```bash
git --no-pager log --no-color --oneline -- "<path>"
git --no-pager blame --no-textconv -- "<path>"
git --no-pager show --no-ext-diff --no-textconv --no-color "<ref>:<path>"
```

For large diffs, add `--output="<absolute-diff-file>"` to the command for the selected mode. Choose a unique absolute path outside the repository and create its parent directory. Use the same path in file-reading tool calls:

```bash
git --no-pager diff --no-ext-diff --no-textconv --no-color --output="<absolute-diff-file>" <merge_base>..<to> -- "<path>"
```

After Git exits with code 0, read and review the entire file in chunks, then remove it. If Git fails or times out, retry or record `skipped` with the error. Check unexpectedly empty output against a fresh preview.

Then review focusing on: correctness, security, performance, error handling, concurrency, maintainability. Only comment on changed code (+ lines).

### Step 4: Report and Fix

Record each previewed `(path, status)` as `reviewed` or `skipped`. Give a reason for every skipped entry, and report `total_files`, `reviewed_files`, `skipped_files`, and `coverage_rate`.

Classify each issue by severity:

- **High**: Obvious bugs, security issues, data loss, or clear mistakes with precise fix proposals
- **Medium**: Reasonable concerns, performance suggestions, or fixes requiring manual work
- **Low**: Discard silently (likely false positives, nitpicks, or insufficient context)

Automatically fix High and Medium issues that are safe and well-defined.
