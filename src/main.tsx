import React from 'react'
import ReactDOM from 'react-dom/client'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { App } from './App'
import './styles.css'

// MapLibre needs a global worker; Vite handles the bundling automatically.
void maplibregl

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
