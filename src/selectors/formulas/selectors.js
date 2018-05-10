import { createSelector } from 'reselect';
import {
  topologicalOrdering,
  transitiveClosure,
  nodesInLargeStronglyConnectedComponents,
} from '../algorithms/algorithms';
import store, { ARRAY, ARRAY_CELL, SHEET, CELL } from '../../redux/store';

// Simple "get raw state" selectors (for the moment?)

export const getCells = state => state.cells;
export const getSheets = state => state.sheets;

export const getRefs = createSelector(
  getCells,
  getSheets,
  (cells, sheets) => cells.concat(sheets),
);

export const getRefsById = createSelector(
  getRefs,
  (refs) => {
    const ret = {};
    refs.forEach((ref) => { ret[ref.id] = ref; });
    return ret;
  },
);

export const getChildIdsByParentId = createSelector(
  getRefs,
  (refs) => {
    const ret = {};
    refs.forEach((ref) => { ret[ref.id] = []; });
    refs.forEach((ref) => {
      if (ref.sheetId) ret[ref.sheetId].push(ref.id);
      if (ref.arrayId) ret[ref.arrayId].push(ref.id);
    });
    return ret;
  },
);

export const getChildrenOfRef = (state, parentId) => {
  const childIds = getChildIdsByParentId(state)[parentId];
  const refsById = getRefsById(state);
  return childIds.map(id => refsById[id]);
};

export const transitiveChildren = (refId) => {
  // Sheet -> table -> cell etc. Not formula references.
  const childrenByParentId = getChildIdsByParentId(store.getState());
  const descendants = transitiveClosure([refId], childrenByParentId);
  descendants.add(refId);
  return descendants;
};

export const getCellsById = createSelector(
  getCells,
  (cells) => {
    const ret = {};
    cells.forEach((cell) => { ret[cell.id] = cell; });
    return ret;
  },
);

const getRefsByNameForContextIdHelper = createSelector(
  getRefs,
  (refs) => {
    const ret = {};
    refs.forEach((ref) => { ret[ref.id] = {}; });
    refs.forEach((ref) => {
      if (ref.sheetId) {
        ret[ref.sheetId][ref.name] = ref;
      }
      if (ref.arrayId) {
        ret[ref.arrayId][ref.index] = ref;
      }
    });
    return ret;
  },
);

export const getRefsByNameForContextId = (state, contextId) => {
  const refsByContextId = getRefsByNameForContextIdHelper(state);
  return refsByContextId[contextId] || {};
};

export const getSheetsById = createSelector(
  getSheets,
  (sheets) => {
    const ret = {};
    sheets.forEach((sheet) => { ret[sheet.id] = sheet; });
    return ret;
  },
);

export const getSheetsByName = createSelector(
  getSheets,
  (sheets) => {
    const ret = {};
    sheets.forEach((sheet) => { ret[sheet.name] = sheet; });
    return ret;
  },
);

export const refParentId = (ref) => {
  if (ref.type === SHEET) return undefined;
  if (ref.type === ARRAY) return ref.sheetId;
  if (ref.type === ARRAY_CELL) return ref.arrayId;
  if (ref.type !== CELL) throw new Error(`unknown ref type ${ref.type}`);
  return ref.sheetId;
};

export const refIdParentId = (refId) => {
  const refsById = getRefsById(store.getState());
  return refParentId(refsById[refId]);
};

const refHeight = (ref) => {
  if (ref === undefined) return 0;
  if (ref.type === SHEET) return 1;
  if (ref.type === ARRAY) return 2;
  if (ref.type === ARRAY_CELL) return 3;
  if (ref.type !== CELL) throw new Error(`unknown ref type ${ref.type}`);
  return 2;
};

export const rewriteRefTermToParentLookup = (innermostLookup) => {
  if (!innermostLookup.ref) throw new Error('Must pass lookup on `refId`');
  const refsById = getRefsById(store.getState());
  const ref = refsById[innermostLookup.ref];

  if (ref.type === ARRAY_CELL) {
    return { lookupIndex: [{ value: ref.index }], on: { ref: ref.arrayId } };
  }
  if (ref.type !== CELL && ref.type !== ARRAY) {
    throw new Error(`unknown parent type for ${ref.type}`);
  }
  return { lookup: ref.name, on: { ref: ref.sheetId } };
};


export const lookupExpression = (contextRefId, targetRefId) => {
  // We might "statically resolve" foo.bar[12] to a particular table cell
  // (and not depend on the whole column `bar` being evaluated first.)
  // This function turns a formula { ref } to that cell into a bunch of
  // index- and name-lookups.
  // This is kinda the opposite of the "subNames" procedure when parsing.
  const refsById = getRefsById(store.getState());
  let sourceContextRef = refsById[contextRefId];
  let targetContextRef = refsById[refIdParentId(targetRefId)];

  // Kinda ugly: The "rewrite" function replaces the `on` property with
  // a different `on` property. We return `ret.on` at the end.
  const ret = { on: { ref: targetRefId } };

  let innermostLookup = ret;
  while (refHeight(targetContextRef) > refHeight(sourceContextRef)) {
    // If we are a table-cell, the table-context will need to be provided
    // to anyone in a sheet
    innermostLookup.on = rewriteRefTermToParentLookup(innermostLookup.on);
    innermostLookup = innermostLookup.on;
    targetContextRef = refsById[refParentId(targetContextRef)];
  }
  while (refHeight(sourceContextRef) > refHeight(targetContextRef)) {
    // Other people's table context won't be useful to qualify a reference
    // to us if we're just a cell in a sheet.
    sourceContextRef = refsById[refParentId(sourceContextRef)];
  }
  while (targetContextRef !== sourceContextRef) {
    // Similar levels of context, but "far" from each other.
    innermostLookup.on = rewriteRefTermToParentLookup(innermostLookup.on);
    innermostLookup = innermostLookup.on;
    targetContextRef = refsById[refParentId(targetContextRef)];
    sourceContextRef = refsById[refParentId(sourceContextRef)];
  }
  return ret.on;
};

