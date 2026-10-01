import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import App from "../App";

export default function ProjectEditor(props: Parameters<typeof App>[0]) {
  return (
    <ReactFlowProvider>
      <App {...props} />
    </ReactFlowProvider>
  );
}
