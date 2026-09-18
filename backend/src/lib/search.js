// Builds a SQL search predicate for a normalized query term.
//
// Primary path: InnoDB FULLTEXT BOOLEAN MODE with per-token prefix wildcards
// (fast, index-backed). Works because `search_norm` is stored as space-
// separated, transliterated ASCII tokens, so a query prefix matches the start
// of a name / phone / email / code token.
//
// Fallback: for very short queries (no token reaches the fulltext minimum
// token length, default 3), use a LIKE substring scan so 1–2 char queries
// still return something.

const MIN_TOKEN = 3;

export function searchClause(qnorm, col) {
  if (!qnorm) return null;
  const tokens = qnorm.split(' ').filter((t) => t.length >= MIN_TOKEN);
  if (tokens.length) {
    const bool = tokens.map((t) => `+${t}*`).join(' ');
    return { clause: `MATCH(${col}) AGAINST (? IN BOOLEAN MODE)`, params: [bool] };
  }
  return { clause: `${col} LIKE CONCAT('%', ?, '%')`, params: [qnorm] };
}
