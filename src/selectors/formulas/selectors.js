import { createSelector } from 'reselect';
import store, { SHEET, CELL } from '../../redux/store';
import { getNamedMember } from './tables';


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

export const getCellsById = createSelector(
  getCells,
  (cells) => {
    const ret = {};
    cells.forEach((cell) => { ret[cell.id] = cell; });
    return ret;
  },
);

export const getCellsBySheetIdHelper = createSelector(
  getCells,
  (cells) => {
    const ret = {};
    cells.forEach((cell) => {
      if (!ret[cell.sheetId]) ret[cell.sheetId] = [];
      ret[cell.sheetId].push(cell);
    });
    return ret;
  },
);

const getCellsByNameForSheetIdHelper = createSelector(
  getCells,
  (cells) => {
    const ret = {};
    cells.forEach((cell) => {
      if (!ret[cell.sheetId]) ret[cell.sheetId] = {};
      ret[cell.sheetId][cell.name] = cell;
    });
    return ret;
  },
);

export const getCellsByNameForSheetId = (state, sheetId) => {
  const cellsBySheetId = getCellsByNameForSheetIdHelper(state);
  return cellsBySheetId[sheetId] || {};
};

export const getSheetsById = createSelector(
  getSheets,
  (sheets) => {
    const ret = {};
    sheets.forEach((sheet) => { ret[sheet.id] = sheet; });
    return ret;
  },
);

export const getCellsBySheetId = (state, sheetId) => {
  const cellsBySheetId = getCellsBySheetIdHelper(state);
  return cellsBySheetId[sheetId] || [];
};

export const getSheetsByName = createSelector(
  getSheets,
  (sheets) => {
    const ret = {};
    sheets.forEach((sheet) => { ret[sheet.name] = sheet; });
    return ret;
  },
);


// Formula translation functions: Generic ways to iterate over a forumla's
// contents, applying a function to every element from the leaves up.

const getSheetIdForRefId = (refId, defaultSheetId) => {
  const refsById = getRefsById(store.getState());
  let ref = refsById[refId];
  if (ref && ref.type === CELL) ref = refsById[ref.sheetId];
  // TODO: TableCell -> Row -> Table -> Sheet (+ Col -> Table)
  if (!ref || ref.type !== SHEET) return defaultSheetId; // Not found
  return ref.id;
};


const translateCall = (term, sheetId, f) => {
  const call = translateTerm(term.call, sheetId, f);
  // Sometimes we're translating names -> refs, sometimes we are
  // translating refs -> printable strings etc :-(.
  const callRef = call.ref || term.call.ref;
  const callSheetId = getSheetIdForRefId(callRef, sheetId);
  const translatedArgs = term.args.map(({ ref, expr }) => ({
    ref: f(ref, callSheetId),
    expr: translateExpr(expr, sheetId, f),
  }));
  return f(
    {
      call,
      args: translatedArgs,
    },
    sheetId,
  );
};

const translateLookup = (term, sheetId, f) => {
  const on = translateTerm(term.on, sheetId, f);
  return f({ lookup: term.lookup, on }, sheetId);
};


const translateLookupIndex = (term, sheetId, f) => {
  const lookupIndex = translateExpr(term.lookupIndex, sheetId, f);
  const on = translateTerm(term.on, sheetId, f);
  return f({ lookupIndex, on }, sheetId);
};


export const translateTerm = (term, sheetId, f) => {
  if (term.lookup) return translateLookup(term, sheetId, f);
  if (term.lookupIndex) return translateLookupIndex(term, sheetId, f);
  if (term.name || term.ref) return f(term, sheetId);
  if ('value' in term || term.op) return f(term, sheetId);
  if (term.call) return translateCall(term, sheetId, f);
  if (term.expression) {
    return f(
      { expression: translateExpr(term.expression, sheetId, f) },
      sheetId,
    );
  }
  if (term.badFormula) return f(term, sheetId);
  throw new Error('Unknown term type');
};


