const canStartName = c => c.match(/^[a-zA-Z_]$/u);
const isNameChar = c => c.match(/^[0-9a-zA-Z_]$/u);
const literalValues = new Set(['true', 'false']);

const lexName = (input, i) => {
  let j;
  for (j = i; j < input.length && isNameChar(input.charAt(j)); ++j);
  const str = input.substring(i, j);
  const token = literalValues.has(str) ?
    { value: JSON.parse(str) } :
    { name: str };
  return { matchEnd: j, token };
};

const lexNumber = (input, i) => {
  const numberChars = /^[0-9.]$/; // no 1e-10 etc for now
  let j;
  for (j = i; j < input.length && input.charAt(j).match(numberChars); ++j);
  return {
    matchEnd: j,
    token: { value: JSON.parse(input.substring(i, j)) },
  };
};

const lexString = (input, i) => {
  const delim = input.charAt(i);
  let j;
  for (j = i + 1; j < input.length; ++j) {
    const next = input.charAt(j);
    if (next === delim) {
      return {
        matchEnd: j + 1,
        token: { value: JSON.parse(input.substring(i, j + 1)) },
      };
    }
    if (next === '\\') ++j;
  }
  throw new Error('Unterminated string');
};

const chompWhitespace = (input, i) => {
  let j;
  for (j = i; j < input.length && input.charAt(j).match(/^\s$/); ++j);
  return { matchEnd: j };
};

const lexOp = (input, i) => {
  const twoCharOps = new Set(['**', '>=', '<=', '>>', '<<', '&&', '||']);
  if (i + 1 !== input.length) {
    const maybeOp = input.charAt(i) + input.charAt(i + 1);
    if (twoCharOps.has(maybeOp)) {
      return { matchEnd: i + 2, token: { op: maybeOp } };
    }
  }
  return { matchEnd: i + 1, token: { op: input.charAt(i) } };
};

const lexOne = (input, i) => {
  const next = input.charAt(i);
  if (next.match(/^[<>+\-*/%&|^!~]$/)) return lexOp(input, i);
  if (next === '(') return { matchEnd: i + 1, token: { open: '(' } };
  if (next === ')') return { matchEnd: i + 1, token: { close: ')' } };
  if (next === '[') return { matchEnd: i + 1, token: { openBracket: '[' } };
  if (next === ']') return { matchEnd: i + 1, token: { closeBracket: ']' } };
  if (canStartName(next)) return lexName(input, i);
  if (next.match(/^[0-9]$/)) return lexNumber(input, i);
  if (next === '"') return lexString(input, i);
  if (next.match(/^\s$/)) return chompWhitespace(input, i);
  if (next + input.charAt(i + 1) === '==') {
    // TODO: Precendence parsing and a deep-equality check.
    return { matchEnd: i + 2, token: { op: '==' } };
  }
  if (next === '=') return { matchEnd: i + 1, token: { assignment: next } };
  if (next === '.') return { matchEnd: i + 1, token: { lookup: next } };
  if (next === ',') return { matchEnd: i + 1, token: { comma: next } };
  throw new Error(`don't know what to do with '${next}'`);
};

// eslint-disable-next-line import/prefer-default-export
export const lexFormula = (input) => {
  let i = 0;
  const ret = [];
  while (i < input.length) {
    const { matchEnd, token } = lexOne(input, i);
    if (token) ret.push(token);
    i = matchEnd;
  }
  return ret;
};
