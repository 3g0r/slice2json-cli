# slice2json-cli

Slice language to AST JSON compiler

## Install

```bash
yarn global add slice2json-cli
```

## Usage

```bash
> slice2json

<file ...> [options]

Options:
  --help         Show help                                             [boolean]
  --version      Show version number                                   [boolean]
  --root-dir     Root dirs.
                 Output files will have the same structure as source files
                 relative to root dirs.
                 Ice includes are also resolved in these dirs.[array] [required]
  --exclude, -e  File paths or globs to exclude.                         [array]
  --out-dir, -o  Directory where to put generated files.
                  [string] [default: "./compiled-slices"]
```