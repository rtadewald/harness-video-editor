import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import Projetos from './paginas/Projetos'
import Editor from './paginas/Editor'
import Calibragem from './paginas/Calibragem'
import Referencias from './paginas/Referencias'
import RevisaoReferencia from './paginas/RevisaoReferencia'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Projetos />} />
        <Route path="/p/:id" element={<Editor />} />
        <Route path="/referencias" element={<Referencias />} />
        <Route path="/calibragem" element={<Calibragem />} />
        <Route path="/calibragem/:id" element={<RevisaoReferencia />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
