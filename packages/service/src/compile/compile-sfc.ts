import { parse, compileScript } from "@vue/compiler-sfc";
import * as esbuild from "esbuild";
import * as VueRuntime from "vue";

export interface CompileResult {
  /** Self-contained IIFE: mounts the Vue app and wires the state bridge. */
  js: string;
  /** JSON string describing runtime state shape (best-effort, informational). */
  stateSchema: string;
}

/**
 * A virtual `vue` module that re-exports everything from the global Vue
 * runtime build (which the iframe loads separately). This avoids bundling
 * Vue into every component artifact.
 */
function vueShim(): string {
  const ident = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
  const names = Object.keys(VueRuntime).filter(
    (k) => k !== "default" && ident.test(k),
  );
  const lines = names.map(
    (k) => `export const ${k} = __V[${JSON.stringify(k)}];`,
  );
  return `const __V = globalThis.Vue;\n${lines.join("\n")}\nexport default __V;\n`;
}

const VUE_SHIM = vueShim();

/**
 * Bridge bootstrap injected into every component. Runs inside the sandboxed
 * iframe: mounts the app and synchronizes its exposed `sharedState` with the
 * wrapper via postMessage (see bridge-protocol). Older generated apps that only
 * expose `state` remain supported as a fallback.
 */
function bootstrap(styles: string): string {
  return `
import __Component from 'virtual:component';
const __V = globalThis.Vue;
const { createApp, watch, nextTick } = __V;

(function injectStyles(){
  const css = ${JSON.stringify(styles)};
  if (css) { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }
})();

const __app = createApp(__Component);
const __vm = __app.mount('#app');
const __sharedState = __vm && (__vm.sharedState || __vm.state) ? (__vm.sharedState || __vm.state) : null;
const __localState = __vm && __vm.localState ? __vm.localState : null;
let __applyingRemote = false;

function __clone(o){ try { return JSON.parse(JSON.stringify(o)); } catch (e) { return {}; } }
function __send(state){
  parent.postMessage({ t: 'patch', v: 1, state, opId: Math.random().toString(36).slice(2) }, '*');
}
function __applyRemote(s){
  if (!__sharedState || s == null) return;
  __applyingRemote = true;
  for (const k of Object.keys(s)) { __sharedState[k] = s[k]; }
  nextTick(() => { __applyingRemote = false; });
}

if (__sharedState) {
  watch(__sharedState, () => { if (!__applyingRemote) __send(__clone(__sharedState)); }, { deep: true });
}

window.addEventListener('message', (e) => {
  if (e.source !== parent) return;
  const m = e.data;
  if (!m || m.v !== 1) return;
  if (m.t === 'snapshot') {
    if (m.state == null) { if (__sharedState) __send(__clone(__sharedState)); }
    else __applyRemote(m.state);
  } else if (m.t === 'patch') {
    __applyRemote(m.state);
  }
});

parent.postMessage({ t: 'ready', v: 1 }, '*');
`;
}

/** Best-effort: pull the literal passed to sharedState (or legacy state). */
function extractStateSchema(scriptContent: string): string {
  const m =
    scriptContent.match(
      /(?:const|let)\s+sharedState\s*=\s*reactive\s*\(\s*(\{[\s\S]*?\})\s*\)/,
    ) ??
    scriptContent.match(
      /(?:const|let)\s+state\s*=\s*reactive\s*\(\s*(\{[\s\S]*?\})\s*\)/,
    );
  return m ? JSON.stringify({ shape: m[1] }) : "{}";
}

export async function compileSfc(sfcSource: string): Promise<CompileResult> {
  const { descriptor, errors } = parse(sfcSource, { filename: "Comp.vue" });
  if (errors.length) {
    throw new Error(`SFC parse error: ${errors.map(String).join("; ")}`);
  }

  const id = "syncboard";
  const script = compileScript(descriptor, {
    id,
    inlineTemplate: true,
  });

  const styles = descriptor.styles.map((s) => s.content).join("\n");
  const stateSchema = extractStateSchema(script.content);

  const result = await esbuild.build({
    stdin: {
      contents: bootstrap(styles),
      resolveDir: process.cwd(),
      loader: "ts",
      sourcefile: "bootstrap.ts",
    },
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    write: false,
    legalComments: "none",
    plugins: [
      {
        name: "syncboard-virtuals",
        setup(build) {
          build.onResolve({ filter: /^virtual:component$/ }, () => ({
            path: "virtual:component",
            namespace: "sb",
          }));
          build.onResolve({ filter: /^vue$/ }, () => ({
            path: "vue",
            namespace: "sb",
          }));
          build.onLoad({ filter: /.*/, namespace: "sb" }, (args) => {
            if (args.path === "virtual:component") {
              return { contents: script.content, loader: "ts", resolveDir: process.cwd() };
            }
            return { contents: VUE_SHIM, loader: "js" };
          });
        },
      },
    ],
  });

  const out = result.outputFiles[0];
  if (!out) throw new Error("esbuild produced no output");
  return { js: out.text, stateSchema };
}
