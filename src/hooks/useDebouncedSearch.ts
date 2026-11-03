// src/hooks/useDebouncedSearch.ts
// Search box state for server-side search: `search` follows every keystroke;
// `query` (trimmed) is committed after a pause and is what goes into the API
// key. `onCommit` runs on each commit (lists reset to page 1). It must be
// stable (wrap it in useCallback).
'use client';
import { useEffect, useState } from 'react';
import { LIST_PAGE } from '@/config/list-page';

export function useDebouncedSearch(onCommit: () => void, delayMs: number = LIST_PAGE.searchDebounceMs) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const term = search.trim();
    if (term === query) return;
    const handle = setTimeout(() => {
      setQuery(term);
      onCommit();
    }, delayMs);
    return () => clearTimeout(handle);
  }, [search, query, delayMs, onCommit]);

  const clear = () => {
    setSearch('');
    setQuery('');
  };

  return { search, setSearch, query, clear };
}
