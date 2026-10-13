---
description: Run OCR in delegation mode — OCR handles file selection and rules, the host agent performs the actual review.
---

Invoke OpenCodeReview (OCR) in delegation mode. OCR determines which files to review and provides review rules; you perform the actual code review using your own capabilities.

## Workflow

### Step 1: Preview

```bash
ocr delegate preview [user-args]
```

- Default (no user arguments): workspace mode (Git staged/unstaged/untracked or SVN versioned/unversioned changes).
- If the user provides `--commit` or `-c`: pass through as-is.
- If the user provides `--from` and `--to`: pass through as-is.
- If the user provides either remote SVN target, require and pass through both `--svn-from-target` and `--svn-to-target`.
- (Optional) Provide `--background "context"` or `-b "context"` for business context.
- If `ocr` is not found, install it: `npm i -g @alibaba-group/open-code-review`.
- SVN requests require an `svn` 1.7+ command-line client with non-interactive authentication and certificate trust already configured.

This outputs VCS/mode/ref metadata and the reviewable file list.

### Step 2: Get Rules

Pass all reviewable file paths to get their review checklists:

```bash
ocr delegate rule <path1> <path2> ...
```

### Step 3: Get Diffs and Review

Choose the diff command using the VCS, mode, and refs from Step 1. Use `git --no-pager` for every Git call during the review.

The diff commands disable external diff programs, text conversion, and color to produce plain patches.

- Git range: `git --no-pager diff --no-ext-diff --no-textconv --no-color <merge_base>..<to> -- "<path>"`
- Git commit: `git --no-pager show --no-ext-diff --no-textconv --no-color <commit> -- "<path>"`
- Git workspace: `git --no-pager diff --no-ext-diff --no-textconv --no-color HEAD -- "<path>"` (or `cat "<path>"` for untracked files)
- SVN workspace: `svn diff --git --internal-diff --show-copies-as-adds -- <path>` (or read directly for unversioned files)
- SVN range/commit: read the selected `<url>` from `svn info --xml --non-interactive --depth empty -- .`, then use the frozen numeric endpoints and explicit URL pegs: `svn diff --non-interactive --git --internal-diff --show-copies-as-adds --old <url>@<resolved_base> --new <url>@<resolved_head>` and `svn cat --non-interactive --revision <resolved_head> -- <url>/<url-escaped-path>@<resolved_head>`
- Remote SVN path range: pass both `--svn-from-target` and `--svn-to-target`; keep the input URLs in runtime memory because preview JSON deliberately omits them, resolve their historical URLs with the reported operative/peg revisions, and compare those URLs with `--notice-ancestry`

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
