import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  downloadAllParams,
  writeParam,
  writeBatchParams,
  parseParamFile,
  formatParamFile,
  subscribeParamStore,
  subscribeParamProgress,
  type Param,
  type ParamStore,
  type ParamProgress,
} from "../params";
import { fetchParamMetadata, type ParamMetadataMap } from "../param-metadata";
import { save, open } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

function asErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "unexpected error";
}

export type FilterMode = "all" | "modified" | "standard";

export function useParams(connected: boolean, vehicleType?: string) {
  const [store, setStore] = useState<ParamStore | null>(null);
  const [progress, setProgress] = useState<ParamProgress | null>(null);
  const [search, setSearch] = useState("");
  const [editingParam, setEditingParam] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [metadata, setMetadata] = useState<ParamMetadataMap | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const lastFetchedType = useRef<string | undefined>();
  const [staged, setStaged] = useState<Map<string, number>>(new Map());
  const [filterMode, setFilterMode] = useState<FilterMode>("standard");

  // Subscribe to param events
  useEffect(() => {
    let stopStore: (() => void) | null = null;
    let stopProgress: (() => void) | null = null;

    (async () => {
      stopStore = await subscribeParamStore(setStore);
      stopProgress = await subscribeParamProgress(setProgress);
    })();

    return () => {
      stopStore?.();
      stopProgress?.();
    };
  }, []);

  // Clear store on disconnect
  useEffect(() => {
    if (!connected) {
      setStore(null);
      setProgress(null);
      setEditingParam(null);
      setMetadata(null);
      setStaged(new Map());
      setFilterMode("all");
      lastFetchedType.current = undefined;
    }
  }, [connected]);

  // Fetch metadata when vehicle type becomes known
  useEffect(() => {
    if (!vehicleType || vehicleType === lastFetchedType.current) return;
    lastFetchedType.current = vehicleType;
    let cancelled = false;
    setMetadataLoading(true);
    fetchParamMetadata(vehicleType)
      .then((result) => {
        if (!cancelled) {
          setMetadata(result);
          if (result) {
            toast.success("Parameter descriptions loaded", {
              description: `${result.size} definitions`,
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.warning("Could not load parameter descriptions");
        }
      })
      .finally(() => {
        if (!cancelled) setMetadataLoading(false);
      });
    return () => { cancelled = true; };
  }, [vehicleType]);

  const paramList = useMemo(() => {
    if (!store) return [];
    return Object.values(store.params).sort((a, b) => a.name.localeCompare(b.name));
  }, [store]);

  const filteredParams = useMemo(() => {
    let list = paramList;

    // Filter by mode
    if (filterMode === "modified") {
      list = list.filter((p) => staged.has(p.name));
    } else if (filterMode === "standard") {
      list = list.filter((p) => {
        const meta = metadata?.get(p.name);
        return !meta?.userLevel || meta.userLevel === "Standard";
      });
    }

    // Filter by search
    if (search) {
      const term = search.toLowerCase();
      list = list.filter((p) => {
        if (p.name.toLowerCase().includes(term)) return true;
        if (metadata) {
          const meta = metadata.get(p.name);
          if (meta) {
            if (meta.description.toLowerCase().includes(term)) return true;
            if (meta.humanName.toLowerCase().includes(term)) return true;
          }
        }
        return false;
      });
    }

    return list;
  }, [paramList, search, metadata, filterMode, staged]);

  const groupedParams = useMemo(() => {
    const groups: Record<string, Param[]> = {};
    for (const param of filteredParams) {
      const prefix = param.name.split("_")[0] || param.name;
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(param);
    }
    return groups;
  }, [filteredParams]);

  const download = useCallback(async () => {
    if (!connected) {
      toast.error("Connect to vehicle first");
      return;
    }
    try {
      const result = await downloadAllParams();
      toast.success("Parameters downloaded", {
        description: `${Object.keys(result.params).length} parameters`,
      });
    } catch (err) {
      toast.error("Parameter download failed", { description: asErrorMessage(err) });
    }
  }, [connected]);

  const write = useCallback(
    async (name: string, value: number) => {
      if (!connected) {
        toast.error("Connect to vehicle first");
        return;
      }
      try {
        const confirmed = await writeParam(name, value);
        setStore((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            params: { ...prev.params, [name]: confirmed },
          };
        });
        toast.success(`${name} = ${confirmed.value}`);
      } catch (err) {
        toast.error(`Failed to write ${name}`, { description: asErrorMessage(err) });
      }
    },
    [connected],
  );

  const stage = useCallback(
    (name: string, value: number) => {
      // Don't stage if value matches current
      const current = store?.params[name]?.value;
      if (current !== undefined && current === value) {
        setStaged((prev) => {
          const next = new Map(prev);
          next.delete(name);
          return next;
        });
        return;
      }
      setStaged((prev) => {
        const next = new Map(prev);
        next.set(name, value);
        return next;
      });
    },
    [store],
  );

  const unstage = useCallback((name: string) => {
    setStaged((prev) => {
      const next = new Map(prev);
      next.delete(name);
      return next;
    });
  }, []);

  const unstageAll = useCallback(() => {
    setStaged(new Map());
  }, []);

  const applyStaged = useCallback(async () => {
    if (!connected || staged.size === 0) return;
    const entries: [string, number][] = Array.from(staged.entries());
    try {
      const results = await writeBatchParams(entries);
      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      // Remove successes from staged
      setStaged((prev) => {
        const next = new Map(prev);
        for (const r of succeeded) next.delete(r.name);
        return next;
      });

      if (failed.length === 0) {
        toast.success(`${succeeded.length} parameters written`);
      } else {
        toast.warning(`${succeeded.length} written, ${failed.length} failed`, {
          description: failed.map((r) => r.name).join(", "),
        });
      }
    } catch (err) {
      toast.error("Batch write failed", { description: asErrorMessage(err) });
    }
  }, [connected, staged]);

  const saveToFile = useCallback(async () => {
    if (!store) {
      toast.error("No parameters to save");
      return;
    }
    try {
      const path = await save({
        filters: [{ name: "Parameter File", extensions: ["param"] }],
        defaultPath: "params.param",
      });
      if (!path) return;
      const contents = await formatParamFile(store);
      await writeTextFile(path, contents);
      toast.success("Parameters saved", { description: path });
    } catch (err) {
      toast.error("Failed to save file", { description: asErrorMessage(err) });
    }
  }, [store]);

  const loadFromFile = useCallback(async () => {
    try {
      const path = await open({
        filters: [{ name: "Parameter File", extensions: ["param"] }],
        multiple: false,
      });
      if (!path) return;
      const contents = await readTextFile(path);
      const parsed = await parseParamFile(contents);
      const count = Object.keys(parsed).length;

      // Auto-stage values that differ from current store
      if (store) {
        let stagedCount = 0;
        setStaged((prev) => {
          const next = new Map(prev);
          for (const [name, value] of Object.entries(parsed)) {
            const current = store.params[name]?.value;
            if (current !== undefined && current !== value) {
              next.set(name, value);
              stagedCount++;
            }
          }
          return next;
        });
        toast.success(`Loaded ${count} params, ${stagedCount} differ from vehicle`, {
          description: "Review staged changes and click Apply",
        });
        if (stagedCount > 0) setFilterMode("modified");
      } else {
        toast.success(`Loaded ${count} parameters from file`);
      }
      return parsed;
    } catch (err) {
      toast.error("Failed to load file", { description: asErrorMessage(err) });
      return undefined;
    }
  }, [store]);

  return {
    store,
    progress,
    search,
    setSearch,
    editingParam,
    setEditingParam,
    editValue,
    setEditValue,
    paramList,
    filteredParams,
    groupedParams,
    download,
    write,
    saveToFile,
    loadFromFile,
    metadata,
    metadataLoading,
    staged,
    stage,
    unstage,
    unstageAll,
    applyStaged,
    filterMode,
    setFilterMode,
  };
}
