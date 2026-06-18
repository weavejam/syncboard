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
}) {}

/**
 * Runtime state of one element (key = element.id). V1 stores the whole
 * reactive state as a single JSON string (last-write-wins).
 */
export class StateBlob extends sf.object("StateBlob", {
  json: sf.string,
}) {}

export class BoardArray extends sf.array("BoardArray", BoardElement) {}
export class CodeMap extends sf.map("CodeMap", CodeArtifact) {}
export class StateMap extends sf.map("StateMap", StateBlob) {}

/** Container top-level node. */
export class SyncBoardRoot extends sf.object("SyncBoardRoot", {
  board: BoardArray,
  code: CodeMap,
  state: StateMap,
}) {}

/** Initial (empty) tree for a freshly created container. */
export const initialTree = (): SyncBoardRoot =>
  new SyncBoardRoot({ board: [], code: {}, state: {} });

export const treeConfiguration = new TreeViewConfiguration({
  schema: SyncBoardRoot,
});