export const translateExpr = (expr, sheetId, f) =>
  expr.map(term => translateTerm(term, sheetId, f));


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

const refEdges = (ref, sheetsById) => {
  if (ref.type === CELL) {
    return flattenExpr(ref.formula)
      .filter(term => term.ref && !refError(term, sheetsById))
      .map(term => term.ref);
  }
  if (ref.type !== SHEET) {
    throw new Error(`Unknown element type ${ref.type}`);
  }
  const sheetCells = getCellsBySheetId(store.getState(), ref.id);
  return sheetCells.map(({ id }) => id);
};

// Predecessor/successor relations in the formula/computation graph.
const getFormulaGraphs = createSelector(
  getRefs,
  getSheetsById,
  (refs, sheetsById) => {
    const forwardsGraph = {};
    const backwardsGraph = {};
    refs.forEach(({ id }) => {
      forwardsGraph[id] = [];
      backwardsGraph[id] = [];
    });
    refs.forEach((ref) => {
      refEdges(ref, sheetsById).forEach((jNodeId) => {
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


// Array of thing-ids in "compute-order". Things involved in circular ref
// problems are omitted for now.
export const getTopoSortedRefIds = createSelector(
  getFormulaGraphs,
  ({ backwardsGraph }) => {
    // Count numInArcs
    const numInArcsByCellId = {};
    Object.keys(backwardsGraph).forEach((id) => {
      numInArcsByCellId[id] = 0;
    });
    Object.values(backwardsGraph).forEach((jIds) => {
      jIds.forEach((jId) => { numInArcsByCellId[jId] += 1; });
    });

    // Get all the "leaf" formulas
    const ordering = Object.entries(numInArcsByCellId)
      .map(([id, numInArcs]) => numInArcs === 0 && id)
      .filter(Boolean);

    // Append anything only feeds leaf formulas
    for (let i = 0; i < ordering.length; ++i) {
      backwardsGraph[ordering[i]].forEach((jId) => {
        numInArcsByCellId[jId] -= 1;
        if (numInArcsByCellId[jId] === 0) {
          ordering.push(jId);
        }
      });
    }
    return ordering;
  },
);

// id -> order location. If ret[myId] < ret[yourId], your object definitely
// does not depend on mine.
const getTopoLocationById = createSelector(
  getTopoSortedRefIds,
  (ordering) => {
    const ret = {};
    ordering.forEach((id, index) => { ret[id] = index; });
    return ret;
  },
);


// Functions to translate into formulas into code to be evaluated

const expandSetItem = (k, expr, override = false) =>
  `try {
    globals[${JSON.stringify(k)}].push({
      value: ${expr}, override: ${override} });
  } catch (e) {
    globals[${JSON.stringify(k)}].push({ error: e.toString() });
  }`;

const expandPopItem = k => `globals[${JSON.stringify(k)}].pop();`;

const expandCall = (callTerm) => {
  const signature = callSignature(callTerm);
  const customArgs = callTerm.args.map(({ expr }) =>
    expandExpr(expr));
  const allArgs = [
    'globals',
    ...customArgs,
  ].join(', ');
  return `globals[${JSON.stringify(signature)}](${allArgs})`;
};

const expandExpr = (expr) => {
  const expandedTerms = expr.map(term =>
    expandTerm(term));
  return expandedTerms.join(' ');
};

const expandRef = term => `globals.formulaRef(globals, ${JSON.stringify(term.ref)})`;

const expandLookup = (term) => {
  const expandedOn = expandTerm(term.on);
  return `globals.getNamedMember(${expandedOn}, ${JSON.stringify(term.lookup)})`;
};

const refErrorMessage = name => `(${JSON.stringify(name)} + ' does not exist.')`;

const expandTerm = (term) => {
  if (term.lookup) return expandLookup(term);
  if (term.ref) return expandRef(term);
  if (term.call) return expandCall(term);
  if (term.op) return term.op;
  if ('value' in term) return JSON.stringify(term.value);
  if (term.expression) return `(${expandExpr(term.expression)})`;
  throw new Error(`unknown term type ${JSON.stringify(term)}`);
};


// Distinct spreadsheet "what-if" "calls" are translated into JS functions.
// We store them based on input and output ref ids.
const callSignature = (callTerm) => {
  if (!callTerm.call.ref) {
    throw new Error('Can only call refs');
  }
  const argRefs = callTerm.args.map(({ ref }) => ref.ref);
  const joinedRefs = argRefs.join(',');
  return `${callTerm.call.ref}(${joinedRefs})`;
};

// Functions used in formula evaluation.
// A note on the value/storage model:
//  - A cell's evaluation can either result in a value being produced or
//    an error being raised. Data "at rest" is either tagged as a value
//    or an error.
//  - Data "in flight" is all just values (because exceptions flow out of
//    band of the code we generate.)
//  - Functions like `iferror` and `iserror` will need to be macros or
//    something, probably :/
//
// A note on the function evaluation model:
//  - We have a stack of values (or errors) for every reference. The first
//    element is normally the "actual" value of the ref, subsequent values
//    are pushed/popped/used in "what-if" function calls.


// Get the "top of stack" value/error for a ref
const getRef = (globals, ref) => {
  const values = globals[ref];
  return values[values.length - 1];
};

// Unwrap a "ref at rest" into a "value in flight or exception"
const formulaRef = (globals, ref) => {
  const ret = getRef(globals, ref);
  if ('value' in ret) return ret.value;
  throw new Error(ret.error);
};

// Make a literal struct from a sheet's cells.
const sheetValue = (sheetId, globals) => {
  const sheetCells = getCellsBySheetId(store.getState(), sheetId);
  const ret = {
    byId: {},
    byName: {},
    template: sheetId,
  };
  sheetCells.forEach(({ id, name }) => {
    const cellContents = getRef(globals, id);
    ret.byId[id] = cellContents;
    ret.byName[name] = cellContents;
  });
  return ret;
};

// eslint-disable-next-line no-unused-vars
const pleaseThrow = (s) => { throw new Error(s); };

const refError = (term, sheetsById) => {
  if (term.badFormula) return 'Bad formula';
  if (term.name) return refErrorMessage(term.name);
  if (term.lookup && sheetsById[term.on.ref]) {
    const sheetName = sheetsById[term.on.ref].name;
    return refErrorMessage(`${sheetName}.${term.lookup}`);
  }
  return false;
};

const cellExpression = (cell, sheetsById) => {
  const allTerms = flattenExpr(cell.formula);
  const termErrors = allTerms
    .map(term => refError(term, sheetsById))
    .filter(Boolean);
  if (termErrors.length > 0) {
    return `pleaseThrow(${termErrors[0]})`;
  }
  return expandExpr(cell.formula);
};

const refExpression = (ref, sheetsById) => {
  if (ref.type === SHEET) {
    return `globals.sheetValue(${JSON.stringify(ref.id)}, globals)`;
  }
  if (ref.type !== CELL) {
    throw new Error(`unknown object type ${ref.type}`);
  }
  return cellExpression(ref, sheetsById);
};

const getRefExpressions = (refs, sheetsById) => {
  const ret = {};
  refs.forEach((ref) => {
    ret[ref.id] = refExpression(ref, sheetsById);
  });
  return ret;
};

export const getCellValuesById = createSelector(
  getRefs,
  getSheetsById,
  getTopoSortedRefIds,
  (refs, sheetsById, sortedRefIds) => {
    const globals = { getNamedMember, formulaRef, sheetValue, pleaseThrow };

    // Initialize circular refs and things that depend on them.
    refs.forEach(({ id }) => {
      globals[id] = [{ error: 'Error: Circular reference (or depends on one)' }];
    });

    // All expressions for cells and sheets
    const refExpressions = getRefExpressions(refs, sheetsById);

    // Write all functions
    const allFormulas = refs.map(({ formula }) => formula).filter(Boolean);
    const allTerms = [].concat(...allFormulas.map(flattenExpr));
    const allCalls = allTerms.filter(({ call }) => !!call);
    allCalls.forEach((callTerm) => {
      const signature = callSignature(callTerm);
      if (globals[signature]) return;
      globals[signature] = createFunction(callTerm, refExpressions);
    });

    // Evaluate every cell.
    sortedRefIds.forEach((id) => {
      // eslint-disable-next-line no-eval
      eval(expandSetItem(id, refExpressions[id]));
    });
    return getGlobalValues(globals, refs);
  },
);


const getGlobalValue = (globals, ref) => {
  if (ref.type === CELL) return getRef(globals, ref.id);
  if (ref.type !== SHEET) throw new Error(`unknown type ${ref.type}`);
  // A bit of a hack: we should try to re-insert sheets that contain
  // circular-ref cells into the topological order, probably.
  // There's no need to re-evaluate these.
  return sheetValue(ref.id, globals);
};

// Translates the computation data into something more palatable for UI
// consumption. No more stacks, mostly.
const getGlobalValues = (globals, refs) => {
  const ret = {};
  refs.forEach((ref) => { ret[ref.id] = getGlobalValue(globals, ref); });
  return ret;
};

// For figuring out what to run for functions: All things that depend on
// this cell, all things that this cell depends on.
const transitiveClosure = (ids, graph) => {
  let frontier = ids;
  const closure = new Set(frontier);
  while (frontier.length > 0) {
    const newFrontier = [];
    frontier.forEach((id) => {
      const nextNodes = graph[id] || [];
      nextNodes.forEach((nextNode) => {
        if (!closure.has(nextNode)) {
          closure.add(nextNode);
          newFrontier.push(nextNode);
        }
      });
    });
    frontier = newFrontier;
  }
  // Do not include source nodes in transitive closure, we usually want to
  // treat them specially.
  ids.forEach((id) => { closure.delete(id); });
  return closure;
};

// In functions we want to evaluate all cells "in between" the user-set
// refs and the output ref. That's the intersection of the things that
// depend on the in-refs and the things the out-ref depends on.
const setIntersection = (setA, setB) => {
  const intersection = new Set();
  setA.forEach((value) => {
    if (setB.has(value)) intersection.add(value);
  });
  return intersection;
};

const functionCellsInOrder = (call) => {
  const {
    forwardsGraph,
    backwardsGraph,
  } = getFormulaGraphs(store.getState());
  const argRefs = call.args.map(({ ref }) => ref.ref);
  const dependOnArgs = transitiveClosure(argRefs, backwardsGraph);
  const leadsToValue = transitiveClosure([call.call.ref], forwardsGraph);
  const cellsToEvaluate = setIntersection(dependOnArgs, leadsToValue);

  const topoLocationsById = getTopoLocationById(store.getState());
  return [...cellsToEvaluate].sort((id1, id2) =>
    topoLocationsById[id1] - topoLocationsById[id2]);
};

// Actually building the code to eval and making a real function.
const createFunction = (callTerm, refExpressions) => {
  const functionBits = [];

  // Code for adding the args to the global state
  callTerm.args.forEach(({ ref }, i) => {
    functionBits.push(expandSetItem(ref.ref, `v${i}`, true));
  });

  // Code for running the function
  const functionCells = functionCellsInOrder(callTerm);
  functionCells.forEach((id) => {
    functionBits.push(expandSetItem(id, refExpressions[id]));
  });

  // Prepare return value
  functionBits.push(`const ret = ${refExpressions[callTerm.call.ref]};`);

  // Pop all intermediate values from global state
  callTerm.args.forEach(({ ref }) => {
    functionBits.push(expandPopItem(ref.ref));
  });
  functionCells.forEach((id) => {
    functionBits.push(expandPopItem(id));
  });

  // return.
  functionBits.push('return ret;');

  // Construct the function
  const definition = functionBits.join('\n');
  const argNames = callTerm.args.map((arg, i) => `v${i}`);
  // eslint-disable-next-line no-new-func
  return Function('globals', ...argNames, definition);
};
