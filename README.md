# ArkStoryline

ArkStoryline is a static Arknights story reader. It builds storyline, operator, search, and runtime URL indexes ahead of time, then serves the frontend as plain static assets.

The Worker build also publishes the navigation page at `thy.icu/` and mounts the reader at `/ark/storyline/`. Edit `portal/links.json` to update the navigation links and tags; `pnpm build:worker` generates the static page and both reader variants. Cloudflare Workers Builds uses `pnpm build:worker` followed by `npx wrangler deploy --config wrangler.worker.jsonc --keep-vars`.

## Development

```bash
pnpm install
pnpm dev
```

Useful checks:

```bash
pnpm typecheck
pnpm test
python3 -m unittest discover scripts/resourcesFetcher/tests
```

## Data Pipeline

TypeScript game-data commands:

```bash
pnpm data:sync
pnpm data:build
pnpm data:validate
```

Resource fetcher commands:

```bash
python3 -m scripts.resourcesFetcher sync-storyline-index
python3 -m scripts.resourcesFetcher sync-story-content-sources
python3 -m scripts.resourcesFetcher sync-music-index
python3 -m scripts.resourcesFetcher sync-operator-index
python3 -m scripts.resourcesFetcher sync-terra-historicus-index
python3 -m scripts.resourcesFetcher build-compat-index
```

The Python resource fetcher only discovers classifications and source URLs. Story text and images are resolved by the frontend at runtime.
Operator details load PRTS archive, module, and record content in the browser.
Basic index information remains visible if archive parsing returns no content or
the request fails; the page displays the loading or failure status separately.

### Automated metadata sync

The `PRTS Metadata Sync` workflow runs weekly and can also be started manually.
It always starts from the repository's default branch:

1. Fetch the storyline, operator, and Terra Historicus metadata indexes.
2. Compare their JSON content with Git, ignoring the top-level `generatedAt`
   timestamp and JSON formatting. If unchanged, finish without building or opening
   a PR. Empty or invalid indexes fail the run rather than publishing data loss.
3. Create `automation/prts-sync-<YYYYMMDD>` using the UTC date when metadata
   changes. Same-day runs reuse the existing branch and open PR, adding commits
   without force-pushing.
4. Run `pnpm data:sync`, `pnpm data:build`, attach PRTS story URLs, then run
   `pnpm data:validate`.
5. Commit generated data and cover assets (including new ignored files), push the
   branch, and open a PR against the default branch.
6. Request squash auto-merge and branch deletion. GitHub merges only when required
   checks and branch rules are satisfied; workflow success does not mean the PR
   has already merged.

Git is the comparison baseline; no last-sync hash or placeholder is needed.
Game-data-only changes do not trigger this metadata-gated workflow.

Before running it, add a repository Actions secret named `PRTS_SYNC_TOKEN` with a
token that has repository **Contents: read and write** and **Pull requests: read
and write** permissions. Enable **Allow auto-merge** and squash merging in the
repository settings. The token owner must be allowed to create automation branches
and request auto-merge. The workflow does not use administrator bypass when
merging. Rules such as restricted updates, required signatures, reviews, and code
scanning still need to permit the resulting PR to merge. Without the secret, the
workflow fails before fetching data. Keep this credential in Actions secrets,
not in the repository.

## Configuration

Release-facing defaults live in environment variables. See [configuration.md](docs/configuration.md) and [.env.example](.env.example).
