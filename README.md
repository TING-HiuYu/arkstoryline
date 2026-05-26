# ArkStoryline

ArkStoryline is a static Arknights story reader. It builds storyline, operator, search, and runtime URL indexes ahead of time, then serves the frontend as plain static assets.

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

## Configuration

Release-facing defaults live in environment variables. See [configuration.md](docs/configuration.md) and [.env.example](.env.example).
