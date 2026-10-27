#!/usr/bin/env node
// `toolbench-manifests`. Apart from cli.ts so a test can call `run` without running the command.
import { run } from "./cli.ts";

const { code, message } = run(process.argv.slice(2));
(code === 0 ? console.log : console.error)(message);
process.exitCode = code;
