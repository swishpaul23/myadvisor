// Maximum bipartite matching (Hopcroft-Karp). Left vertices are requirement slots, right
// vertices are courses. Deterministic: left vertices and each adjacency list are processed
// in the order given, so the same input always gives the same matching (spec invariant I5).

export type Matching = {
  /** matchLeft[l] = right vertex matched to slot l, or -1. */
  matchLeft: number[];
  /** matchRight[r] = slot matched to course r, or -1. */
  matchRight: number[];
  size: number;
};

export function hopcroftKarp(
  adjacency: number[][],
  rightCount: number,
): Matching {
  const leftCount = adjacency.length;
  const matchLeft = new Array<number>(leftCount).fill(-1);
  const matchRight = new Array<number>(rightCount).fill(-1);
  const dist = new Array<number>(leftCount).fill(0);
  const INF = Number.POSITIVE_INFINITY;

  function bfs(): boolean {
    const queue: number[] = [];
    for (let l = 0; l < leftCount; l++) {
      if (matchLeft[l] === -1) {
        dist[l] = 0;
        queue.push(l);
      } else dist[l] = INF;
    }
    let found = false;
    for (let head = 0; head < queue.length; head++) {
      const l = queue[head]!;
      for (const r of adjacency[l]!) {
        const next = matchRight[r]!;
        if (next === -1) found = true;
        else if (dist[next] === INF) {
          dist[next] = dist[l]! + 1;
          queue.push(next);
        }
      }
    }
    return found;
  }

  function dfs(l: number): boolean {
    for (const r of adjacency[l]!) {
      const next = matchRight[r]!;
      if (next === -1 || (dist[next] === dist[l]! + 1 && dfs(next))) {
        matchLeft[l] = r;
        matchRight[r] = l;
        return true;
      }
    }
    dist[l] = INF;
    return false;
  }

  let size = 0;
  while (bfs()) {
    for (let l = 0; l < leftCount; l++) {
      if (matchLeft[l] === -1 && dfs(l)) size++;
    }
  }
  return { matchLeft, matchRight, size };
}

/** True if no augmenting path exists (the matching is maximum). Used by tests (I3). */
export function isMaximum(adjacency: number[][], m: Matching): boolean {
  const seen = new Set<number>();
  function augment(l: number): boolean {
    for (const r of adjacency[l]!) {
      if (seen.has(r)) continue;
      seen.add(r);
      if (m.matchRight[r] === -1 || augment(m.matchRight[r]!)) return true;
    }
    return false;
  }
  for (let l = 0; l < adjacency.length; l++) {
    if (m.matchLeft[l] !== -1) continue;
    seen.clear();
    if (augment(l)) return false;
  }
  return true;
}
