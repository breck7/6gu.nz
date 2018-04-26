import React, { PureComponent } from 'react';
import classNames from 'classnames';
import BaseCellComponent from './BaseCellComponent';
import { getType } from '../../selectors/formulas/tables';
import './CellComponent.css';

const defaultFormatter = (value, pushStack) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'boolean') {
    return (
      <input type="checkbox" checked={value} disabled />
    );
  }
  const ourType = getType(value);
  if (ourType === 'array') {
    return `[${value.arr.length}]`;
  }
  if (ourType === 'object') {
    const contentsStr = `{${Object.keys(value.byName).length}}`;
    if (value.template) {
      return (
        <div style={{ position: 'relative', zIndex: 0 }}>
          {contentsStr}
          <button onClick={pushStack} className="StackButton">+</button>
        </div>
      );
    }
    return contentsStr;
  }
  return JSON.stringify(value);
};

class CellValueComponent extends PureComponent {
  constructor(props) {
    super(props);
    this.pushStack = this.pushStack.bind(this);
  }

  getCellContents() {
    const { value } = this.props;
    if (!value) return { error: 'Value missing' }; // ???
    if (value.error) return { error: value.error };
    return {
      formattedValue: defaultFormatter(value.value, this.pushStack),
      override: value.override,
    };
  }

  pushStack(ev) {
    const { id, pushViewStack } = this.props;
    pushViewStack(id);
    ev.preventDefault();
  }

  render() {
    const { x, y, width, height, setSelection } = this.props;
    const { error, formattedValue, override } = this.getCellContents();
    const className = classNames(
      'CellValue',
      {
        CellValueError: error,
        CellValueOverride: override,
      },
    );
    const title = override ? 'Value overridden in call' : error;
    return (
      <BaseCellComponent
        x={x}
        y={y}
        width={width}
        height={height}
        className={className}
        setSelection={setSelection}
        title={title}
      >
        {formattedValue}
      </BaseCellComponent>
    );
  }
}

export default CellValueComponent;
