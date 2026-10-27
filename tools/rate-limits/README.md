# Which rate limit applies

Takes an ordered list of path limits, the methods they apply to, and a list of requests, and says which
limit each request meets. The first rule whose path is a prefix of the request's path wins, the way most
gateways read such a list, so the order of the rows is part of the configuration.

It exists in this repository for its inputs. The limits are a `rows` input with two columns, a text path
and a bounded number, that the reader adds to, removes from and reorders. The methods are a `multiselect`
of six options, drawn as checkboxes, with at least one required. Its fixtures and samples give both as
JSON arrays.

## What it checks

- **A path starts with `/`.** Anything else is refused, naming the row.
- **A path appears once.** The second copy is refused, naming its row and the first.
- **Every rule can match.** A rule whose path an earlier rule's path is a prefix of never matches, so it is
  refused with the row that shadows it. Moving it above that row fixes it, which is what the reorder
  handles are for.
- **A request is a method and a path.** A line with anything else is refused where it starts.

## What this does not handle

- **Patterns.** A path is a plain prefix: `/api` matches `/api/orders` and also `/apiary`.
- **Bursts, windows or quotas.** A limit is one number in requests per second, reported, not simulated.
- **Hosts, headers or query strings.** Only the method and the path are read.
