import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BrowserRouter,
  Routes,
  Route
} from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import WriteInput from './WriteInput.jsx'
import ShotInput from './ShotInput.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/write" element={<WriteInput />} />
        <Route path="/shot" element={<ShotInput />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
