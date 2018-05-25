import store from '../../redux/store';

import {
  getRefsById,
  lookupExpression,
  getContextIdForRefId,
  refParentId,
  translateExpr,
} from './selectors';

// Turning a stored raw formula back into a string.

const unparseRef = (id) => {
  const ref = getRefsById(store.getState())[id];
  if (!ref || !ref.name) throw new Error('ugh');
  return ref.name;
};

const unparseObject = (object) => {
  if (object.length === 0) return '{}';
  const args = object.map(({ key, value }) => {
    if (key === value || value.slice(-key.length - 1) === `.${key}`) {
      return value;
    }
    return `${key}: ${value}`;
  });
  return `{ ${args.join(', ')} }`;
};

export const unparseTerm = (term) => {
  if (term.lookup) return `${term.on}.${term.lookup}`;
  if (term.lookupIndex) {
    const args = term.lookupIndex;
    return `${term.on}[${args}]`;
  }
  if (term.call) {
    const argsText = term.args
      .map(({ ref, expr }) => `${ref}: ${expr}`)
      .join(', ');
    return `${term.call}(${argsText})`;
  }
  if (term.expression) return `(${term.expression})`;
  if (term.badFormula) return term.badFormula;
  if (term.op) return term.op;
  if (term.ref) return unparseRef(term.ref);
  if (term.name) return term.name;
  if ('value' in term) return JSON.stringify(term.value);
  if (term.unary) return `${term.unary}${term.on}`;
  if (term.binary) return `${term.left} ${term.binary} ${term.right}`;
  if (term.array) return `[${term.array.join(', ')}]`;
  if (term.object) return unparseObject(term.object);
  throw new Error('Unknown term type');
};

const subRefsForLookupsInTerm = (term, contextId) => {
  if (term.ref) return lookupExpression(contextId, term.ref);
  return term;
};

const formulaExpressionString = (ref) => {
  if (!ref.formula) return [];
  const refParent = refParentId(ref);
  const lookupTerms = translateExpr(
    ref.formula,
    getContextIdForRefId(refParent, refParent),
    subRefsForLookupsInTerm,
  );
  return translateExpr(lookupTerms, null, unparseTerm);
};

export const stringFormula = (refId) => {
  const ref = getRefsById(store.getState())[refId];
  if (!ref) return '';

  const firstBits = ref.name ? `${ref.name}:` : ':';
  const expressionString = formulaExpressionString(ref);
  return `${firstBits} ${expressionString}`;
};
