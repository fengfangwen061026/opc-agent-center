import React from 'react'
import ReactDOM from 'react-dom/client'
import '../../../packages/design-tokens/tokens.css'
import '@opc/ui/styles.css'
import '@xyflow/react/dist/style.css'
import './styles.css'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
