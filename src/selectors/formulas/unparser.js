import store from '../../redux/store';

import { canStartName, isNameChar } from './lexer';
import {
  getRefsById,
  lookupExpression,
  getContextIdForRefId,
  refParentId,
  translateExpr,
} from './selectors';

// Turning a stored raw formula back into a string.

const unparseName = (name) => {
  const toJoin = [];
  for (let i = 0; i < name.length; ++i) {
    const character = name[i];
    if (i === 0 && !canStartName(character)) {
      toJoin.push('\\');
    }
    if (i > 0 && !isNameChar(character)) {
      toJoin.push('\\');
    }
    toJoin.push(character);
  }
  return toJoin.join('');
};

const unparseRef = (id) => {
  const ref = getRefsById(store.getState())[id];
  if (!ref || !ref.name) throw new Error('ugh');
  return unparseName(ref.name);
};

const unparseObject = (object) => {
  if (object.length === 0) return '{}';
  const args = object.map(({ key, value }) => {
    const unparsedKey = unparseName(key);
    if (unparsedKey === value) return value;
    if (value.endsWith(`.${unparsedKey}`)) {
      // Make sure there is an even number (like zero) of backslashes
      // before that dot, so it is not part of some sneaky name...
      const upToKey = value.slice(0, -key.length - 1);
      const match = upToKey.match(/[\\]*$/);
      if (match.length % 2 === 0) return value;
    }
    return `${unparsedKey}: ${value}`;
  });
  return `{ ${args.join(', ')} }`;
};

export const unparseTerm = (term) => {
  if (term.lookup) return `${term.on}.${unparseName(term.lookup)}`;
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
  if (term.name) return unparseName(term.name);
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

  const firstBits = ref.name ? `${unparseName(ref.name)}:` : ':';
  const expressionString = formulaExpressionString(ref);
  return `${firstBits} ${expressionString}`;
};
