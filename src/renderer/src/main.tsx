import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { getTheme, applyTheme } from './lib/theme'
import './styles.css'

applyTheme(getTheme())

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
