#!/usr/bin/env node
import * as yargs from 'yargs';
import * as path from 'path';
import * as fs from 'fs';
import * as glob from 'glob';
import {parse, SliceSource} from 'slice2json';
const {sliceDir} = require('slice2js');
const packageJson = require('../package.json');

yargs
  .version(packageJson.version)
  .scriptName('Slice language to AST JSON compiler')
  .command(
    '*',
    'Usage: <file ...> [options]',
    argv => argv.options({
      'root-dir': {
        description: `Root dirs.
        Output files will have the same structure as source files relative to root dirs.
        Ice includes are also resolved in these dirs.`,
        array: true,
        required: true,
        string: true,
      },
      'exclude': {
        alias: 'e',
        description: 'File paths or globs to exclude.',
        array: true,
        string: true,
      },
      'out-dir': {
        alias: 'o',
        description: 'Directory where to put generated files.',
        string: true,
        default: `${process.cwd()}/compiled-slices`,
      },
    }),
    async argv => {
      const paths = await resolveGlobs(argv._, argv.exclude);
      
      const absRootDirs = argv['root-dir'].map(dir => path.resolve(dir));
      absRootDirs.push(sliceDir);
      const outDir = argv['out-dir'];
      
      await Promise.all([...Object.entries(await loadSlices(paths, absRootDirs))].map(async ([name, slice]) => {
        const fullPath = path.join(outDir, `${name}.json`);
        const dir = path.dirname(fullPath);
        await cps(cb => fs.mkdir(dir, {recursive: true}, cb));
        await cps(cb => fs.writeFile(fullPath, JSON.stringify(slice.parsed, null, 2), cb));
      }))
    }
  )
  .argv;

interface LoadedSlices {
  [name: string]: LoadedSlice;
}


interface LoadedSlice {
  rootDir: string;
  contents: string;
  parsed: SliceSource;
}


async function loadSlices(
  paths: string[],
  absRootDirs: string[],
): Promise<LoadedSlices> {
  // relative slice path without extension
  const inputNames: string[] = [];

  for (const relativePath of paths) {
    const absPath = path.resolve(relativePath);
    
    let slicePath: string | null = null;

    for (const rootDir of absRootDirs) {
      if (absPath.startsWith(rootDir + path.sep)) {
        const sliceRelativePath = absPath.substring(rootDir.length + 1);

        if (slicePath == null || slicePath.length > sliceRelativePath.length) {
          slicePath = sliceRelativePath;
        }
      }
    }

    if (slicePath == null) {
      throw new Error(
        `Slice file ${relativePath} is not contained in any of the root dirs`,
      );
    }

    const match = slicePath.match(/^(.*)\.ice$/);

    if (match == null) {
      throw new Error(`Invalid slice file extension: ${slicePath}`);
    }

    inputNames.push(match[1]);
  }

  const loadPromises: {[name: string]: Promise<LoadedSlice>} = {};
  const slices: {[name: string]: LoadedSlice} = {};

  async function loadSliceAndDeps(sliceName: string): Promise<void> {
    if (loadPromises[sliceName] != null) {
      return;
    }

    const promise = (loadPromises[sliceName] = loadSlice(
      `${sliceName}.ice`,
      absRootDirs,
    ));

    const {parsed} = (slices[sliceName] = await promise);

    if (parsed.includes == null) {
      return;
    }

    await Promise.all(parsed.includes.map(loadSliceAndDeps));
  }

  await Promise.all(inputNames.map(loadSliceAndDeps));

  return slices;
}

/**
 * @param slicePath Relative slice path in form `A/B.ice`
 * @param absRootDirs Array of dirs in which to look for slice files.
 */
async function loadSlice(
  slicePath: string,
  absRootDirs: string[],
): Promise<LoadedSlice> {
  let result: {rootDir: string; contents: string} | null = null;

  for (const rootDir of absRootDirs) {
    const absSlicePath = path.join(rootDir, slicePath);
    try {
      result = {
        rootDir,
        contents: await cps<string>(cb =>
          fs.readFile(absSlicePath, 'utf-8', cb),
        ),
      };
      break;
    } catch (e) {
      continue;
    }
  }

  if (result == null) {
    throw new Error(`Failed to load slice file: ${slicePath}`);
  }

  try {
    const {rootDir, contents} = result;
    return {rootDir, contents, parsed: parse(contents)};
  } catch (e) {
    throw new Error(`${slicePath}\n${e.message}`);
  }
}

function cps(
  executor: (cb: (error: any) => void) => void,
): Promise<void>;
function cps<T>(
  executor: (cb: (error: any, result: T) => void) => void,
): Promise<T>;
function cps<T>(
  executor: (cb: (error: any, result?: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) =>
    executor(
      (error, result) => (error != null ? reject(error) : resolve(result)),
    ),
  );
}
async function resolveGlobs(
  globs: string[],
  ignore?: string[],
): Promise<string[]> {
  const results = await Promise.all(
    globs.map(pattern => cps<string[]>(cb => glob(pattern, {ignore}, cb))),
  );

  const paths = new Set<string>();

  for (const result of results) {
    for (const path of result) {
      paths.add(path);
    }
  }

  return [...paths];
}