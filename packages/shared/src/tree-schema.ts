import {
  SchemaFactory,
  TreeViewConfiguration,
} from "fluid-framework";

/**
 * SharedTree schema for SyncBoard. Shared by client and service so the
 * collaboration contract has a single source of truth.
 */
const sf = new SchemaFactory("syncboard");

/** A single element on the board (position / size / meta). */
export class BoardElement extends sf.object("BoardElement", {
  id: sf.string,
  name: sf.string,
  x: sf.number,
  y: sf.number,
  width: sf.number,
  height: sf.number,
  z: sf.number,
  /** Bumped on every regeneration; drives iframe rebuild on clients. */
  codeVersion: sf.number,
  /** Short client id of the creator (display only). */
  createdBy: sf.string,
}) {}

/** Compiled component output for one element (key = element.id). */
export class CodeArtifact extends sf.object("CodeArtifact", {
  /** Compiled runtime JS (Vue render fn + setup). */
  js: sf.string,
  /** JSON string describing runtime state shape (field/type/default). */
  stateSchema: sf.string,
  codeVersion: sf.number,
  /** Latest source SFC used to compile this artifact. */
  sfcSource: sf.string,
  /** Deterministic compact summary of older user requests and design intent. */
  historySummary: sf.string,
  /** JSON array of the most recent raw history turns. */
  recentTurnsJson: sf.string,
}) {}

/**
 * Runtime state of one element (key = element.id). V1 stores the whole
 * reactive state as a single JSON string (last-write-wins).
 */
export class StateBlob extends sf.object("StateBlob", {
  json: sf.string,
}) {}

/** Active generation lease for one component. */
export class GenerationLock extends sf.object("GenerationLock", {
  elementId: sf.string,
  requestId: sf.string,
  ownerClientId: sf.string,
  /** thinking | compiling | writing */
  phase: sf.string,
  startedAt: sf.number,
  expiresAt: sf.number,
}) {}

export class BoardArray extends sf.array("BoardArray", BoardElement) {}
export class CodeMap extends sf.map("CodeMap", CodeArtifact) {}
export class StateMap extends sf.map("StateMap", StateBlob) {}
export class LockMap extends sf.map("LockMap", GenerationLock) {}

/** Container top-level node. */
export class SyncBoardRoot extends sf.object("SyncBoardRoot", {
  board: BoardArray,
  code: CodeMap,
  state: StateMap,
  locks: LockMap,
}) {}

/** Initial (empty) tree for a freshly created container. */
export const initialTree = (): SyncBoardRoot =>
  new SyncBoardRoot({ board: [], code: {}, state: {}, locks: {} });

export const treeConfiguration = new TreeViewConfiguration({
  schema: SyncBoardRoot,
});
