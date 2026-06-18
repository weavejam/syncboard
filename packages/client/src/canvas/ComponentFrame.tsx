import { useEffect, useMemo, useRef } from "react";
// Vue runtime-only global build, inlined as text into the iframe srcdoc.
import vueRuntime from "vue/dist/vue.runtime.global.prod.js?raw";
import { isBridgeMsg, type SyncBoardRoot } from "@syncboard/shared";
import { StateBridge } from "../bridge/state-bridge.js";

interface Props {
  root: SyncBoardRoot;
  elementId: string;
  js: string;
  codeVersion: number;
}

function buildSrcDoc(js: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none';">
<style>html,body{margin:0;padding:0;height:100%;background:#fff;color:#111;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;} *{box-sizing:border-box;}</style>
</head>
<body>
<div id="app"></div>
<script>${vueRuntime}</script>
<script>${js}</script>
</body>
</html>`;
}

export function ComponentFrame({ root, elementId, js, codeVersion }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => buildSrcDoc(js), [js, codeVersion]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const bridge = new StateBridge(root, elementId, (msg) => {
      iframe.contentWindow?.postMessage(msg, "*");
    });

    const onMessage = (e: MessageEvent) => {
      // Sandboxed iframe origin is "null"; validate by source window instead.
      if (e.source !== iframe.contentWindow) return;
      if (!isBridgeMsg(e.data)) return;
      const msg = e.data;
      if (msg.t === "ready") {
        bridge.handleReady();
        bridge.start();
      } else if (msg.t === "patch") {
        bridge.handlePatch(msg.state);
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      bridge.dispose();
    };
    // Re-init bridge + listener whenever the iframe reloads (code change).
  }, [root, elementId, codeVersion]);

  return (
    <iframe
      ref={iframeRef}
      title={elementId}
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      className="w-full h-full border-0 bg-white"
    />
  );
}
