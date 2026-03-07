# Split + Incremental Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Change cloud sync from one large JSON-with-base64 payload into metadata plus separate remote image assets, then make the split format incremental so upload/download only transfer changed content while local export/import JSON behavior stays unchanged.

**Architecture:** Keep local `handleExport` / `handleImport` on the existing full JSON format, and treat split metadata as a cloud-sync-only transport format. Upload writes per-artist image blobs (and background asset when present) first, then commits the new metadata JSON last so the remote manifest never points at blobs that are not uploaded yet; download reads metadata first, then fetches image blobs sequentially during merge to keep peak memory low and remain backward compatible with old single-file sync payloads. Local file import must continue to reject or ignore sync-only split manifests unless the file is a self-contained full backup. Incremental sync extends the split transport with stable asset keys derived from a compact `artist.tag` slug plus a content-hash suffix, per-asset `contentHash`, metadata-level `contentHash`, and local preservation flags so unchanged assets can be skipped on upload and reused on download without tag-collision overwrites or overlong R2 object names.

**Tech Stack:** Single-file browser app in `artist manager.html`, IndexedDB image store, WebDAV via XHR, S3-compatible storage with SigV4 signing, Node `node:test` regression tests under `tests/`.

---

### Task 1: Add failing tests for split-sync helpers

**Files:**
- Create: `tests/sync-split-assets.test.mjs`
- Modify: `artist manager.html`

**Step 1: Write failing test for asset path derivation**

Add a test that expects a configured sync target like `backups/gallery.json` or `folder/gallery.json` to derive a metadata file path plus an asset prefix directory for split sync.

**Step 2: Run test to verify it fails**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: FAIL because helper does not exist.

**Step 3: Write minimal implementation**

Add pure helpers in `artist manager.html` for deriving sync metadata target and asset object paths from WebDAV `filePath` / S3 `objectKey`.

**Step 4: Run test to verify it passes**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: PASS.

### Task 2: Add failing tests for split metadata payload generation

**Files:**
- Modify: `tests/sync-split-assets.test.mjs`
- Modify: `artist manager.html`

**Step 1: Write failing tests for metadata manifest generation**

Cover these expectations:
- local image entries are replaced by asset references instead of inline `data:` URLs
- external image URLs stay inline
- settings background image can be emitted as a separate asset descriptor
- metadata declares a split format marker/version for compatibility checks

**Step 2: Run tests to verify they fail**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: FAIL because helper(s) do not exist.

**Step 3: Implement minimal metadata builder helpers**

Add helpers that accept normalized artists/settings/image descriptors and return split sync metadata without embedding local image bytes.

**Step 4: Run tests to verify they pass**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: PASS.

### Task 3: Add failing tests for import payload compatibility

**Files:**
- Modify: `tests/sync-split-assets.test.mjs`
- Modify: `artist manager.html`

**Step 1: Write failing tests for `resolveImportPayload` with split sync metadata**

Cover these cases:
- split metadata produces `artists`, `categories`, patches, and asset manifest maps
- old versioned JSON payload still resolves the old way
- legacy arrays remain supported
- local file import semantics stay unchanged: split sync metadata alone is not treated as a self-contained local backup

**Step 2: Run tests to verify they fail**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: FAIL because split metadata is not parsed yet.

**Step 3: Implement minimal compatibility parsing**

Extend `resolveImportPayload` to preserve split asset manifests without breaking old import behavior, and add an explicit marker that lets `handleImport` reject sync-only split metadata for local file import.

**Step 4: Run tests to verify they pass**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: PASS.

### Task 4: Implement split sync upload flow

**Files:**
- Modify: `artist manager.html`
- Test: `tests/sync-split-assets.test.mjs`

**Step 1: Add failing tests for upload planning helpers**

Test a helper that builds upload instructions: metadata JSON body plus per-asset uploads with correct mime types and remote keys.

**Step 2: Run tests to verify they fail**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: FAIL.

**Step 3: Implement minimal upload plan + transport helpers**

Introduce upload helpers for:
- WebDAV metadata PUT + asset PUTs
- S3 metadata PUT + asset PUTs
- byte hashing/signing support for blob uploads

Keep local export path untouched.

**Step 4: Run tests to verify helper tests pass**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: PASS.

### Task 5: Extend split sync into incremental upload flow

**Files:**
- Modify: `artist manager.html`
- Modify: `tests/sync-split-assets.test.mjs`

