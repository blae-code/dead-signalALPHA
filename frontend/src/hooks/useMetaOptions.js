import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

let _cache = null;
let _fetchPromise = null;

export function useMetaOptions() {
  const [options, setOptions] = useState(_cache);
  const [loading, setLoading] = useState(!_cache);

  const load = useCallback(async () => {
    if (_cache) {
      setOptions(_cache);
      setLoading(false);
      return;
    }
    if (_fetchPromise) {
      const data = await _fetchPromise;
      setOptions(data);
      setLoading(false);
      return;
    }
    setLoading(true);
    _fetchPromise = api.get('/meta/options').then(r => r.data).catch(() => null);
    const data = await _fetchPromise;
    _fetchPromise = null;
    if (data) {
      _cache = data;
      setOptions(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async () => {
    _cache = null;
    _fetchPromise = null;
    setLoading(true);
    try {
      const { data } = await api.get('/meta/options');
      _cache = data;
      setOptions(data);
    } catch {}
    setLoading(false);
  }, []);

  return { options, loading, refresh };
}
