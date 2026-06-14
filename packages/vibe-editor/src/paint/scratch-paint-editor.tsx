// Thin wrapper that embeds the real scratch-paint <PaintEditor>. scratch-paint is a
// self-contained Redux + react-intl app, so it needs its own store (with the
// ScratchPaintReducer mounted under `scratchPaint`) and an IntlProvider — exactly how
// scratch-gui wires it in editor-state.tsx / gui.jsx.
//
// This module is loaded lazily (see PaintEditorPanel) so scratch-paint — which pulls
// in paper.js and touches the canvas at import time — is only evaluated in the browser
// when the paint tab is actually opened, never in the jsdom test path.
import { IntlProvider } from 'react-intl'
import { Provider } from 'react-redux'
import { combineReducers, createStore } from 'redux'
import PaintEditor, { ScratchPaintReducer, type PaintEditorProps } from 'scratch-paint'

const store = createStore(combineReducers({ scratchPaint: ScratchPaintReducer }))

const ScratchPaintEditor = (props: PaintEditorProps): JSX.Element => (
  <Provider store={store}>
    <IntlProvider locale="en" messages={{}}>
      <PaintEditor {...props} />
    </IntlProvider>
  </Provider>
)

export default ScratchPaintEditor
