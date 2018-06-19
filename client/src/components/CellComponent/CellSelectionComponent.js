import React, { Fragment, PureComponent } from 'react';

class CellSelectionComponent extends PureComponent {
  render() {
    const { selected, x, y, width, height } = this.props;
    const style = {
      gridColumn: `${x + 1} / span ${width}`,
      gridRow: `${(2 * y) + 1} / span ${2 * height}`,
    };
    return (
      <Fragment>
        {selected && <div className="CellSelected" style={style} /> }
      </Fragment>
    );
  }
}

export default CellSelectionComponent;