// Formula translation functions: Generic ways to iterate over a forumla's
// contents, applying a function to every element from the leaves up.

const isContext = (type) => {
  if (type === CELL) return false;
  if (type === ARRAY_CELL) return false;
  if (type === ARRAY) return false;
  if (type !== SHEET) throw new Error(`unknown type ${type}`);
  return true;
};

export const getContextIdForRefId = (refId, defaultContextId) => {
  const refsById = getRefsById(store.getState());
  let maybeContext = refsById[refId];
  while (maybeContext && !isContext(maybeContext.type)) {
    maybeContext = refsById[refParentId(maybeContext)];
  }
  if (!maybeContext) return defaultContextId;
  return maybeContext.id;
};


const translateCall = (term, contextId, f) => {
  const call = translateTerm(term.call, contextId, f);
  // Sometimes we're translating names -> refs, sometimes we are
  // translating refs -> printable strings etc :-(.
  const callRef = call.ref || term.call.ref;
  const callContextId = getContextIdForRefId(callRef, contextId);
  const translatedArgs = term.args.map(({ ref, expr }) => ({
    ref: translateTerm(ref, callContextId, f),
    expr: translateExpr(expr, contextId, f),
  }));
  return f(
    {
      call,
      args: translatedArgs,
    },
    contextId,
  );
};

const translateLookup = (term, contextId, f) => {
  const on = translateTerm(term.on, contextId, f);
  return f({ lookup: term.lookup, on }, contextId);
};


const translateLookupIndex = (term, contextId, f) => {
  const lookupIndex = translateExpr(term.lookupIndex, contextId, f);
  const on = translateTerm(term.on, contextId, f);
  return f({ lookupIndex, on }, contextId);
};

export const translateTerm = (term, contextId, f) => {
  if (term.lookup) return translateLookup(term, contextId, f);
  if ('lookupIndex' in term) return translateLookupIndex(term, contextId, f);
  if (term.name || term.ref) return f(term, contextId);
  if ('value' in term || term.op) return f(term, contextId);
  if (term.call) return translateCall(term, contextId, f);
  if (term.unary) {
    return f(
      { unary: term.unary, on: translateTerm(term.on, contextId, f) },
      contextId,
    );
  }
  if (term.expression) {
    return f(
      { expression: translateExpr(term.expression, contextId, f) },
      contextId,
    );
  }
  if (term.badFormula) return f(term, contextId);
  throw new Error('Unknown term type');
};


export const translateExpr = (expr, contextId, f) =>
  expr.map(term => translateTerm(term, contextId, f));


export const flattenExpr = (expr) => {
  // Get every element inside the formula (not just leaves)
  const ret = [];
  translateExpr(expr, null, (term) => {
    if (term === undefined) {
      throw new Error('ahoy!');
    }
    ret.push(term);
    return term;
  });
  return ret;
};

const refErrorMessage = name => `(${JSON.stringify(name)} + ' does not exist.')`;

export const refError = (term) => {
  if (term.badFormula) return '"Bad formula"';
  if (term.name) return refErrorMessage(term.name);
  if (term.lookup && term.on.ref) return refErrorMessage(term.lookup);
  return false;
};

const refEdges = (ref) => {
  if (ref.formula) {
    const refErrors = flattenExpr(ref.formula).filter(refError);
    if (refErrors.length) return [];
    return flattenExpr(ref.formula)
      .filter(term => term.ref)
      .map(term => term.ref);
  }
  return getChildIdsByParentId(store.getState())[ref.id];
};

// Predecessor/successor relations in the formula/computation graph.
export const getFormulaGraphs = createSelector(
  getRefs,
  (refs) => {
    const forwardsGraph = {};
    const backwardsGraph = {};
    refs.forEach(({ id }) => {
      forwardsGraph[id] = [];
      backwardsGraph[id] = [];
    });
    refs.forEach((ref) => {
      refEdges(ref).forEach((jNodeId) => {
        forwardsGraph[ref.id].push(jNodeId);
        backwardsGraph[jNodeId].push(ref.id);
      });
    });
    return {
      forwardsGraph, // keys depend on values
      backwardsGraph, // values depend on keys
    };
  },
);


const circularRefs = createSelector(
  getRefsById,
  getFormulaGraphs,
  (refsById, { backwardsGraph, forwardsGraph }) => {
    const circularRefRefIds = nodesInLargeStronglyConnectedComponents(
      forwardsGraph,
      backwardsGraph,
    );
    const ret = new Set();
    circularRefRefIds.forEach((refId) => {
      if (refsById[refId].formula) ret.add(refId);
    });
    return ret;
  },
);


// Array of thing-ids in "compute-order". Things involved in circular ref
// problems are omitted for now.
export const getTopoSortedRefIds = createSelector(
  getFormulaGraphs,
  circularRefs,
  ({ backwardsGraph }, badRefs) => topologicalOrdering(
    backwardsGraph,
    badRefs,
  ),
);

// id -> order location. If ret[myId] < ret[yourId], your object definitely
// does not depend on mine.
export const getTopoLocationById = createSelector(
  getTopoSortedRefIds,
  (ordering) => {
    const ret = {};
    ordering.forEach((id, index) => { ret[id] = index; });
    return ret;
  },
);
