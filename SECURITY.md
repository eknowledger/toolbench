# Security

## Reporting a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/eknowledger/toolbench/security/advisories/new).
Please do not open a public issue for something exploitable.

Expect an acknowledgement within a week. This is a small project maintained in spare time, so a fix may
take longer than that, and I will say so rather than go quiet.

## Threat model

Read this before reporting. Several things that look like vulnerabilities here are documented design, and
saying so up front is more useful than saying it in a reply.

**A tool is first-party code.** A tool is written by whoever runs the site and bundled at build time.
There is no mechanism to load a tool from a URL at runtime, and that is deliberate: doing it on a static
site means `eval`, which costs bundling, tree shaking, and any Content-Security-Policy worth having.

**Worker mode is a stability boundary, not a security boundary.** A worker-mode tool runs on its own
thread so a runaway loop can be terminated without freezing the page. It shares the page's origin,
cookies and storage. It is not a sandbox and the documentation never claims otherwise. If you need to run
code you did not write, this is the wrong design and you want an iframe with a separate origin, or a
server.

**In scope**, and worth reporting:

* an XSS path through tool output, a manifest, or a seed. Every node is built through the three helpers
  in `packages/runtime/src/dom.ts`, which use `createElement`, `createElementNS` and `textContent`.
  Neither package contains `innerHTML`, `insertAdjacentHTML`, `eval` or `new Function`, so a way to
  inject markup would be a real bug;
* a way for one tool on a page to reach another tool's state or results;
* a way to escape the shadow root and alter the host page's DOM;
* the manifest validator accepting something that then causes unsafe behaviour downstream;
* a prototype-pollution path through `upgradeManifest`, `validateManifest` or the fixture comparison,
  all of which walk untrusted-shaped JSON;
* a way to make the runtime fetch or execute code from a location the host did not configure;
* anything in a published tarball that is not in this repository.

**Out of scope:**

* a tool that computes the wrong answer. That is a bug, not a vulnerability;
* a tool that is slow, or that hangs on the main thread. `min`/`max` on inputs and worker mode are the
  documented mitigations, and a host that ignores both gets what it configured;
* a worker-mode tool reading `document.cookie` through its own means. See above: not a sandbox;
* a host choosing to render untrusted Markdown from a tool's `help` field. Rendering that is the host's
  job and its choice of renderer;
* denial of service by feeding a tool an enormous input, where the manifest declared no bounds. The
  validator requires `min` and `max` on number inputs for this reason; a `textarea` with no `maxLength` is
  the host's decision.

## Supply chain

* Both published packages have **zero runtime dependencies** other than `@toolbench/runtime` depending on
  `@toolbench/sdk`. There is nothing else in the tree a consumer installs.
* Releases are published from CI with **npm provenance**, so npm shows a signed attestation tying the
  tarball to the commit and workflow that built it.
* **0.1.0 is the one exception.** It was published by hand during bootstrap, so it carries no
  attestation. npm will not let a trusted publisher be configured until a package exists, and provenance
  needs OIDC, which only exists in CI: the first release of a package cannot have both. Every release
  from 0.1.1 onward is published from CI and attested. A later version without provenance would be
  worth treating as suspicious.
* `files: ["dist"]`, and CI prints `npm pack --dry-run` for both packages on every build, so what ships
  is visible in the log.
* Development requires Node 24 and pnpm with a frozen lockfile in CI.

## Supported versions

Pre-1.0, only the latest minor gets fixes. Once 1.0 ships this section will say something more useful.
