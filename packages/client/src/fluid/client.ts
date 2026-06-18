import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import {
  SharedTree,
  type ContainerSchema,
  type IFluidContainer,
  type TreeView,
} from "fluid-framework";
import {
  SyncBoardRoot,
  treeConfiguration,
  initialTree,
  type FluidInfoResponse,
} from "@syncboard/shared";
import { SERVICE_HTTP } from "../config.js";

const containerSchema = {
  initialObjects: { appTree: SharedTree },
} satisfies ContainerSchema;

export interface BoardConnection {
  container: IFluidContainer<typeof containerSchema>;
  view: TreeView<typeof SyncBoardRoot>;
  root: SyncBoardRoot;
}

let connecting: Promise<BoardConnection> | null = null;

async function fetchInfo(): Promise<FluidInfoResponse> {
  const res = await fetch(`${SERVICE_HTTP}/api/fluid/info`);
  if (!res.ok) throw new Error(`fluid/info failed: ${res.status}`);
  return (await res.json()) as FluidInfoResponse;
}

function portFromEndpoint(endpoint: string): number {
  try {
    return Number(new URL(endpoint).port) || 7070;
  } catch {
    return 7070;
  }
}

export function connectBoard(): Promise<BoardConnection> {
  if (connecting) return connecting;
  connecting = (async () => {
    const info = await fetchInfo();
    const client = new TinyliciousClient({
      connection: { port: portFromEndpoint(info.endpoint) },
    });
    const { container } = await client.getContainer(
      info.containerId,
      containerSchema,
      "2",
    );
    const view = container.initialObjects.appTree.viewWith(treeConfiguration);
    // The service initializes the container; only initialize if somehow empty.
    if (view.compatibility.canInitialize) {
      view.initialize(initialTree());
    }
    return { container, view, root: view.root };
  })();
  return connecting;
}
