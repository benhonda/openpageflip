Changesets live here. Add one with `task changeset` (or write the file by hand) in the same commit as the change it describes.
Every push to main that carries changesets is released by `.github/workflows/release.yml`: versions and changelogs are committed back, packages are published with provenance, and a GitHub release is created per package.
