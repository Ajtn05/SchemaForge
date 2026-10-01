import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, fetchProjects, syncProjects } from "../lib/supabase";
import {
  loadWorkspace,
  mergeProjects,
  type ProjectRecord,
} from "../lib/workspace";
import { useProject } from "./useProject";

export function useAccount() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [wantCloud, setWantCloud] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [syncStatus, setSyncStatus] = useState("All changes synced");
  const [retry, setRetry] = useState(0);
  const baseline = useRef<ProjectRecord[]>([]);
  const scope = useProject((s) => s.scope);
  const projects = useProject((s) => s.projects);
  const deletedIds = useProject((s) => s.deletedIds);
  const ownerId = session?.user.id;
  const queue = useRef(Promise.resolve());
  const previousOwner = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const authError = hash.get("error_description");
    if (authError) {
      setError(authError);
      window.history.replaceState({}, "", window.location.pathname);
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      setSession(next);
      setAuthReady(true);
      if (event === "SIGNED_IN" && next?.user.id !== previousOwner.current)
        setWantCloud(true);
      previousOwner.current = next?.user.id;
    });
    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!alive) return;
        setSession(data.session);
        if (error) setError(error.message);
        setAuthReady(true);
      })
      .catch((error: Error) => {
        if (alive) {
          setError(error.message);
          setAuthReady(true);
        }
      });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let alive = true;
    if (!wantCloud || !ownerId) {
      if (useProject.getState().scope !== "local")
        useProject.getState().setWorkspace("local", loadWorkspace());
      setLoading(false);
      return;
    }
    const target = `account.${ownerId}`;
    // Retrying an upload uses the current cache; it never replaces unsynced edits.
    if (useProject.getState().scope === target) return;
    // Do not leave another account's library visible if loading this account fails.
    if (useProject.getState().scope !== "local")
      useProject.getState().setWorkspace("local", loadWorkspace());
    setLoading(true);
    setError("");
    void fetchProjects(ownerId)
      .then((remote) => {
        if (!alive) return;
        const cache = loadWorkspace(target);
        baseline.current = remote;
        setSyncStatus("All changes synced");
        useProject.getState().setWorkspace(target, {
          projects: mergeProjects(remote, cache),
          deletedIds: cache.deletedIds,
        });
        setLoading(false);
      })
      .catch((error: Error) => {
        if (alive) {
          setError(`Could not open account projects: ${error.message}`);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [ownerId, wantCloud, authReady, retry]);

  useEffect(() => {
    if (!ownerId || scope !== `account.${ownerId}`) return;
    let alive = true;
    const changed = projects.filter(
      (p) =>
        !baseline.current.some(
          (other) => other.id === p.id && other.updatedAt === p.updatedAt,
        ),
    );
    if (!changed.length && !deletedIds.length) {
      setSyncStatus("All changes synced");
      return;
    }
    setSyncStatus("Waiting to sync…");
    const timeout = window.setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (!alive) return;
        setSyncStatus("Syncing…");
        try {
          await syncProjects(ownerId, changed, deletedIds);
          if (useProject.getState().scope !== scope) return;
          const next = new Map(baseline.current.map((p) => [p.id, p]));
          changed.forEach((p) => next.set(p.id, p));
          deletedIds.forEach((id) => next.delete(id));
          baseline.current = [...next.values()];
          if (alive) {
            setSyncStatus("All changes synced");
            setError("");
            useProject.getState().acknowledgeSync(changed, deletedIds);
          }
        } catch (error) {
          if (alive) {
            const cached = useProject.getState().saved;
            setSyncStatus(
              cached
                ? "Saved on device · sync failed"
                : "Sync failed · export a backup",
            );
            setError(
              `Account sync failed. ${cached ? "Your edits are saved on this device." : "Export a JSON backup to keep your edits."} ${error instanceof Error ? error.message : "Try again."}`,
            );
          }
        }
      });
    }, 600);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [ownerId, scope, projects, deletedIds, retry]);

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) setError(error.message);
    else {
      setWantCloud(false);
      setError("");
    }
  }
  return {
    session,
    loading: loading || !authReady,
    error,
    syncStatus,
    configured: !!supabase,
    switchWorkspace: (cloud: boolean) => {
      setWantCloud(cloud);
      setError("");
    },
    retry: () => setRetry((n) => n + 1),
    signOut,
  };
}
