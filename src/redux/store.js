import { createStore } from 'redux';
import uuidv4 from 'uuid-v4';
import { parseFormula } from '../selectors/formulas/formulas';

const initialState = {
  tables: [{
    id: 'table0',
    name: 'table0',
    width: 6,
    height: 6,
    cells: [{
      id: 'cell0',
      name: 'Fred',
      formula: [{ value: 'foo' }],
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    }, {
      id: 'cell1',
      name: 'Sally',
      formula: [{ value: 'bar' }],
      x: 1,
      y: 0,
      width: 1,
      height: 1,
    }, {
      id: 'cell2',
      name: 'Wiremu',
      formula: [{ value: 'baz' }],
      x: 0,
      y: 1,
      width: 1,
      height: 1,
    }, {
      id: 'cell3',
      name: 'Tui',
      formula: [{ ref: 'cell2' }, { op: '+' }, { value: 'quux' }],
      x: 1,
      y: 1,
      width: 3,
      height: 4,
    }],
  }],
};

export const setFormula = (tableId, cellId, formula) => ({
  type: 'SET_CELL_FORMULA',
  payload: { tableId, cellId, stringFormula: formula },
});

export const deleteCell = (tableId, cellId) => ({
  type: 'DELETE_CELL',
  payload: { tableId, cellId },
});

const defaultCellForLocation = (cellId) => {
  const [, y, x] = cellId.split('_').map(Number);
  return {
    id: uuidv4(),
    name: cellId,
    formula: [],
    x: x - 1,
    y: y - 1,
    width: 1,
    height: 1,
  };
};

const rootReducer = (state, action) => {
  if (action.type === 'SET_CELL_FORMULA') {
    const { tableId, cellId, stringFormula } = action.payload;

    const existingTable = state.tables.find(({ id }) => id === tableId);
    const existingCell = existingTable.cells.find(({ id }) => id === cellId);

    const cell = existingCell || defaultCellForLocation(cellId);
    const newFormula = parseFormula(stringFormula);

    const table = {
      ...existingTable,
      cells: [
        ...existingTable.cells.filter(({ id }) => id !== cellId),
        {
          ...cell,
          ...newFormula,
        },
      ],
    };

    return {
      ...state,
      tables: [
        ...state.tables.filter(({ id }) => id !== tableId),
        table,
      ],
    };
  }

  if (action.type === 'DELETE_CELL') {
    // We're going to reset everything here. In the future we will want to
    // be less destructive. That is to say, if a cell is not referred to
    // in a table, don't modify that table.
    // I think "in the future" we will have a lot of state to keep track
    // of :-/
    const { tableId, cellId } = action.payload;

    const existingTable = state.tables.find(({ id }) => id === tableId);
    const existingCell = existingTable.cells.find(({ id }) => id === cellId);

    const cellName = existingCell.name;

    return {
      ...state,
      tables: state.tables.map(table => ({
        ...table,
        cells: table.cells.map((cell) => {
          if (cell.id === cellId) return undefined;
          return {
            ...cell,
            formula: cell.formula.map((term) => {
              if (term.ref && term.ref === cellId) {
                return { badRef: cellName };
              }
              return term;
            }),
          };
        }).filter(Boolean),
      })),
    };
  }
  return state;
};

const store = createStore(rootReducer, initialState);
export default store;