**Step 1: Add failing tests for incremental upload planning**

Cover these expectations:
- split asset paths stay stable across devices by deriving asset names from `artist.tag` rather than ephemeral local ids
- asset descriptors include `contentHash`
- metadata includes `contentHash` plus `assetManifestVersion`
- upload planning skips unchanged assets when remote split metadata already has the same hashes
- upload entrypoints still rewrite metadata when asset membership changes even if hashes differ only in asset refs

**Step 2: Run focused tests to verify they fail**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: FAIL for incremental upload expectations.

**Step 3: Implement minimal incremental upload behavior**

Add helpers that:
- compute content hashes for split assets and metadata
- fetch remote split metadata for WebDAV / S3 when present
- compare local bundle vs remote bundle and upload only changed asset blobs
- upload changed assets before writing metadata so the metadata write becomes the remote commit point
- keep metadata upload compatible with older remotes that still only have the legacy single-file backup

**Step 4: Run focused tests to verify they pass**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: PASS.

### Task 6: Implement split sync download + merge flow

**Files:**
- Modify: `artist manager.html`
- Modify: `tests/sync-memory-guard.test.mjs`
- Modify: `tests/sync-split-assets.test.mjs`

**Step 1: Write failing tests for download/merge behavior**

Cover:
- metadata is downloaded and parsed before image blobs
- image blobs are fetched sequentially or with tiny bounded concurrency
- merged artists get blob-backed runtime URLs / IDB persistence without inline base64 inflation
- background asset is restored when present
- legacy single-file sync payloads still flow through unchanged
- `manualSyncDownload` entrypoint keeps cloud split support while `handleImport` keeps local full-backup semantics

**Step 2: Run focused tests and verify they fail**

Run: `node --test tests/sync-split-assets.test.mjs tests/sync-memory-guard.test.mjs`
Expected: FAIL for new split-sync expectations.

**Step 3: Implement minimal download/merge flow**

Download metadata first, detect split format, then fetch referenced assets during overwrite merge. Preserve backward compatibility by keeping old single-JSON sync path working. Explicitly wire split asset manifests into `overwriteImportResolvedPayload` / `mergeImportResolvedPayload` so referenced images and background assets are hydrated into IDB/runtime state rather than only parsed.

**Step 4: Run focused tests to verify they pass**

Run: `node --test tests/sync-split-assets.test.mjs tests/sync-memory-guard.test.mjs`
Expected: PASS.

### Task 7: Extend split sync into incremental download reuse

**Files:**
- Modify: `artist manager.html`
- Modify: `tests/sync-split-assets.test.mjs`

**Step 1: Add failing tests for incremental download behavior**

Cover:
- `manualSyncDownload` exits early when remote split metadata `contentHash` matches the current local split bundle
- unchanged split assets are preserved locally instead of being re-downloaded when local and remote `contentHash` values match
- changed assets still fetch as blobs and hydrate into overwrite merge
- legacy single-file sync payloads still bypass split-specific incremental behavior

**Step 2: Run focused tests and verify they fail**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: FAIL for new incremental download expectations.

**Step 3: Implement minimal incremental download reuse**

Download metadata first, compare remote metadata hash to the current local split bundle, then either no-op or hydrate only changed assets. Preserve unchanged local resources by passing preservation markers through `hydrateSplitResolvedPayloadAssets` into overwrite/merge handling.

**Step 4: Run focused tests to verify they pass**

Run: `node --test tests/sync-split-assets.test.mjs`
Expected: PASS.

### Task 8: Full verification

**Files:**
- Verify: `artist manager.html`
- Verify: `tests/sync-split-assets.test.mjs`
- Verify: `tests/sync-memory-guard.test.mjs`
- Verify: `tests/image-storage-diagnostics.test.mjs`
- Verify: `tests/comfy-workflow-download.test.mjs`

**Step 1: Run language diagnostics**

Use `lsp_diagnostics` on modified files.

**Step 2: Run full test suite**

Run: `node --test tests/*.mjs`
Expected: all tests pass.

**Step 3: Review backward compatibility manually in code**

Confirm local export/import still call the full JSON builder and legacy payload parsing remains intact, while cloud sync entrypoints accept both legacy full JSON blobs and split metadata + remote assets. Also confirm incremental sync remains cloud-only and never changes local full-backup semantics.

**Step 4: Commit once implementation is verified**

Do not commit until tests and diagnostics are clean.
