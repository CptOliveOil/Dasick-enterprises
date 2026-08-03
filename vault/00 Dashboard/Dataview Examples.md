---
status: stable
created: 2026-08-03
updated: 2026-08-03
owner: fayaz
summary: Queries worth reusing
related:
  - [[Vault Conventions]]
  - [[Plugins]]
tags:
  - meta
  - dashboard
---

# Dataview Examples

## Everything needing attention

````
```dataview
TABLE status, file.folder AS area
WHERE status = "draft" OR status = "needs-review" OR status = "stale"
SORT file.folder ASC
```
````

## Bugs by severity

````
```dataview
TABLE severity, resolved, commit, summary
FROM "07 Bugs"
WHERE file.name != "Index"
SORT severity ASC, resolved DESC
```
````

## Providers not yet implemented

````
```dataview
LIST summary
FROM "04 Providers"
WHERE status != "implemented" AND file.name != "Index"
```
````

## Tables touched by a migration

````
```dataview
TABLE scope, summary
FROM "05 Database"
WHERE contains(migration, "0008")
```
````

## Pages linking to a system

````
```dataview
LIST
FROM [[Rendering Pipeline]]
SORT file.name ASC
```
````

## Stale architecture

````
```dataview
TABLE updated
FROM "01 Architecture"
WHERE updated < date(today) - dur(90 days)
SORT updated ASC
```
````

## Decisions in order

````
```dataview
TABLE adr AS "#", status, summary
FROM "08 Decisions"
WHERE file.name != "Index"
SORT adr ASC
```
````

## Core reading list

````
```dataview
LIST summary
WHERE contains(tags, "core")
SORT file.name ASC
```
````
