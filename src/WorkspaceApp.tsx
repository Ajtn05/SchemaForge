import { lazy, Suspense, useEffect, useState } from "react";
import ProjectHome from "./components/ProjectHome";
import { useAccount } from "./store/useAccount";
import { useProject } from "./store/useProject";
const Editor = lazy(() => import("./components/ProjectEditor"));

export default function WorkspaceApp() {
  const [path, setPath] = useState(window.location.pathname);
  const account = useAccount();
  const theme = useProject((s) => s.theme);
  const scope = useProject((s) => s.scope);
  const activeId = useProject((s) => s.activeProjectId);
  const match = /^\/projects\/([^/]+)\/?$/.exec(path);
  const projectId = match?.[1] ?? null;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    const popstate = () => setPath(window.location.pathname);
    window.addEventListener("popstate", popstate);
    return () => window.removeEventListener("popstate", popstate);
  }, []);
  useEffect(() => {
    if (
      !account.loading &&
      projectId &&
      useProject.getState().activeProjectId !== projectId
    )
      useProject.getState().openProject(projectId);
  }, [projectId, activeId, scope, account.loading]);
  function navigate(url: string) {
    if (window.location.pathname !== url) window.history.pushState({}, "", url);
    setPath(url);
  }
  function open(id: string) {
    useProject.getState().openProject(id);
    navigate(`/projects/${id}`);
  }
  if (!account.loading && projectId && activeId === projectId)
    return (
      <>
        {account.error && scope !== "local" && (
          <div className="editor-sync-alert" role="alert">
            <span>{account.error}</span>
            <button className="button small" onClick={account.retry}>
              Retry sync
            </button>
          </div>
        )}
        <Suspense
          fallback={
            <div className="home-empty" role="status">
              Opening project…
            </div>
          }
        >
          <Editor
            key={`${scope}.${projectId}`}
            onHome={() => navigate("/")}
            onOpenProject={open}
            cloudStatus={account.syncStatus}
          />
        </Suspense>
      </>
    );
  return (
    <ProjectHome
      onOpen={open}
      account={account}
      missing={!!projectId && !account.loading}
    />
  );
}
