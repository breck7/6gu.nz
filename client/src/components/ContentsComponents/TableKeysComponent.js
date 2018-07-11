import React, { Fragment } from 'react';
import { connect } from 'react-redux';

import CellNameComponent from '../CellComponent/CellNameComponent';
import CellSelectionComponent from '../CellComponent/CellSelectionComponent';
import ContentsBaseComponent, { mapDispatchToProps } from './ContentsBaseComponent';

import { getRefsById, refsAtPosition } from '../../selectors/formulas/selectors';
import { TABLE_COLUMN } from '../../redux/stateConstants';


class TableKeysComponent extends ContentsBaseComponent {
  static getDerivedStateFromProps(nextProps) {
    return { scrollX: nextProps.linkedScrollX };
  }

  maybeSelectedCell() {
    const { columns, context } = this.props;
    const { selX } = this.localSelection();
    if (columns) return columns[selX];
    return { ...context, selX };
  }

  scroll(coords) {
    const { scrollX } = coords;
    const { updateScroll } = this.props;
    updateScroll({ linkedScrollX: scrollX });
  }

  cellPosition(cell) {
    const { columns } = this.props;
    if (columns) return { y: 0, x: cell.index, width: 1, height: 1 };
    return { y: 0, x: cell.selX, width: 1, height: 1 };
  }

  locationSelected() {
    const { context } = this.props;
    if (context.formula) return undefined;
    const { selX } = this.localSelection();
    const { columns } = this.props;
    const col = columns[selX];
    if (col) return { type: col.type, index: selX };
    return { type: TABLE_COLUMN, index: selX };
  }

  bounds() {
    const { tableData, context, readOnly } = this.props;
    const appendExtraCell = (readOnly || context.formula) ? 0 : 1;
    return {
      xLB: 0,
      yLB: 0,
      yUB: 1,
      xUB: tableData.keys.length + appendExtraCell,
    };
  }

  localScale() {
    return { y: 2, x: 1 };
  }

  render() {
    const {
      tableData,
      viewSelected,
      viewWidth,
      viewOffsetX,
      viewOffsetY,
      outerViewHeight,
    } = this.props;
    const children = [];
    const { selX } = this.localSelection();
    const { scrollX } = this.state;
    const bounds = this.bounds();
    const numVisibleCells = viewWidth;
    for (
      let col = scrollX;
      col - scrollX < numVisibleCells && col < bounds.xUB;
      ++col
    ) {
      const worldCol = viewOffsetX + (col - scrollX);

      // labels
      const nameSelected = viewSelected && selX === col;
      if (nameSelected) {
        children.push((
          <CellSelectionComponent
            x={worldCol}
            height={outerViewHeight}
            y={viewOffsetY}
            width={1}
            selected={nameSelected}
            key="selection"
          />
        ));
      }
      children.push((
        <CellNameComponent
          x={worldCol}
          width={1}
          y={viewOffsetY}
          height={0.5}
          name={tableData.keys[col]}
          setSelection={this.setViewSelection}
          key={`name-${col}`}
        />
      ));
    }

    return (
      <Fragment>
        {super.render()}
        {children}
      </Fragment>
    );
  }
}

const mapStateToProps = (state, ownProps) => {
  const context = getRefsById(state)[ownProps.contextId];
  const { columns } = !context.formula && refsAtPosition(state)[ownProps.contextId];
  return { context, columns };
};

export default connect(
  mapStateToProps,
  mapDispatchToProps,
  null, // mergeProps
  { withRef: true },
)(TableKeysComponent);
